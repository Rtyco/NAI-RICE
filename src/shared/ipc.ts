import type {
  ExportFormat,
  GenerationKind,
  GenerationRecord,
  GenerationSummary,
  GenerationJobSnapshot,
  Library,
  Picture,
  QueueView,
  Rect,
  Reference,
  Vibe,
} from '../core/domain/types';
import type { PrepareBorderLineInput } from '../core/model/lineFix';
import type { UpdateCheckResult } from '../core/update/UpdateCheck';
import type { TokenizerName } from '../core/prompts/PromptTokens';
import type { MetadataVibe } from '../core/vibes/VibeFile';
import type { GenerationFindHit } from '../core/model/promptFields';
import type { FindQuery } from '../core/prompts/PromptFind';

export type ImportedVibe = {
  name: string;
  picture: Omit<Picture, 'name'>;
  strength: number;
  informationExtracted: number;
  encodingId?: string;
};

/** `model`은 일반 생성 모델 ID. */
export type VibeEncodingInfo = { model: string; informationExtracted: number };

export type MetadataVibeImport = { model: string; name: string; vibes: MetadataVibe[] };

export const GENERATION_FIND_LIMIT = 200;

export type GenerationFindRequest = { projectIds: string[]; query: FindQuery };

export type GenerationFindResult = { hits: GenerationFindHit[]; total: number };

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
  paintDataUrl?: string;
};

export type ReferenceImageSave = {
  referenceId: string;
  originalDataUrl?: string;
  canvasDataUrl: string;
  maskDataUrl: string;
  /** 없으면 그대로, null이면 지운다. */
  paintDataUrl?: string | null;
};

export type PreparedInputs = {
  imagePath: string;
  maskPath: string;
  imageSha256: string;
  maskSha256: string;
};

export type ImageInputSource = { kind: 'record'; projectId: string; generationId: string };

export type ImageDataSource =
  { kind: 'source'; file: string } | { kind: 'picture'; file: string } | ImageInputSource;

export type SourceImageAdd = { kind: 'data'; dataUrl: string } | ImageInputSource;

/** NovelAI는 i2i 입력을 비율 무시하고 늘리므로(0단계) 미리 맞춘다. crop은 위쪽을 남기고, pad는 가운데에 흰 여백. */
export type ImageInputRequest = {
  projectId: string;
  source: ImageInputSource;
  width: number;
  height: number;
  fit: 'crop' | 'pad';
};

export type PreparedImage = { imagePath: string; imageSha256: string };

/** 크기는 64 배수. 같은 이미지는 같은 이름. `outputRect`는 여백을 뺀 원래 영역. */
export type StoredSource = { file: string; width: number; height: number; outputRect: Rect };

export type ReferenceSource = StoredSource & { maskFile: string };

/** `baseMaskFile`이 있으면 그 마스크에 더한다. */
export type BorderLineMaskRequest = Omit<StoredSource, 'width' | 'height'> & {
  marginPx: number;
  baseMaskFile?: string;
};

export type SourceInputRequest = {
  projectId: string;
  file: string;
  maskFile?: string;
  /** 마스크 없이 보낼 때 여백을 잘라 이 크기로 맞춘다(디렉터 툴). */
  crop?: { rect: Rect; width: number; height: number };
};

export type PreparedSourceInput = PreparedImage & {
  mask?: Pick<PreparedInputs, 'maskPath' | 'maskSha256'>;
};

/** 계정 하나의 마지막 조회 결과 */
export type AccountState = {
  valid?: boolean;
  anlas?: number;
  /** 3이 Opus */
  tier?: number;
  v5Quota?: {
    percent: number;
    isNegative: boolean;
    timeUntilNextPercent: number;
  };
  checkedAt?: string;
};

export type AccountSummary = AccountState & { id: string; name: string; active: boolean };

/** 위쪽 값은 사용 중인 계정의 것이다. */
export type TokenStatus = AccountState & {
  stored: boolean;
  secureStorageAvailable: boolean;
  /** 저장한 순서. 다음 계정으로 바꿀 때 이 순서를 따른다. */
  accounts?: AccountSummary[];
  /** 다음 계정으로 바꾸기가 켜져 있고, 다른 계정에 V5 할당량이 남았다. */
  v5Spare?: boolean;
  message?: string;
};

/** 예상 Anlas는 메인 프로세스가 계산한다. */
export type GenerationEnqueueRequest = {
  jobs: GenerationJobSnapshot[];
};

export type GenerationEnqueueResult = {
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
  | { kind: 'emotion'; projectId: string; emotionName: string; method: GenerationKind }
  | { kind: 'reference'; referenceId: string };

/** `source`는 `sources/<파일>`. */
export type MediaOwner =
  { kind: 'project' | 'reference'; id: string } | { kind: 'source' } | { kind: 'picture' };

export type LibraryApi = {
  loadLibrary: () => Promise<LibrarySnapshot>;
  saveLibrary: (library: Library) => Promise<void>;
  saveReferenceImages: (request: ReferenceImageSave) => Promise<{ originalFile?: string }>;
  readReferenceImages: (reference: Reference) => Promise<ReferenceImages | null>;
  copyReferenceFiles: (fromId: string, toId: string) => Promise<void>;
  deleteReferenceFiles: (referenceId: string) => Promise<void>;
  prepareInputs: (projectId: string, reference: Reference) => Promise<PreparedInputs>;
  /** 캐릭터 레퍼런스는 캔버스에 맞추고 바이브는 원본 그대로. */
  prepareAidInput: (
    projectId: string,
    file: string,
    kind: 'character' | 'vibe',
  ) => Promise<PreparedImage>;
  /** 같은 그림은 같은 파일이 된다. */
  addPicture: (dataUrl: string) => Promise<Omit<Picture, 'name'>>;
  importVibeFile: (text: string, name: string) => Promise<ImportedVibe[]>;
  importMetadataVibes: (request: MetadataVibeImport) => Promise<ImportedVibe[]>;
  vibeEncodings: (vibe: Pick<Vibe, 'image' | 'encodingId'>) => Promise<VibeEncodingInfo[]>;
  prepareImageInput: (request: ImageInputRequest) => Promise<PreparedImage>;
  addSourceImage: (request: SourceImageAdd) => Promise<StoredSource>;
  addSourceMask: (dataUrl: string) => Promise<string>;
  /** 구분선이 없으면 undefined. */
  addBorderLineMask: (
    request: BorderLineMaskRequest,
  ) => Promise<{ maskFile: string; lines: number } | undefined>;
  /** 인페인트의 캔버스와 마스크를 복사한다. 결과 영역은 인페인트의 것. */
  addSourceFromReference: (reference: Reference) => Promise<ReferenceSource>;
  /** 앱이 만든 사본이라 휴지통을 거치지 않는다. */
  deleteSourceImage: (file: string) => Promise<void>;
  prepareSourceInput: (request: SourceInputRequest) => Promise<PreparedSourceInput>;
  prepareBorderLineInput: PrepareBorderLineInput;
  /** 화면 CSP가 `desk-media:` fetch를 막고, 그 주소로 그린 캔버스는 다른 출처라 픽셀을 읽을 수 없다. */
  readImageDataUrl: (source: ImageDataSource) => Promise<string>;
  deleteProjectFiles: (projectId: string) => Promise<void>;
  /** 프롬프트·설정은 getGeneration으로 따로 받는다. */
  listGenerations: (projectId: string) => Promise<GenerationSummary[]>;
  getGeneration: (projectId: string, generationId: string) => Promise<GenerationRecord>;
  /** 최신순으로 `GENERATION_FIND_LIMIT`개까지. `total`은 전체 수. */
  findGenerations: (request: GenerationFindRequest) => Promise<GenerationFindResult>;
  /** 기본은 휴지통. */
  deleteGenerations: (
    projectId: string,
    generationIds: string[],
    options?: { permanent?: boolean },
  ) => Promise<void>;
  mediaUrl: (owner: MediaOwner, relative: string) => string;
  openInExplorer: (target: OpenTarget) => Promise<void>;
  showGeneration: (projectId: string, generationId: string) => Promise<void>;
};

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
  /** WebP로 저장된 결과도 PNG로 넣는다. */
  copyImage: (projectId: string, generationId: string) => Promise<void>;
  exportImages: (request: ExportRequest) => Promise<ExportResult>;
  exportReference: (reference: Reference) => Promise<string | null>;
  exportLibrary: (library: Library) => Promise<string | null>;
  /** NAI RICE 작업 파일. 작업이 쓰는 라이브러리 항목과 그림을 함께 넣는다. */
  exportProject: (library: Library, projectId: string) => Promise<string | null>;
  openVibeFile: () => Promise<OpenTextFileResult | null>;
  /** 하나면 `.naiv4vibe`, 여럿이면 `.naiv4vibeBundle`. */
  exportVibes: (vibes: Vibe[]) => Promise<string | null>;
};

export type AccountApi = {
  tokenStatus: () => Promise<TokenStatus>;
  /** 토큰을 확인한 뒤에만 저장한다. */
  addAccount: (name: string, token: string) => Promise<TokenStatus>;
  /** 모든 계정을 다시 조회한다. */
  validateStoredToken: () => Promise<TokenStatus>;
  renameAccount: (id: string, name: string) => Promise<TokenStatus>;
  setActiveAccount: (id: string) => Promise<TokenStatus>;
  removeAccount: (id: string) => Promise<TokenStatus>;
  onTokenStatus: (listener: (status: TokenStatus) => void) => () => void;
};

/** `steps`는 대략의 전체 단계 수. */
export type GenerationPreview = { jobId: string; dataUrl: string; step: number; steps: number };

export type QueueApi = {
  queueSnapshot: () => Promise<QueueView>;
  enqueueGeneration: (request: GenerationEnqueueRequest) => Promise<GenerationEnqueueResult>;
  /** 예상 Anlas. 이어 붙는 다듬기·구분선 지우기 최대치 포함. */
  estimateGeneration: (request: GenerationEnqueueRequest) => Promise<number>;
  pauseQueue: () => Promise<QueueView>;
  resumeQueue: () => Promise<QueueView>;
  cancelQueue: (jobId?: string) => Promise<QueueView>;
  retryFailed: () => Promise<QueueView>;
  clearFinished: () => Promise<QueueView>;
  onQueueUpdate: (listener: (snapshot: QueueView) => void) => () => void;
  onGenerationAdded: (listener: (record: GenerationSummary) => void) => () => void;
  onGenerationPreview: (listener: (preview: GenerationPreview) => void) => () => void;
};

/** 폴더별 바이트 */
export type ProjectUsage = {
  projectId: string;
  records: number;
  bytes: {
    outputs: number;
    diagnostic: number;
    thumbs: number;
    inputs: number;
    /** 휴지통으로 보내지 못한 대기 폴더 */
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
    /** Chromium HTTP·코드·GPU·맞춤법 캐시 */
    cache: number;
    queue: number;
  };
};

export type GenerationMeasure = { count: number; bytes: number };

export type ProjectInspection = {
  /** 기록 없는 결과·썸네일·진단 캔버스 */
  orphanFiles: number;
  orphanBytes: number;
  missingRecords: number;
};

/** copy: 지금 작업 폴더를 복사한다. existing: 고른 곳의 library.json을 그대로 쓴다. */
export type WorkspaceMovePlan = { root: string; mode: 'copy' | 'existing'; bytes: number };

export type WorkspaceMoveProgress = { copied: number; total: number };

export type WorkspaceLocationInfo = { root: string; defaultRoot: string; movable: boolean };

export type MovedWorkspace = { root: string; previousRoot: string };

export type StorageApi = {
  storageUsage: () => Promise<StorageUsage>;
  measureGenerations: (projectId: string, generationIds: string[]) => Promise<GenerationMeasure>;
  inspectProject: (projectId: string) => Promise<ProjectInspection>;
  /** 고아 파일은 휴지통으로, 이미지 없는 기록은 뺀다. */
  repairProject: (projectId: string) => Promise<ProjectInspection>;
  /** 비운 바이트(대략) */
  clearAppCache: () => Promise<number>;
  workspaceLocation: () => Promise<WorkspaceLocationInfo>;
  pickWorkspaceFolder: () => Promise<string | null>;
  planWorkspaceMove: (folder: string) => Promise<WorkspaceMovePlan>;
  /** 끝나면 앱이 다시 시작한다. */
  moveWorkspace: (folder: string) => Promise<void>;
  onWorkspaceMoveProgress: (listener: (progress: WorkspaceMoveProgress) => void) => () => void;
  /** 옮긴 뒤 처음 시작했으면 이전 폴더 */
  movedWorkspace: () => Promise<MovedWorkspace | null>;
  finishWorkspaceMove: (trash: boolean) => Promise<void>;
};

export type AppApi = {
  appVersion: () => Promise<string>;
  checkForUpdate: () => Promise<UpdateCheckResult>;
  /** NovelAI 웹의 압축된 토크나이저 파일. 처음 한 번만 받는다. */
  loadTokenizer: (name: TokenizerName) => Promise<Uint8Array>;
  openReleasePage: (url: string) => Promise<void>;
  /** #rrggbb */
  setTitleBarColors: (colors: TitleBarColors) => void;
  /** Electron은 Ctrl+휠로 스스로 확대하지 않는다. 캔버스·이미지 확대가 막지 않은 Ctrl+휠만 렌더러가 보낸다. */
  zoomWindow: (direction: 'in' | 'out') => void;
  onWindowState: (listener: (state: WindowState) => void) => () => void;
};

export type WindowState = { fullScreen: boolean; zoomPercent: number };

export type TitleBarColors = { color: string; symbolColor: string };

export type DesktopApi = LibraryApi & FileApi & AccountApi & QueueApi & StorageApi & AppApi;
