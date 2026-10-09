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

export type EmotionPosition = 'character-end' | 'common-end';

/** 캐릭터 맨 앞(`character-start`)은 성별 태그(girl, boy …) 바로 뒤에 들어간다. */
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
  /** 일반 생성(txt2img)의 결과 크기. 인페인트는 참고 이미지 캔버스 크기를 쓴다. */
  width: number;
  height: number;
  /** i2i에서 원본을 얼마나 바꿀지(0~1). 0단계에서 0.4가 얼굴·구도를 지키면서 선을 다시 그렸다. */
  img2imgStrength: number;
  img2imgNoise: number;
};

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

/**
 * 인페인트(`reference`, 예전 이름 레퍼런스 생성)는 참고 이미지 옆에 인페인트하고, 일반 생성은 참고 이미지
 * 없이 txt2img로 만든다.
 * i2i는 인페인트의 원본 이미지를 생성 설정의 해상도로 맞춰 다시 그린다.
 */
export type ProjectMode = 'reference' | 'txt2img' | 'img2img';

/** 작업: 프리셋 · 캐릭터 · 감정 모음 · 레퍼런스를 하나씩 골라 묶은 조합. 생성 결과는 작업에 쌓인다. */
export type Project = {
  id: string;
  name: string;
  mode: ProjectMode;
  presetId: string;
  characterId: string;
  promptSetId: string;
  emotionSetId: string;
  /** 일반 생성에서는 쓰지 않지만, 모드를 다시 바꿀 때를 위해 남겨 둔다. */
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
  'v5' | 'v5-curated' | 'v4-5-full' | 'v4-5-curated' | 'v4-full' | 'v4-curated' | 'v3' | 'v3-furry';

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

/** 자유 생성 화면에서 마지막으로 고른 값. 결과는 작업이 아니라 `projects/free/`에 쌓인다. */
export type FreeGeneration = {
  /** 비어 있거나 지워진 생성 설정이면 첫 생성 설정을 쓴다. */
  presetId: string;
  /** 비어 있으면 캐릭터 없이 생성한다. */
  characterId: string;
  promptSetId: string;
  prompt: string;
  /** 한 번에 만들 장수. 한 장씩 따로 요청해 Opus 무료 범위를 지킨다. */
  count: number;
  mode: 'txt2img' | 'img2img';
  /** i2i 원본. 자유 생성 결과이거나 파일에서 골라 `projects/free/inputs/`에 넣어 둔 이미지다. */
  source?: FreeImageSource;
};

export type FreeImageSource =
  | { kind: 'record'; generationId: string }
  | { kind: 'input'; imagePath: string; name: string; width: number; height: number };

export type Library = {
  schemaVersion: 2;
  settings: AppSettings;
  presets: Preset[];
  characters: Character[];
  emotionSets: EmotionSet[];
  references: Reference[];
  projects: Project[];
  pieceSets: PieceSet[];
  freeGeneration: FreeGeneration;
  lastProjectId?: string;
};

/**
 * 생성 방식. 인페인트는 지금의 레퍼런스 인셋, txt2img는 일반 생성, img2img는 이미지를 다시 그리기,
 * augment는 NovelAI 디렉터 툴이다. 이 구분이 생기기 전의 기록·큐는 모두 인페인트로 읽는다.
 */
export type GenerationKind = 'inpaint' | 'txt2img' | 'img2img' | 'augment';

/** 디렉터 툴 종류. NovelAI `augment-image`의 `req_type` 값이다. */
export type AugmentTool =
  'emotion' | 'bg-removal' | 'declutter' | 'lineart' | 'sketch' | 'colorize';

/** 완료된 생성 결과 한 건. 작업 폴더의 generations.json에 누적된다. */
export type GenerationRecord = {
  id: string;
  kind: GenerationKind;
  /** 이전 생성 결과를 입력으로 썼으면(i2i·디렉터 툴) 그 기록 ID. */
  sourceRecordId?: string;
  projectId: string;
  /** 자유 생성은 감정이 없어 비어 있고, 입력한 프롬프트는 `emotionPrompt`에 남는다. */
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
  /** 큐에 넣을 때 계산한 예상 Anlas. */
  anlasEstimate?: number;
};

export type JobStatus =
  'queued' | 'generating' | 'retry_wait' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

/** 모든 생성 방식에 공통인 작업 내용. 등록한 뒤에는 바뀌지 않는다. */
type JobSnapshotCommon = {
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
  /** NovelAI에 요청하는 크기. 인페인트는 캔버스 크기이고, 나머지는 결과 크기와 같다. */
  canvasWidth: number;
  canvasHeight: number;
  outputFilenameTemplate: string;
  settings: GenerationSettings;
  warnings: string[];
  /** 이전 생성 결과를 입력으로 쓰면 그 기록 ID. */
  sourceRecordId?: string;
};

/** 입력 이미지가 있는 작업. 작업 폴더 기준 상대 경로이고, 해시 이름으로 저장된 불변 입력 파일이다. */
type SourceImage = {
  imagePath: string;
  imageSha256: string;
};

export type InpaintJobSnapshot = JobSnapshotCommon &
  SourceImage & {
    kind: 'inpaint';
    maskPath: string;
    maskSha256: string;
    /** 캔버스에서 결과로 남길 영역. */
    outputRect: Rect;
    keepDiagnosticCanvas: boolean;
  };

export type Txt2ImgJobSnapshot = JobSnapshotCommon & { kind: 'txt2img' };

export type Img2ImgJobSnapshot = JobSnapshotCommon &
  SourceImage & {
    kind: 'img2img';
    strength: number;
    noise: number;
  };

export type AugmentJobSnapshot = JobSnapshotCommon &
  SourceImage & {
    kind: 'augment';
    tool: AugmentTool;
    /** Emotion 툴의 감정 이름(NovelAI 목록의 값). */
    mood?: string;
    /** Emotion·Colorize에 덧붙이는 프롬프트. */
    toolPrompt: string;
    /** 툴 효과를 약하게 하는 단계. 0이 가장 강하고 5가 가장 약하다. */
    defry: number;
  };

export type GenerationJobSnapshot =
  InpaintJobSnapshot | Txt2ImgJobSnapshot | Img2ImgJobSnapshot | AugmentJobSnapshot;

export type QueuedGenerationJob = GenerationJobSnapshot & {
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
  /** 큐에 넣을 때 계산한 예상 Anlas. 이 값이 생기기 전에 넣은 작업에는 없다. */
  anlasEstimate?: number;
};

export type QueueSnapshot = {
  paused: boolean;
  updatedAt: string;
  jobs: QueuedGenerationJob[];
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
  QueuedGenerationJob,
  | 'id'
  | 'kind'
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
  | 'anlasEstimate'
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
