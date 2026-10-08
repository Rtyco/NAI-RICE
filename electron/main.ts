import { app, BrowserWindow, dialog, Menu, net, session, shell } from 'electron';
import path from 'node:path';
import { toGenerationSummary } from '../src/core/model/generationSummary';
import { NovelAIProvider } from '../src/core/providers/NovelAIProvider';
import { registerIpc, type AppServices } from './ipc';
import { AccountService } from './services/AccountService';
import { AppCache } from './services/AppCache';
import { Exporter } from './services/Exporter';
import { FilePicker } from './services/FilePicker';
import { removeStaleTemporaryFiles, renamedFolder } from './services/fsUtils';
import { GenerationQueue } from './services/GenerationQueue';
import { GenerationRequests } from './services/GenerationRequests';
import { Library } from './services/Library';
import { TokenVault } from './services/TokenVault';
import { UpdateChecker } from './services/UpdateChecker';
import { WorkspaceShell } from './services/WorkspaceShell';
import {
  anyWindowVisible,
  broadcast,
  confirmAnlasUse,
  createWindow,
  handleMediaProtocol,
  registerMediaScheme,
} from './window';

const APP_NAME = 'NAI RICE';

// 토큰·큐·화면 설정이 들어 있는 폴더. Chromium이 쓰기 시작하기 전에 옮겨야 한다.
app.setName(APP_NAME);
app.setPath('userData', renamedFolder(app.getPath('appData'), APP_NAME, 'reference-inpaint-desk'));
const moduleDirectory = __dirname;
registerMediaScheme();

/** 서비스를 만들어 서로 이어 붙인다. 서비스끼리 직접 만들지 않고 여기서만 조립한다. */
async function createServices(): Promise<AppServices> {
  const userData = app.getPath('userData');
  const provider = new NovelAIProvider();
  const library = new Library(
    renamedFolder(app.getPath('documents'), APP_NAME, 'Reference Inpaint Desk'),
  );
  const account = new AccountService(new TokenVault(userData), provider, (status) =>
    broadcast('token:status', status),
  );
  const queueFile = path.join(userData, 'generation-queue-v2.json');
  const queue = new GenerationQueue({
    persistencePath: queueFile,
    library,
    provider,
    token: () => account.token(),
    emit: (snapshot) => broadcast('generation:queue-update', snapshot),
    onRecord: (record) => broadcast('generation:record-added', toGenerationSummary(record)),
    anlas: async (token) => (await account.refresh(token))?.anlas,
    requestDelayMs: () => library.settings?.requestDelayMs ?? 0,
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
    requests: new GenerationRequests(queue, account, confirmAnlasUse),
    appCache: new AppCache(userData, queueFile, () => session.defaultSession),
    // 포터블 실행 파일은 electron-builder가 PORTABLE_EXECUTABLE_FILE을 넣어 준다.
    updates: new UpdateChecker(
      app.getVersion(),
      (url, init) => net.fetch(url, init),
      Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
    ),
  };
}

/** 지난 실행에서 남은 임시 파일과 휴지통으로 보내지 못한 결과를 정리한다. 실패해도 시작을 막지 않는다. */
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

/**
 * 맞춤법 검사기를 끈다. 프롬프트는 영어 태그라 쓸모가 없고, 켜 두면 시스템 언어 사전(한국어 약 11MB)을
 * 받아 실행 내내 열어 둔다. 화면의 spellcheck 옵션만으로는 세션이 사전을 받는 것을 막지 못해 언어 목록도 비운다.
 */
function disableSpellChecker(): void {
  session.defaultSession.setSpellCheckerEnabled(false);
  try {
    session.defaultSession.setSpellCheckerLanguages([]);
  } catch {
    // macOS는 언어 목록을 바꿀 수 없다. 끄기만 해도 사전을 받지 않는다.
  }
}

app.whenReady().then(async () => {
  disableSpellChecker();
  const services = await createServices();
  handleMediaProtocol(services.library);
  registerIpc(services);
  // File·Edit·View 메뉴 막대를 없앤다. 입력란의 복사·붙여넣기 단축키는 그대로 동작한다.
  Menu.setApplicationMenu(null);
  createWindow(APP_NAME, moduleDirectory);
  services.account.startAutoRefresh(anyWindowVisible);
  void cleanUpLeftovers(services);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(APP_NAME, moduleDirectory);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
