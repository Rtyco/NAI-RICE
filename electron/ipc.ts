import { BrowserWindow, ipcMain, shell } from 'electron';
import type { Library as LibraryData, Reference } from '../src/core/domain/types';
import type { ExportRequest, OpenTarget, ReferenceImageSave } from '../src/shared/ipc';
import type { AccountService } from './services/AccountService';
import type { Exporter } from './services/Exporter';
import type { FilePicker } from './services/FilePicker';
import type { GenerationQueue } from './services/GenerationQueue';
import type { GenerationRequests } from './services/GenerationRequests';
import { toQueueView } from '../src/core/jobs/QueueView';
import { toGenerationSummary } from '../src/core/model/generationSummary';
import type { AppCache } from './services/AppCache';
import type { Library } from './services/Library';
import type { UpdateChecker } from './services/UpdateChecker';
import type { WorkspaceShell } from './services/WorkspaceShell';

/** IPC 처리기가 부르는 서비스. main.ts가 만들어 넘긴다. */
export type AppServices = {
  version: string;
  library: Library;
  workspace: WorkspaceShell;
  exporter: Exporter;
  files: FilePicker;
  account: AccountService;
  queue: GenerationQueue;
  requests: GenerationRequests;
  appCache: AppCache;
  updates: UpdateChecker;
};

/** 렌더러가 부를 수 있는 기능을 등록한다. 각 처리기는 해당 서비스에 넘기기만 한다. */
export function registerIpc(services: AppServices): void {
  const { library, workspace, exporter, files, account, queue, requests, appCache, updates } =
    services;

  ipcMain.handle('library:load', () => library.load());
  ipcMain.handle('library:save', (_event, data: LibraryData) => library.save(data));
  ipcMain.handle('reference:save-images', (_event, request: ReferenceImageSave) =>
    library.saveReferenceImages(request.referenceId, request),
  );
  ipcMain.handle('reference:read-images', (_event, reference: Reference) =>
    library.readReferenceImages(reference),
  );
  ipcMain.handle('reference:copy-files', (_event, fromId: string, toId: string) =>
    library.copyReferenceFiles(fromId, toId),
  );
  ipcMain.handle('reference:delete-files', (_event, id: string) => workspace.trashReference(id));
  ipcMain.handle('project:prepare-inputs', (_event, projectId: string, reference: Reference) =>
    library.prepareInputs(projectId, reference),
  );
  ipcMain.handle('project:delete-files', async (_event, id: string) => {
    await queue.cancelProject(id);
    await workspace.trashProject(id);
  });
  // 목록에는 요약만 보내고, 생성 정보 패널이 열 때 기록 하나를 통째로 받는다.
  ipcMain.handle('generations:list', async (_event, id: string) =>
    (await library.listGenerations(id)).map(toGenerationSummary),
  );
  ipcMain.handle('generations:get', (_event, id: string, generationId: string) =>
    library.findGeneration(id, generationId),
  );
  ipcMain.handle(
    'generations:delete',
    (_event, id: string, generationIds: string[], options?: { permanent?: boolean }) =>
      workspace.deleteGenerations(id, generationIds, options?.permanent === true),
  );
  ipcMain.handle('library:open', (_event, target: OpenTarget) => workspace.open(target));
  ipcMain.handle('library:show-generation', (_event, id: string, generationId: string) =>
    workspace.showGeneration(id, generationId),
  );

  ipcMain.handle('file:open-json', (_event, title: string) =>
    files.pickJson(title || 'JSON 파일 선택'),
  );
  ipcMain.handle('file:save-json', (_event, data: unknown, name: string, title: string) =>
    exporter.saveJson(data, name, title || 'JSON 파일 저장'),
  );
  ipcMain.handle('file:open-image', () => files.pickImage());
  ipcMain.handle(
    'file:save-image-as',
    (_event, id: string, generationId: string, name: string, quality: number) =>
      exporter.saveImageAs(id, generationId, name, quality),
  );
  ipcMain.handle('file:export-images', (_event, request: ExportRequest) =>
    exporter.exportImages(request),
  );
  ipcMain.handle('file:export-reference', (_event, reference: Reference) =>
    exporter.exportReference(reference),
  );
  ipcMain.handle('file:export-library', (_event, data: LibraryData) =>
    exporter.exportLibrary(data),
  );

  ipcMain.handle('token:status', () => account.status());
  ipcMain.handle('token:save-and-validate', (_event, token: string) =>
    account.saveAndValidate(token),
  );
  ipcMain.handle('token:validate', () => account.validateStored());
  ipcMain.handle('token:remove', () => account.remove());

  // 화면에는 프롬프트·설정을 뺀 가벼운 큐만 보낸다.
  ipcMain.handle('generation:snapshot', () => toQueueView(queue.getSnapshot()));
  ipcMain.handle('generation:enqueue', (_event, request: unknown) => requests.enqueue(request));
  ipcMain.handle('generation:pause', async () => toQueueView(await queue.pause()));
  ipcMain.handle('generation:resume', async () => toQueueView(await queue.resume()));
  ipcMain.handle('generation:cancel', async (_event, jobId?: string) =>
    toQueueView(await queue.cancel(jobId)),
  );
  ipcMain.handle('generation:retry-failed', async () => toQueueView(await queue.retryFailed()));
  ipcMain.handle('generation:clear-finished', async () => toQueueView(await queue.clearFinished()));

  ipcMain.handle('storage:usage', async () => ({
    ...(await library.usage()),
    app: await appCache.usage(),
  }));
  ipcMain.handle('storage:measure', (_event, id: string, generationIds: string[]) =>
    library.measureGenerations(id, generationIds),
  );
  ipcMain.handle('storage:inspect', async (_event, id: string) => {
    const { orphanFiles, orphanBytes, missingRecords } = await library.inspectProject(id);
    return { orphanFiles, orphanBytes, missingRecords };
  });
  ipcMain.handle('storage:repair', (_event, id: string) => workspace.repairProject(id));
  ipcMain.handle('storage:clear-cache', () => appCache.clear());

  ipcMain.handle('app:version', () => services.version);
  ipcMain.handle('app:check-update', () => updates.check());
  // 화면이 보낸 주소는 GitHub 것만 연다.
  ipcMain.handle('app:open-release', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !url.startsWith('https://github.com/'))
      throw new Error('GitHub 주소만 열 수 있습니다.');
    await shell.openExternal(url);
  });
  ipcMain.on('app:titlebar', (event, colors: unknown) => {
    const hex = /^#[0-9a-f]{6}$/i;
    const { color, symbolColor } = (colors ?? {}) as Record<string, unknown>;
    if (typeof color !== 'string' || typeof symbolColor !== 'string') return;
    if (!hex.test(color) || !hex.test(symbolColor)) return;
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setTitleBarOverlay({ color, symbolColor });
    window?.setBackgroundColor(color);
  });
}
