import type {
  ExportFormat,
  GenerationRecord,
  GenerationSummary,
  GenerationJobSnapshot,
  Library,
  QueueView,
  Reference,
} from '../core/domain/types';
import type { UpdateCheckResult } from '../core/update/UpdateCheck';

export type OpenTextFileResult = {
  path: string;
  name: string;
  text: string;
};

export type OpenImageResult = {
  path: string;
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type LibrarySnapshot = {
  root: string;
  library: Library;
  notices: string[];
};

export type ReferenceImages = {
  originalDataUrl: string;
  canvasDataUrl: string;
  maskDataUrl: string;
};

export type ReferenceImageSave = {
  referenceId: string;
  originalDataUrl?: string;
  canvasDataUrl: string;
  maskDataUrl: string;
};

export type PreparedInputs = {
  imagePath: string;
  maskPath: string;
  imageSha256: string;
  maskSha256: string;
};

/** i2i 입력으로 쓸 이미지. 결과, 인페인트의 원본 이미지, 미리 올려 둔 파일 중 하나다. */
export type ImageInputSource =
  | { kind: 'record'; projectId: string; generationId: string }
  | { kind: 'reference'; referenceId: string; file: string }
  | { kind: 'input'; projectId: string; imagePath: string };

/**
 * NovelAI는 i2i 입력을 요청 크기로 비율을 무시하고 늘리므로(0단계), 보내기 전에 목표 크기로 맞춘다.
 * crop은 위쪽을 남기고 자르고, pad는 가운데에 두고 흰 여백을 넣는다.
 */
export type ImageInputRequest = {
  projectId: string;
  source: ImageInputSource;
  width: number;
  height: number;
  fit: 'crop' | 'pad';
};

export type PreparedImage = { imagePath: string; imageSha256: string };

export type StoredImage = PreparedImage & { width: number; height: number };

export type TokenStatus = {
  stored: boolean;
  secureStorageAvailable: boolean;
  valid?: boolean;
  anlas?: number;
  /** 구독 등급. 3이 Opus. */
  tier?: number;
  v5Quota?: {
    percent: number;
    isNegative: boolean;
    timeUntilNextPercent: number;
  };
  checkedAt?: string;
  message?: string;
};

/** Anlas 확인 여부는 메인 프로세스가 작업 내용으로 직접 판단한다. */
export type GenerationEnqueueRequest = {
  jobs: GenerationJobSnapshot[];
};

export type GenerationEnqueueResult = {
  cancelled: boolean;
  snapshot: QueueView;
};

export type ExportItem = { generationId: string; name: string };

export type ExportRequest = {
  projectId: string;
  name: string;
  items: ExportItem[];
  format: ExportFormat;
  quality: number;
  mode: 'folder' | 'zip';
};

export type ExportResult = { path: string; count: number } | null;

export type OpenTarget =
  | { kind: 'root' }
  | { kind: 'project'; projectId: string }
  | { kind: 'outputs'; projectId: string }
  | { kind: 'emotion'; projectId: string; emotionName: string }
  | { kind: 'reference'; referenceId: string };

export type MediaOwner = { kind: 'project' | 'reference'; id: string };

export type LibraryApi = {
  loadLibrary: () => Promise<LibrarySnapshot>;
  saveLibrary: (library: Library) => Promise<void>;
  saveReferenceImages: (request: ReferenceImageSave) => Promise<{ originalFile?: string }>;
  readReferenceImages: (reference: Reference) => Promise<ReferenceImages | null>;
  copyReferenceFiles: (fromId: string, toId: string) => Promise<void>;
  deleteReferenceFiles: (referenceId: string) => Promise<void>;
  prepareInputs: (projectId: string, reference: Reference) => Promise<PreparedInputs>;
  prepareImageInput: (request: ImageInputRequest) => Promise<PreparedImage>;
  /** 파일에서 고른 이미지를 작업의 inputs/에 PNG로 넣어 두고, 나중에 `input` 출처로 쓴다. */
  storeImageInput: (projectId: string, dataUrl: string) => Promise<StoredImage>;
  deleteProjectFiles: (projectId: string) => Promise<void>;
  /** 화면 목록용 요약. 프롬프트·설정은 getGeneration으로 하나씩 받는다. */
  listGenerations: (projectId: string) => Promise<GenerationSummary[]>;
  getGeneration: (projectId: string, generationId: string) => Promise<GenerationRecord>;
  /** 기본은 휴지통으로 보낸다. permanent면 바로 지운다. */
  deleteGenerations: (
    projectId: string,
    generationIds: string[],
    options?: { permanent?: boolean },
  ) => Promise<void>;
  mediaUrl: (owner: MediaOwner, relative: string) => string;
  openInExplorer: (target: OpenTarget) => Promise<void>;
  showGeneration: (projectId: string, generationId: string) => Promise<void>;
};

/** 파일 열기·저장·내보내기 대화상자. */
export type FileApi = {
  openJsonFile: (title: string) => Promise<OpenTextFileResult | null>;
  saveJsonFile: (data: unknown, suggestedName: string, title: string) => Promise<string | null>;
  openImageFile: () => Promise<OpenImageResult | null>;
  saveImageAs: (
    projectId: string,
    generationId: string,
    suggestedName: string,
    quality: number,
  ) => Promise<string | null>;
  exportImages: (request: ExportRequest) => Promise<ExportResult>;
  exportReference: (reference: Reference) => Promise<string | null>;
  exportLibrary: (library: Library) => Promise<string | null>;
};

export type AccountApi = {
  tokenStatus: () => Promise<TokenStatus>;
  saveAndValidateToken: (token: string) => Promise<TokenStatus>;
  validateStoredToken: () => Promise<TokenStatus>;
  removeToken: () => Promise<TokenStatus>;
  onTokenStatus: (listener: (status: TokenStatus) => void) => () => void;
};

export type QueueApi = {
  queueSnapshot: () => Promise<QueueView>;
  enqueueGeneration: (request: GenerationEnqueueRequest) => Promise<GenerationEnqueueResult>;
  pauseQueue: () => Promise<QueueView>;
  resumeQueue: () => Promise<QueueView>;
  cancelQueue: (jobId?: string) => Promise<QueueView>;
  retryFailed: () => Promise<QueueView>;
  clearFinished: () => Promise<QueueView>;
  onQueueUpdate: (listener: (snapshot: QueueView) => void) => () => void;
  onGenerationAdded: (listener: (record: GenerationSummary) => void) => () => void;
};

/** 작업 폴더 안 한 작업의 폴더별 바이트. */
export type ProjectUsage = {
  projectId: string;
  records: number;
  bytes: {
    outputs: number;
    diagnostic: number;
    thumbs: number;
    inputs: number;
    /** 휴지통으로 보내지 못하고 남은 대기 폴더. */
    trash: number;
    other: number;
  };
  total: number;
};

export type StorageUsage = {
  projects: ProjectUsage[];
  references: number;
  backups: number;
  exports: number;
  app: {
    /** Chromium 캐시(HTTP·코드·GPU·맞춤법 사전). */
    cache: number;
    /** 생성 큐 기록 파일. */
    queue: number;
  };
};

export type GenerationMeasure = { count: number; bytes: number };

export type ProjectInspection = {
  /** 기록 없이 남은 결과·썸네일·진단 캔버스 파일. */
  orphanFiles: number;
  orphanBytes: number;
  /** 이미지 파일이 없어진 기록. */
  missingRecords: number;
};

/** 설정 › 저장 공간. */
export type StorageApi = {
  storageUsage: () => Promise<StorageUsage>;
  measureGenerations: (projectId: string, generationIds: string[]) => Promise<GenerationMeasure>;
  inspectProject: (projectId: string) => Promise<ProjectInspection>;
  /** 고아 파일은 휴지통으로 보내고 이미지가 없어진 기록은 뺀다. 고친 내용을 돌려준다. */
  repairProject: (projectId: string) => Promise<ProjectInspection>;
  /** 비운 바이트(대략)를 돌려준다. */
  clearAppCache: () => Promise<number>;
};

export type AppApi = {
  appVersion: () => Promise<string>;
  /** GitHub 최신 릴리스와 지금 버전을 비교한다. */
  checkForUpdate: () => Promise<UpdateCheckResult>;
  /** GitHub 주소(릴리스 페이지·실행 파일)를 기본 브라우저로 연다. */
  openReleasePage: (url: string) => Promise<void>;
  /** 창 제목 표시줄(최소화·최대화·닫기 버튼 영역)을 테마 색에 맞춘다. 색은 #rrggbb. */
  setTitleBarColors: (colors: TitleBarColors) => void;
  /** 전체 화면(F11)·확대(Ctrl +/-/0)가 바뀔 때. */
  onWindowState: (listener: (state: WindowState) => void) => () => void;
};

export type WindowState = { fullScreen: boolean; zoomPercent: number };

export type TitleBarColors = { color: string; symbolColor: string };

/** preload가 렌더러에 여는 전체 API. 화면은 필요한 부분 인터페이스만 쓴다(src/renderer/desktop.ts). */
export type DesktopApi = LibraryApi & FileApi & AccountApi & QueueApi & StorageApi & AppApi;
