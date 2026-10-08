export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NaiModel =
  | 'nai-diffusion-5-full-inpainting'
  | 'nai-diffusion-4-5-full-inpainting'
  | 'nai-diffusion-4-5-curated-inpainting'
  | 'nai-diffusion-4-full-inpainting'
  | 'nai-diffusion-4-curated-inpainting'
  | 'nai-diffusion-3-inpainting'
  | 'nai-diffusion-furry-3-inpainting';

export type UcPresetId = 'none' | 'heavy' | 'light' | 'human' | 'furry';

/** V5의 Quality Tags 단계. 다른 모델은 Standard 하나뿐이다. */
export type QualityLevel = 'standard' | 'light';

/** reference inset 태그를 넣을 위치. 캐릭터 맨 앞은 성별 태그(girl, boy …) 바로 뒤에 들어간다. */
/** 감정 프롬프트를 붙일 곳. */
export type EmotionPosition = 'character-end' | 'common-end';

export type ReferenceInsetPosition =
  'common-start' | 'common-end' | 'character-start' | 'character-end';

export type GenerationSettings = {
  model: NaiModel | string;
  sampler: string;
  steps: number;
  promptGuidance: number;
  cfgRescale: number;
  noiseSchedule: string;
  inpaintStrength: number;
  seedMode: 'fixed' | 'random-per-job';
  fixedSeed?: number;
  variantsPerEmotion: number;
  /** NovelAI의 Quality Tags. 켜면 모델별 품질 태그를 공통 포지티브 끝에 붙인다. */
  qualityTags: boolean;
  qualityLevel: QualityLevel;
  /** NovelAI의 Undesired Content Preset. 공통 네거티브 앞에 붙인다. */
  ucPreset: UcPresetId;
  /** reference inset 태그 자동 추가. 직접 쓴 태그가 있으면 넣지 않고, 끄더라도 직접 쓴 태그는 지우지 않는다. */
  referenceInset: boolean;
  referenceInsetPosition: ReferenceInsetPosition;
  emotionPosition: EmotionPosition;
};

// ── 독립된 네 가지 라이브러리 항목 ─────────────────────

/** 프리셋: 공통 프롬프트와 생성 설정. */
export type Preset = {
  id: string;
  name: string;
  commonPositive: string;
  commonNegative: string;
  generation: GenerationSettings;
};

export type CharacterPromptSet = {
  id: string;
  name: string;
  positive: string;
  negative: string;
};

/** 캐릭터: 캐릭터 프롬프트(의상·버전별 세트). */
export type Character = {
  id: string;
  name: string;
  promptSets: CharacterPromptSet[];
  createdAt: string;
};

export type Emotion = {
  id: string;
  name: string;
  prompt: string;
};

/** 감정 모음: 감정 이름과 프롬프트 목록. 여러 작업에서 공유할 수 있다. */
export type EmotionSet = {
  id: string;
  name: string;
  emotions: Emotion[];
};

/**
 * 프롬프트 조각: 여러 프롬프트에서 `<세트이름.조각이름>`으로 불러 쓰는 문구. SDStudio와 같은 문법이다.
 * multi면 줄마다 하나의 후보이며, 이미지마다 seed로 한 줄을 고른다.
 */
export type PromptPiece = {
  id: string;
  name: string;
  prompt: string;
  multi: boolean;
};

export type PieceSet = {
  id: string;
  name: string;
  pieces: PromptPiece[];
};

export type ResolutionPresetId = '1216x832' | '832x1216' | '1024x1024' | 'custom';
export type ReferenceSide = 'left' | 'right' | 'top' | 'bottom';

export type CanvasLayout = {
  mode: 'auto' | 'prepared';
  resolution: ResolutionPresetId;
  width: number;
  height: number;
  referenceSide: ReferenceSide;
  /** 레퍼런스 영역이 차지하는 비율 (0.2 ~ 0.8). */
  referenceRatio: number;
  fit: 'contain' | 'cover';
  /** 레퍼런스 영역 안에서 이미지를 세로로 어디에 맞출지. cover로 잘릴 때 남길 부분이기도 하다. */
  anchor: 'top' | 'center' | 'bottom';
  background: string;
};

/** 레퍼런스: 캐릭터 이미지와 그것으로 만든 캔버스·마스크. 파일은 references/<id>/에 있다. */
export type Reference = {
  id: string;
  name: string;
  /** 이미지가 아직 없으면 undefined. */
  image?: {
    originalFile: string;
    canvasFile: string;
    maskFile: string;
    originalName: string;
    canvasWidth: number;
    canvasHeight: number;
    referenceRect: Rect;
    outputRect: Rect;
  };
  layout: CanvasLayout;
  maskExpansionPx: number;
  backgroundThreshold: number;
  updatedAt: string;
};

/** 작업: 프리셋 · 캐릭터 · 감정 모음 · 레퍼런스를 하나씩 골라 묶은 조합. 생성 결과는 작업에 쌓인다. */
export type Project = {
  id: string;
  name: string;
  presetId: string;
  characterId: string;
  promptSetId: string;
  emotionSetId: string;
  referenceId: string;
  /** 일괄 생성에서 제외할 감정. */
  excludedEmotionIds: string[];
  /** 감정별 대표 이미지(생성 기록 ID). */
  favorites: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type ExportFormat = 'png' | 'webp' | 'avif';

export type NaiTagFamily =
  'v5' | 'v4-5-full' | 'v4-5-curated' | 'v4-full' | 'v4-curated' | 'v3' | 'v3-furry';

export type NaiTagTable = {
  quality: Partial<Record<QualityLevel, string>>;
  uc: Partial<Record<Exclude<UcPresetId, 'none'>, string>>;
  /** UC 프리셋이 없고 네거티브도 비었을 때 NovelAI 웹이 대신 보내는 네거티브(V3의 `lowres`). */
  emptyUc?: string;
  /** 예전 NovelAI 웹·문서의 문구. 생성에는 쓰지 않고, 그때 만든 이미지를 불러올 때만 알아본다. */
  legacyQuality?: Partial<Record<QualityLevel, string>>;
  legacyUc?: Partial<Record<Exclude<UcPresetId, 'none'>, string>>;
};

export type AppSettings = {
  outputFilenameTemplate: string;
  keepDiagnosticCanvas: boolean;
  export: {
    format: ExportFormat;
    quality: number;
    target: 'favorite' | 'latest';
  };
  /** NovelAI 요청 사이에 기다리는 시간(0~1000ms). */
  requestDelayMs: number;
  /** 프롬프트 칸에서 단부루 태그 후보를 보여 준다. */
  tagAutocomplete: boolean;
  appearance: {
    theme: ThemeId;
    mode: ThemeMode;
  };
  update: {
    /** 프로그램을 열 때 GitHub 최신 릴리스를 확인한다. */
    autoCheck: boolean;
    /** 「이 버전 건너뛰기」로 알림을 끈 버전. 더 새 버전이 나오면 다시 알린다. */
    skippedVersion: string;
  };
};

export type ThemeId = 'navy' | 'graphite' | 'violet' | 'forest' | 'rose';
export type ThemeMode = 'dark' | 'light' | 'system';

export type Library = {
  schemaVersion: 2;
  settings: AppSettings;
  presets: Preset[];
  characters: Character[];
  emotionSets: EmotionSet[];
  references: Reference[];
  projects: Project[];
  pieceSets: PieceSet[];
  lastProjectId?: string;
};

/** 완료된 생성 결과 한 건. 작업 폴더의 generations.json에 누적된다. */
export type GenerationRecord = {
  id: string;
  projectId: string;
  emotionId: string;
  emotionName: string;
  createdAt: string;
  file: string;
  thumbFile?: string;
  canvasFile?: string;
  width: number;
  height: number;
  seed: number;
  variantIndex: number;
  presetName: string;
  characterName: string;
  promptSetName: string;
  emotionSetName: string;
  referenceName: string;
  prompt: string;
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  emotionPrompt: string;
  settings: GenerationSettings;
  /** 생성 전후 Anlas 차이(조회 가능할 때만). */
  anlasSpent?: number;
};

export type JobStatus =
  'queued' | 'generating' | 'retry_wait' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export type InpaintJobSnapshot = {
  id: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  characterName: string;
  emotionId: string;
  emotionName: string;
  emotionPrompt: string;
  presetName: string;
  promptSetName: string;
  emotionSetName: string;
  referenceName: string;
  /** 최종 공통 포지티브(reference inset·품질 태그 포함). */
  prompt: string;
  /** 최종 공통 네거티브(UC 프리셋 포함). */
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  /** 사용자가 입력한 원문. 결과 메타데이터에 분리 보존한다. */
  source: {
    commonPositive: string;
    commonNegative: string;
    characterPositive: string;
  };
  seed: number;
  variantIndex: number;
  /** 작업 폴더 기준 상대 경로. 해시 이름으로 저장된 불변 입력 파일. */
  imagePath: string;
  maskPath: string;
  imageSha256: string;
  maskSha256: string;
  canvasWidth: number;
  canvasHeight: number;
  outputRect: Rect;
  outputFilenameTemplate: string;
  keepDiagnosticCanvas: boolean;
  settings: GenerationSettings;
  warnings: string[];
};

export type QueuedInpaintJob = InpaintJobSnapshot & {
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  errorKind?: string;
  retryable?: boolean;
  generationId?: string;
  anlasSpent?: number;
};

export type QueueSnapshot = {
  paused: boolean;
  updatedAt: string;
  jobs: QueuedInpaintJob[];
};

/**
 * 화면 목록에 보내는 생성 기록. 기록마다 수 KB인 최종 프롬프트와 설정을 뺀다(작업 715장 기준
 * 2.7MB → 0.9MB). 생성 정보 패널은 열 때 전체 기록을 따로 받는다.
 */
export type GenerationSummary = Omit<
  GenerationRecord,
  'prompt' | 'negativePrompt' | 'characterPrompt' | 'characterNegativePrompt' | 'settings'
> & { model: string };

/** 화면에 보내는 큐 작업. 프롬프트·설정·입력 경로는 뺀다(core/jobs/QueueView). */
export type QueueJobView = Pick<
  QueuedInpaintJob,
  | 'id'
  | 'createdAt'
  | 'projectId'
  | 'projectName'
  | 'characterName'
  | 'emotionId'
  | 'emotionName'
  | 'seed'
  | 'variantIndex'
  | 'status'
  | 'attempts'
  | 'maxAttempts'
  | 'nextAttemptAt'
  | 'startedAt'
  | 'completedAt'
  | 'error'
  | 'errorKind'
  | 'retryable'
  | 'generationId'
  | 'anlasSpent'
>;

export type QueueView = {
  paused: boolean;
  updatedAt: string;
  jobs: QueueJobView[];
};

export type ImportWarning = {
  code:
    | 'empty-prompt'
    | 'complex-slots'
    | 'missing-common-positive'
    | 'missing-character-positive'
    | 'multiple-character-prompts';
  message: string;
  path?: string;
};
