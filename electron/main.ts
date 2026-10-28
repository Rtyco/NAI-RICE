import { app, BrowserWindow, dialog, Menu, net, session, shell } from 'electron';
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
import { removeStaleTemporaryFiles, renamedFolder } from './services/fsUtils';
import { GenerationQueue } from './services/GenerationQueue';
import { GenerationRequests } from './services/GenerationRequests';
import { Library } from './services/Library';
import { TokenVault } from './services/TokenVault';
import { UpdateChecker } from './services/UpdateChecker';
import { VibeFiles } from './services/VibeFiles';
import { WorkspaceShell } from './services/WorkspaceShell';
import {
  anyWindowVisible,
  broadcast,
  createWindow,
  handleMediaProtocol,
  registerMediaScheme,
} from './window';

const APP_NAME = 'NAI RICE';
const freshRoot = !app.isPackaged && process.env.NAI_RICE_FRESH ? createFreshRoot() : undefined;

// 토큰·큐·화면 설정이 든 폴더. Chromium이 쓰기 시작하기 전에 옮겨야 한다.
app.setName(APP_NAME);
app.setPath(
  'userData',
  freshRoot
    ? path.join(freshRoot, 'userData')
    : renamedFolder(app.getPath('appData'), APP_NAME, 'reference-inpaint-desk'),
);
const moduleDirectory = __dirname;
registerMediaScheme();

async function createServices(): Promise<AppServices> {
  const userData = app.getPath('userData');
  const provider = new NovelAIProvider();
  const library = new Library(
    freshRoot
      ? path.join(freshRoot, 'library')
      : renamedFolder(app.getPath('documents'), APP_NAME, 'Reference Inpaint Desk'),
    app.getVersion(),
  );
  const account = new AccountService(
    new TokenVault(userData),
    provider,
    (status) => broadcast('token:status', status),
    () => library.settings?.accountRotation ?? true,
  );
  const queueFile = path.join(userData, 'generation-queue-v2.json');
  const queue = new GenerationQueue({
    persistencePath: queueFile,
    library,
    provider,
    token: (job) => account.tokenFor(job),
    emit: (snapshot) => broadcast('generation:queue-update', snapshot),
    onRecord: (record) => broadcast('generation:record-added', toGenerationSummary(record)),
    anlas: async (token) => (await account.refresh(token))?.anlas,
    requestDelayMs: () => library.settings?.requestDelayMs ?? 0,
    streaming: () => library.settings?.streaming ?? false,
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
