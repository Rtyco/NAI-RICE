import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Library } from '../core/domain/types';
import { createDefaultLibrary } from '../core/model/defaults';
import type { DesktopApi } from '../shared/ipc';
import App from './App';
import { applyAppearance, cachedAppearance } from './theme';
import { restorePanelWidths, watchPanelFit } from './panelWidths';
import './styles/index.css';

/** 브라우저(vite 단독)에서 화면만 볼 때 쓰는 메모리 API */
function createPreviewApi(): DesktopApi {
  let library: Library = createDefaultLibrary();
  const queue = { paused: false, updatedAt: new Date().toISOString(), jobs: [] };
  const token = {
    stored: true,
    secureStorageAvailable: true,
    valid: true,
    anlas: 10_250,
    v5Quota: { percent: 84, isNegative: false, timeUntilNextPercent: 120 },
    checkedAt: new Date().toISOString(),
  };
  const unsupported = async (): Promise<never> => {
    throw new Error('브라우저 미리보기에서는 데스크톱 전용 기능을 사용할 수 없습니다.');
  };
  const none = () => () => undefined;
  return {
    loadLibrary: async () => ({
      root: 'C:\\Users\\preview\\Documents\\NAI RICE',
      library,
      notices: [],
    }),
    saveLibrary: async (next) => {
      library = next;
    },
    saveReferenceImages: async () => ({ originalFile: 'original.png' }),
    readReferenceImages: async () => null,
    copyReferenceFiles: async () => undefined,
    deleteReferenceFiles: async () => undefined,
    prepareInputs: unsupported,
    prepareAidInput: unsupported,
    addPicture: unsupported,
    importVibeFile: unsupported,
    importMetadataVibes: unsupported,
    vibeEncodings: async () => [],
    prepareImageInput: unsupported,
    addSourceImage: unsupported,
    addSourceMask: unsupported,
    addBorderLineMask: unsupported,
    addSourceFromReference: unsupported,
    deleteSourceImage: async () => undefined,
    prepareSourceInput: unsupported,
    prepareBorderLineInput: unsupported,
    readImageDataUrl: unsupported,
    deleteProjectFiles: async () => undefined,
    listGenerations: async () => [],
    getGeneration: unsupported,
    findGenerations: async () => ({ hits: [], total: 0 }),
    deleteGenerations: async () => undefined,
    mediaUrl: () => '',
    openInExplorer: async () => undefined,
    showGeneration: async () => undefined,
    openJsonFile: async () => null,
    saveJsonFile: async () => null,
    openImageFile: async () => null,
    saveImageAs: async () => null,
    exportImages: async () => null,
    exportReference: async () => null,
    exportLibrary: async () => null,
    exportProject: async () => null,
    openVibeFile: async () => null,
    exportVibes: async () => null,
    tokenStatus: async () => token,
    addAccount: unsupported,
    validateStoredToken: async () => token,
    renameAccount: unsupported,
    setActiveAccount: unsupported,
    removeAccount: async () => ({ stored: false, secureStorageAvailable: true }),
    queueSnapshot: async () => queue,
    enqueueGeneration: unsupported,
    pauseQueue: async () => ({ ...queue, paused: true }),
    resumeQueue: async () => queue,
    cancelQueue: async () => queue,
    retryFailed: async () => queue,
    clearFinished: async () => queue,
    onQueueUpdate: none,
    onGenerationAdded: none,
    onGenerationPreview: none,
    onTokenStatus: none,
    storageUsage: async () => ({
      projects: [],
      references: 0,
      backups: 0,
      exports: 0,
      app: { cache: 0, queue: 0 },
    }),
    measureGenerations: async () => ({ count: 0, bytes: 0 }),
    inspectProject: async () => ({ orphanFiles: 0, orphanBytes: 0, missingRecords: 0 }),
    repairProject: async () => ({ orphanFiles: 0, orphanBytes: 0, missingRecords: 0 }),
    clearAppCache: async () => 0,
    appVersion: async () => '0.9.0-preview',
    checkForUpdate: unsupported,
    loadTokenizer: unsupported,
    openReleasePage: unsupported,
    setTitleBarColors: () => undefined,
    zoomWindow: () => undefined,
    onWindowState: none,
  };
}

// 라이브러리를 읽기 전에도 마지막 테마로 그려 깜빡임을 줄인다.
applyAppearance(cachedAppearance());
restorePanelWidths();
watchPanelFit();

if (import.meta.env.DEV && !window.referenceDesk) {
  window.referenceDesk = createPreviewApi();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
