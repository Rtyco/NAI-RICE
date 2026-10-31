import { BrowserWindow, clipboard, ClipboardItem, ipcMain, shell } from 'electron';
import type { Library as LibraryData, Reference, Vibe } from '../src/core/domain/types';
import {
  exportQualitySchema,
  exportRequestSchema,
  generationFindRequestSchema,
} from '../src/core/validation/schemas';
import type {
  BorderLineMaskRequest,
  ImageDataSource,
  ImageInputRequest,
  MetadataVibeImport,
  OpenTarget,
  ReferenceImageSave,
  SourceImageAdd,
  SourceInputRequest,
} from '../src/shared/ipc';
import type { AccountService } from './services/AccountService';
import type { Exporter } from './services/Exporter';
import type { FilePicker } from './services/FilePicker';
import type { GenerationQueue } from './services/GenerationQueue';
import type { GenerationRequests } from './services/GenerationRequests';
import { toQueueView } from '../src/core/jobs/QueueView';
import type { TokenizerName } from '../src/core/prompts/PromptTokens';
import { toGenerationSummary } from '../src/core/model/generationSummary';
import type { BorderLineRequest } from '../src/core/model/lineFix';
import { findInRecord, type GenerationFindHit } from '../src/core/model/promptFields';
import { GENERATION_FIND_LIMIT } from '../src/shared/ipc';
import { setWindowZoom, windowState, ZOOM_STEP, zoomWindow } from './window';
import type { AppCache } from './services/AppCache';
import type { TokenizerFiles } from './services/TokenizerFiles';
import type { Library } from './services/Library';
import type { UpdateChecker } from './services/UpdateChecker';
import type { VibeFiles } from './services/VibeFiles';
import type { WorkspaceMover } from './services/WorkspaceMover';
import type { WorkspaceShell } from './services/WorkspaceShell';

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
  vibes: VibeFiles;
  tokenizers: TokenizerFiles;
  mover: WorkspaceMover;
};

export function registerIpc(services: AppServices): void {
  const {
    library,
    workspace,
    exporter,
    files,
    account,
    queue,
    requests,
    appCache,
    updates,
    vibes,
    tokenizers,
    mover,
  } = services;

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
  ipcMain.handle(
    'project:prepare-aid-input',
    (_event, projectId: string, file: string, kind: unknown) => {
      if (kind !== 'character' && kind !== 'vibe')
        throw new Error('참고 방식이 올바르지 않습니다.');
      return library.prepareAidInput(projectId, file, kind);
    },
  );
  ipcMain.handle('picture:add', (_event, dataUrl: string) => library.addPicture(dataUrl));
  ipcMain.handle('vibe:import-file', (_event, text: string, name: string) =>
    vibes.importText(text, name),
  );
  ipcMain.handle('vibe:import-metadata', (_event, request: MetadataVibeImport) =>
    vibes.importMetadata(request),
  );
  ipcMain.handle('vibe:encodings', (_event, vibe: Pick<Vibe, 'image' | 'encodingId'>) =>
    vibes.encodings(vibe),
  );
  ipcMain.handle('project:prepare-image-input', (_event, request: ImageInputRequest) =>
    library.prepareImageInput(request),
  );
  ipcMain.handle('source:add', (_event, request: SourceImageAdd) =>
    library.addSourceImage(request),
  );
  ipcMain.handle('source:add-mask', (_event, dataUrl: string) => library.addSourceMask(dataUrl));
  ipcMain.handle('source:add-border-line-mask', (_event, request: BorderLineMaskRequest) =>
    library.addBorderLineMask(request),
  );
  ipcMain.handle('source:add-reference', (_event, reference: Reference) =>
    library.addSourceFromReference(reference),
  );
  ipcMain.handle('source:delete', (_event, file: string) => library.deleteSource(file));
  ipcMain.handle('image:read-data-url', (_event, source: ImageDataSource) =>
    library.readImageDataUrl(source),
  );
  ipcMain.handle('source:prepare-input', (_event, request: SourceInputRequest) =>
    library.prepareSourceInput(request),
  );
  ipcMain.handle('source:prepare-border-line', (_event, request: BorderLineRequest) =>
    library.prepareBorderLineInput(request),
  );
  ipcMain.handle('project:delete-files', async (_event, id: string) => {
    await queue.cancelProject(id);
    await workspace.trashProject(id);
  });
  // 목록은 요약만. 정보 패널이 열 때 기록 하나를 통째로 받는다.
  ipcMain.handle('generations:list', async (_event, id: string) =>
    (await library.listGenerations(id)).map(toGenerationSummary),
  );
  ipcMain.handle('generations:get', (_event, id: string, generationId: string) =>
    library.findGeneration(id, generationId),
  );
  ipcMain.handle('generations:find', async (_event, request: unknown) => {
    const { projectIds, query } = generationFindRequestSchema.parse(request);
    const hits: GenerationFindHit[] = [];
    for (const id of projectIds)
      for (const record of await library.listGenerations(id)) {
        const hit = findInRecord(record, query);
        if (hit) hits.push(hit);
      }
    hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { hits: hits.slice(0, GENERATION_FIND_LIMIT), total: hits.length };
  });
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
  ipcMain.handle('file:open-vibe', () => files.pickVibe());
  ipcMain.handle('file:export-vibes', (_event, list: Vibe[]) => vibes.export(list));
  ipcMain.handle(
    'file:save-image-as',
    (_event, id: string, generationId: string, name: string, quality: unknown) =>
      exporter.saveImageAs(id, generationId, name, exportQualitySchema.parse(quality)),
  );
  ipcMain.handle('file:copy-image', async (_event, id: string, generationId: string) => {
    const png = new Uint8Array(await exporter.pngOf(id, generationId));
    await clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) }),
    ]);
  });
  ipcMain.handle('file:export-images', (_event, request: unknown) =>
    exporter.exportImages(exportRequestSchema.parse(request)),
  );
  ipcMain.handle('file:export-reference', (_event, reference: Reference) =>
    exporter.exportReference(reference),
  );
  ipcMain.handle('file:export-library', (_event, data: LibraryData) =>
    exporter.exportLibrary(data),
  );
  ipcMain.handle('file:export-project', (_event, data: LibraryData, projectId: string) =>
    exporter.exportProject(data, projectId),
  );

  ipcMain.handle('token:status', () => account.status());
  ipcMain.handle('token:add', (_event, name: string, token: string) =>
    account.addAccount(name, token),
  );
  ipcMain.handle('token:validate', () => account.validateStored());
  ipcMain.handle('token:rename', (_event, id: string, name: string) =>
    account.renameAccount(id, name),
  );
  ipcMain.handle('token:set-active', (_event, id: string) => account.setActive(id));
  ipcMain.handle('token:remove', (_event, id: string) => account.removeAccount(id));

  ipcMain.handle('generation:snapshot', () => toQueueView(queue.getSnapshot()));
  ipcMain.handle('generation:enqueue', (_event, request: unknown) => requests.enqueue(request));
  ipcMain.handle('generation:estimate', (_event, request: unknown) => requests.estimate(request));
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
  ipcMain.handle('storage:location', () => mover.info());
  ipcMain.handle('storage:pick-folder', () => mover.pickFolder());
  ipcMain.handle('storage:plan-move', (_event, folder: string) => mover.plan(folder));
  ipcMain.handle('storage:move', (_event, folder: string) => mover.move(folder));
  ipcMain.handle('storage:moved', () => mover.moved());
  ipcMain.handle('storage:finish-move', (_event, trash: boolean) => mover.finishMove(trash));

  ipcMain.handle('app:version', () => services.version);
  ipcMain.handle('app:check-update', () => updates.check());
  ipcMain.handle('app:load-tokenizer', (_event, name: TokenizerName) => tokenizers.load(name));
  // 화면이 보낸 주소는 GitHub 것만 연다.
  ipcMain.handle('app:open-release', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !url.startsWith('https://github.com/'))
      throw new Error('GitHub 주소만 열 수 있습니다.');
    await shell.openExternal(url);
  });
  ipcMain.on('app:zoom', (event, direction: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && (direction === 'in' || direction === 'out'))
      zoomWindow(window, direction === 'in' ? ZOOM_STEP : -ZOOM_STEP);
  });
  ipcMain.on('app:set-zoom', (event, level: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && typeof level === 'number' && Number.isFinite(level)) setWindowZoom(window, level);
  });
  ipcMain.handle('app:window-state', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('창을 찾을 수 없습니다.');
    return windowState(window);
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
