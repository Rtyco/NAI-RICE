import { contextBridge, ipcRenderer } from 'electron';
import type { GenerationSummary, QueueView } from '../src/core/domain/types';
import type {
  DesktopApi,
  GenerationPreview,
  TokenStatus,
  WindowState,
  WorkspaceMoveProgress,
} from '../src/shared/ipc';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: DesktopApi = {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: (library) => ipcRenderer.invoke('library:save', library),
  saveReferenceImages: (request) => ipcRenderer.invoke('reference:save-images', request),
  readReferenceImages: (reference) => ipcRenderer.invoke('reference:read-images', reference),
  copyReferenceFiles: (fromId, toId) => ipcRenderer.invoke('reference:copy-files', fromId, toId),
  deleteReferenceFiles: (id) => ipcRenderer.invoke('reference:delete-files', id),
  prepareAidInput: (projectId, file, kind) =>
    ipcRenderer.invoke('project:prepare-aid-input', projectId, file, kind),
  addPicture: (dataUrl) => ipcRenderer.invoke('picture:add', dataUrl),
  importVibeFile: (text, name) => ipcRenderer.invoke('vibe:import-file', text, name),
  importMetadataVibes: (request) => ipcRenderer.invoke('vibe:import-metadata', request),
  vibeEncodings: (vibe) => ipcRenderer.invoke('vibe:encodings', vibe),
  prepareInputs: (projectId, reference) =>
    ipcRenderer.invoke('project:prepare-inputs', projectId, reference),
  prepareImageInput: (request) => ipcRenderer.invoke('project:prepare-image-input', request),
  addSourceImage: (request) => ipcRenderer.invoke('source:add', request),
  addSourceMask: (dataUrl) => ipcRenderer.invoke('source:add-mask', dataUrl),
  addBorderLineMask: (request) => ipcRenderer.invoke('source:add-border-line-mask', request),
  addSourceFromReference: (reference) => ipcRenderer.invoke('source:add-reference', reference),
  deleteSourceImage: (file) => ipcRenderer.invoke('source:delete', file),
  prepareSourceInput: (request) => ipcRenderer.invoke('source:prepare-input', request),
  prepareBorderLineInput: (request) => ipcRenderer.invoke('source:prepare-border-line', request),
  readImageDataUrl: (source) => ipcRenderer.invoke('image:read-data-url', source),
  deleteProjectFiles: (id) => ipcRenderer.invoke('project:delete-files', id),
  listGenerations: (id) => ipcRenderer.invoke('generations:list', id),
  getGeneration: (id, generationId) => ipcRenderer.invoke('generations:get', id, generationId),
  findGenerations: (request) => ipcRenderer.invoke('generations:find', request),
  deleteGenerations: (id, generationIds, options) =>
    ipcRenderer.invoke('generations:delete', id, generationIds, options),
  mediaUrl: (owner, relative) =>
    `desk-media://local/${[
      ...(owner.kind === 'source'
        ? ['sources']
        : owner.kind === 'picture'
          ? ['pictures']
          : [owner.kind === 'project' ? 'projects' : 'references', owner.id]),
      ...relative.split('/'),
    ]
      .map(encodeURIComponent)
      .join('/')}`,
  openInExplorer: (target) => ipcRenderer.invoke('library:open', target),
  showGeneration: (id, generationId) =>
    ipcRenderer.invoke('library:show-generation', id, generationId),

  openJsonFile: (title) => ipcRenderer.invoke('file:open-json', title),
  saveJsonFile: (data, name, title) => ipcRenderer.invoke('file:save-json', data, name, title),
  openImageFile: () => ipcRenderer.invoke('file:open-image'),
  saveImageAs: (id, generationId, name, quality) =>
    ipcRenderer.invoke('file:save-image-as', id, generationId, name, quality),
  copyImage: (id, generationId) => ipcRenderer.invoke('file:copy-image', id, generationId),
  exportImages: (request) => ipcRenderer.invoke('file:export-images', request),
  exportReference: (reference) => ipcRenderer.invoke('file:export-reference', reference),
  exportLibrary: (library) => ipcRenderer.invoke('file:export-library', library),
  exportProject: (library, projectId) =>
    ipcRenderer.invoke('file:export-project', library, projectId),
  openVibeFile: () => ipcRenderer.invoke('file:open-vibe'),
  exportVibes: (vibes) => ipcRenderer.invoke('file:export-vibes', vibes),

  tokenStatus: () => ipcRenderer.invoke('token:status'),
  addAccount: (name, token) => ipcRenderer.invoke('token:add', name, token),
  validateStoredToken: () => ipcRenderer.invoke('token:validate'),
  renameAccount: (id, name) => ipcRenderer.invoke('token:rename', id, name),
  setActiveAccount: (id) => ipcRenderer.invoke('token:set-active', id),
  removeAccount: (id) => ipcRenderer.invoke('token:remove', id),

  queueSnapshot: () => ipcRenderer.invoke('generation:snapshot'),
  enqueueGeneration: (request) => ipcRenderer.invoke('generation:enqueue', request),
  estimateGeneration: (request) => ipcRenderer.invoke('generation:estimate', request),
  pauseQueue: () => ipcRenderer.invoke('generation:pause'),
  resumeQueue: () => ipcRenderer.invoke('generation:resume'),
  cancelQueue: (jobId) => ipcRenderer.invoke('generation:cancel', jobId),
  retryFailed: () => ipcRenderer.invoke('generation:retry-failed'),
  clearFinished: () => ipcRenderer.invoke('generation:clear-finished'),
  storageUsage: () => ipcRenderer.invoke('storage:usage'),
  measureGenerations: (id, generationIds) =>
    ipcRenderer.invoke('storage:measure', id, generationIds),
  inspectProject: (id) => ipcRenderer.invoke('storage:inspect', id),
  repairProject: (id) => ipcRenderer.invoke('storage:repair', id),
  clearAppCache: () => ipcRenderer.invoke('storage:clear-cache'),
  workspaceLocation: () => ipcRenderer.invoke('storage:location'),
  pickWorkspaceFolder: () => ipcRenderer.invoke('storage:pick-folder'),
  planWorkspaceMove: (folder) => ipcRenderer.invoke('storage:plan-move', folder),
  moveWorkspace: (folder) => ipcRenderer.invoke('storage:move', folder),
  onWorkspaceMoveProgress: (listener) =>
    subscribe<WorkspaceMoveProgress>('storage:move-progress', listener),
  movedWorkspace: () => ipcRenderer.invoke('storage:moved'),
  finishWorkspaceMove: (trash) => ipcRenderer.invoke('storage:finish-move', trash),
  onQueueUpdate: (listener) => subscribe<QueueView>('generation:queue-update', listener),
  onGenerationAdded: (listener) =>
    subscribe<GenerationSummary>('generation:record-added', listener),
  onGenerationPreview: (listener) => subscribe<GenerationPreview>('generation:preview', listener),
  onWindowState: (listener) => subscribe<WindowState>('app:window-state', listener),
  onTokenStatus: (listener) => subscribe<TokenStatus>('token:status', listener),

  appVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdate: () => ipcRenderer.invoke('app:check-update'),
  loadTokenizer: (name) => ipcRenderer.invoke('app:load-tokenizer', name),
  openReleasePage: (url) => ipcRenderer.invoke('app:open-release', url),
  setTitleBarColors: (colors) => ipcRenderer.send('app:titlebar', colors),
  zoomWindow: (direction) => ipcRenderer.send('app:zoom', direction),
  setZoomLevel: (level) => ipcRenderer.send('app:set-zoom', level),
  windowState: () => ipcRenderer.invoke('app:window-state'),
};

contextBridge.exposeInMainWorld('referenceDesk', api);
