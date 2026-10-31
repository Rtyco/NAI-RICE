import { app, BrowserWindow, dialog, Menu, net, Notification, session, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { toGenerationSummary } from '../src/core/model/generationSummary';
import { buildFollowUpJobs } from '../src/core/model/lineFix';
import { estimateJobAnlas } from '../src/core/providers/NaiCost';
import { NovelAIProvider } from '../src/core/providers/NovelAIProvider';
import { registerIpc, type AppServices } from './ipc';
import { AccountService } from './services/AccountService';
import { AppCache } from './services/AppCache';
import { TokenizerFiles } from './services/TokenizerFiles';
import { Exporter } from './services/Exporter';
import { createFreshRoot, removeFreshRoot } from './services/freshData';
import { FilePicker } from './services/FilePicker';
import { atomicWrite, removeStaleTemporaryFiles, renamedFolder } from './services/fsUtils';
import { GenerationQueue } from './services/GenerationQueue';
import { GenerationRequests } from './services/GenerationRequests';
import { Library } from './services/Library';
import { QueueNotifier, type QueueDone } from './services/QueueNotifier';
import { TokenVault } from './services/TokenVault';
import { UpdateChecker } from './services/UpdateChecker';
import { VibeFiles } from './services/VibeFiles';
import { readLocation, writeLocation } from './services/WorkspaceLocation';
import { WorkspaceMover } from './services/WorkspaceMover';
import { WorkspaceShell } from './services/WorkspaceShell';
import {
  anyWindowVisible,
  broadcast,
  createWindow,
  handleMediaProtocol,
  registerMediaScheme,
  rememberZoom,
} from './window';

const APP_NAME = 'NAI RICE';
// electron-builder.yml의 appId. 없으면 Windows 알림이 뜨지 않는다.
const APP_ID = 'io.nairice.app';
const freshRoot = !app.isPackaged && process.env.NAI_RICE_FRESH ? createFreshRoot() : undefined;

// 토큰·큐·화면 설정이 든 폴더. Chromium이 쓰기 시작하기 전에 옮겨야 한다.
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
app.setPath(
  'userData',
  freshRoot
    ? path.join(freshRoot, 'userData')
    : renamedFolder(app.getPath('appData'), APP_NAME, 'reference-inpaint-desk'),
);
const moduleDirectory = __dirname;
registerMediaScheme();

function showQueueProgress(value: number | null, paused: boolean): void {
  for (const window of BrowserWindow.getAllWindows())
    window.setProgressBar(value ?? -1, { mode: paused ? 'paused' : 'normal' });
}

function notifyQueueDone(done: QueueDone): void {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window || window.isFocused()) return;
  window.flashFrame(true);
  window.once('focus', () => window.flashFrame(false));
  if (!Notification.isSupported()) return;
  const notice = new Notification({
    title: APP_NAME,
    body: `생성 ${done.completed}장을 마쳤습니다.${done.failed ? ` 실패 ${done.failed}장` : ''}`,
  });
  notice.on('click', () => {
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  notice.show();
}

const defaultRoot = (): string => path.join(app.getPath('documents'), APP_NAME);

/** 고른 위치를 찾을 수 없으면(빼 둔 외장 드라이브 등) 다시 찾거나 기본 위치로 연다. */
async function workspaceRoot(userData: string): Promise<string> {
  if (freshRoot) return path.join(freshRoot, 'library');
  const saved = readLocation(userData);
  while (saved.root && !existsSync(saved.root)) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: APP_NAME,
      message: '작업 폴더를 찾을 수 없습니다.',
      detail: saved.root,
      buttons: ['다시 찾기', '기본 위치로 열기', '끝내기'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 2) {
      app.exit(0);
      throw new Error('작업 폴더 없이 끝냈습니다.');
    }
    if (response === 1) {
      await writeLocation(userData, {});
      saved.root = undefined;
    }
  }
  return saved.root ?? renamedFolder(app.getPath('documents'), APP_NAME, 'Reference Inpaint Desk');
}

function zoomMemory(userData: string) {
  const file = path.join(userData, 'window-zoom.json');
  return {
    load: () => {
      try {
        const level = (JSON.parse(readFileSync(file, 'utf8')) as { level?: unknown }).level;
        return typeof level === 'number' && Number.isFinite(level) ? level : 0;
      } catch {
        return 0;
      }
    },
    save: (level: number) =>
      void atomicWrite(file, JSON.stringify({ level })).catch(() => undefined),
  };
}

async function createServices(): Promise<AppServices> {
  const userData = app.getPath('userData');
  const provider = new NovelAIProvider();
  const library = new Library(await workspaceRoot(userData), app.getVersion());
  const account = new AccountService(
    new TokenVault(userData),
    provider,
    (status) => broadcast('token:status', status),
    () => library.settings?.accountRotation ?? true,
  );
  const queueFile = path.join(userData, 'generation-queue-v2.json');
  const notifier = new QueueNotifier({
    progress: showQueueProgress,
    finished: (done) => {
      if (library.settings?.notifyWhenDone ?? true) notifyQueueDone(done);
    },
  });
  const queue = new GenerationQueue({
    persistencePath: queueFile,
    library,
    provider,
    token: (job) => account.tokenFor(job),
    emit: (snapshot) => {
      broadcast('generation:queue-update', snapshot);
      notifier.update(snapshot);
    },
    onRecord: (record) => broadcast('generation:record-added', toGenerationSummary(record)),
    anlas: async (token) => (await account.refresh(token))?.anlas,
    requestDelayMs: () => library.settings?.requestDelayMs ?? 0,
    streaming: () => library.settings?.streaming ?? false,
    finishedKept: () => library.settings?.keepFinishedJobs ?? 300,
    maxAttempts: () => (library.settings?.requestRetries ?? 3) + 1,
    requestTimeoutMs: () => (library.settings?.requestTimeoutSec ?? 180) * 1000,
    onPreview: (preview) => broadcast('generation:preview', preview),
    followUps: async (job, records) => {
      const jobs = await buildFollowUpJobs(job, records, {
        prepareImageInput: (request) => library.prepareImageInput(request),
        prepareBorderLineInput: (request) => library.prepareBorderLineInput(request),
      });
      return { jobs, estimates: jobs.map((item) => estimateJobAnlas(item, account.latest)) };
    },
  });
  await queue.initialize();
  return {
    version: app.getVersion(),
    library,
    workspace: new WorkspaceShell(library, shell),
    exporter: new Exporter(library, dialog),
    files: new FilePicker(dialog),
    account,
    queue,
    requests: new GenerationRequests(queue, account, library),
    appCache: new AppCache(userData, queueFile, () => session.defaultSession),
    vibes: new VibeFiles(library, dialog),
    mover: new WorkspaceMover({
      userData,
      root: library.root,
      defaultRoot: defaultRoot(),
      movable: !freshRoot,
      queue,
      dialog,
      shell,
      progress: (progress) => broadcast('storage:move-progress', progress),
      restart: () => {
        app.relaunch();
        app.exit(0);
      },
    }),
    tokenizers: new TokenizerFiles(path.join(userData, 'Tokenizers'), (url, init) =>
      net.fetch(url, init),
    ),
    // electron-builder가 포터블 실행 파일에 넣어 준다.
    updates: new UpdateChecker(
      app.getVersion(),
      (url, init) => net.fetch(url, init),
      Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
    ),
  };
}

/** 실패해도 시작을 막지 않는다. */
async function cleanUpLeftovers(services: AppServices): Promise<void> {
  try {
    await removeStaleTemporaryFiles([
      app.getPath('userData'),
      ...(await services.library.temporaryFileFolders()),
    ]);
    await services.workspace.retryLeftoverTrash();
    await services.appCache.removeDictionaries();
  } catch (error) {
    console.warn('남은 임시 파일을 정리하지 못했습니다.', error);
  }
}

/** 켜 두면 시스템 언어 사전(한국어 약 11MB)을 받아 계속 열어 둔다. 화면의 spellcheck만으로는 막지 못해 언어 목록도 비운다. */
function disableSpellChecker(): void {
  session.defaultSession.setSpellCheckerEnabled(false);
  try {
    session.defaultSession.setSpellCheckerLanguages([]);
  } catch {
    // macOS는 언어 목록을 바꿀 수 없지만 끄기만 해도 받지 않는다.
  }
}

/** 처리기가 없으면 Electron은 모든 권한 요청을 허락한다. 화면은 프롬프트 복사의 클립보드 쓰기만 쓴다. */
function allowOnlyClipboardWrite(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  );
}

app
  .whenReady()
  .then(async () => {
    disableSpellChecker();
    allowOnlyClipboardWrite();
    const services = await createServices();
    handleMediaProtocol(services.library);
    registerIpc(services);
    // 입력란의 복사·붙여넣기 단축키는 메뉴 없이도 동작한다.
    Menu.setApplicationMenu(null);
    rememberZoom(zoomMemory(app.getPath('userData')));
    createWindow(APP_NAME, moduleDirectory);
    services.account.startAutoRefresh(anyWindowVisible);
    void cleanUpLeftovers(services);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(APP_NAME, moduleDirectory);
    });
  })
  // 창을 열기 전에 실패하면 보이지 않는 프로세스만 남는다.
  .catch((error: unknown) => {
    dialog.showErrorBox(
      `${APP_NAME}를 시작할 수 없습니다`,
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });

if (freshRoot) app.on('will-quit', () => removeFreshRoot(freshRoot));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
