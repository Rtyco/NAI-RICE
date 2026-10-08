import { contextBridge, ipcRenderer } from 'electron';
import type { GenerationSummary, QueueView } from '../src/core/domain/types';
import type { DesktopApi, TokenStatus, WindowState } from '../src/shared/ipc';

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
  prepareInputs: (projectId, reference) =>
    ipcRenderer.invoke('project:prepare-inputs', projectId, reference),
  deleteProjectFiles: (id) => ipcRenderer.invoke('project:delete-files', id),
  listGenerations: (id) => ipcRenderer.invoke('generations:list', id),
  getGeneration: (id, generationId) => ipcRenderer.invoke('generations:get', id, generationId),
  deleteGenerations: (id, generationIds, options) =>
    ipcRenderer.invoke('generations:delete', id, generationIds, options),
  mediaUrl: (owner, relative) =>
    `desk-media://local/${[
      owner.kind === 'project' ? 'projects' : 'references',
      owner.id,
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
  exportImages: (request) => ipcRenderer.invoke('file:export-images', request),
  exportReference: (reference) => ipcRenderer.invoke('file:export-reference', reference),
  exportLibrary: (library) => ipcRenderer.invoke('file:export-library', library),

  tokenStatus: () => ipcRenderer.invoke('token:status'),
  saveAndValidateToken: (token) => ipcRenderer.invoke('token:save-and-validate', token),
  validateStoredToken: () => ipcRenderer.invoke('token:validate'),
  removeToken: () => ipcRenderer.invoke('token:remove'),

  queueSnapshot: () => ipcRenderer.invoke('generation:snapshot'),
  enqueueGeneration: (request) => ipcRenderer.invoke('generation:enqueue', request),
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
  onQueueUpdate: (listener) => subscribe<QueueView>('generation:queue-update', listener),
  onGenerationAdded: (listener) =>
    subscribe<GenerationSummary>('generation:record-added', listener),
  onWindowState: (listener) => subscribe<WindowState>('app:window-state', listener),
  onTokenStatus: (listener) => subscribe<TokenStatus>('token:status', listener),

  appVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdate: () => ipcRenderer.invoke('app:check-update'),
  openReleasePage: (url) => ipcRenderer.invoke('app:open-release', url),
  setTitleBarColors: (colors) => ipcRenderer.send('app:titlebar', colors),
};

contextBridge.exposeInMainWorld('referenceDesk', api);
