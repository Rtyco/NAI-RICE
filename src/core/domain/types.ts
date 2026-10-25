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

/** V5 전용. 다른 모델은 standard뿐이다. */
export type QualityLevel = 'standard' | 'light';

/** `middle`: 상위(+추가 프롬프트)와 하위 사이. 상위에 `|` 자리가 있으면 SDStudio처럼 나눠 채운다. */
export type EmotionPosition = 'middle' | 'character-end';

/** V5 Full 전용. NovelAI는 medium을 모델 ID `-medium`으로 보낸다. */
export type Effort = 'high' | 'medium';

/** `character-start`: 성별 태그(girl, boy …) 바로 뒤. */
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
  qualityTags: boolean;
  qualityLevel: QualityLevel;
  ucPreset: UcPresetId;
  /** 직접 쓴 태그가 있으면 넣지 않고, 꺼도 지우지 않는다. */
  referenceInset: boolean;
  referenceInsetPosition: ReferenceInsetPosition;
  emotionPosition: EmotionPosition;
  /** txt2img 결과 크기. 인페인트는 참고 이미지 캔버스 크기를 쓴다. */
  width: number;
  height: number;
  /** 0~1 */
  img2imgStrength: number;
  img2imgNoise: number;
  /** V5 Full에서만 쓴다. medium은 일부 설정을 고정한다(`effectiveGenerationSettings`). */
  effort: Effort;
  variety: boolean;
  /** V3 전용. i2i·인페인트에서는 무시한다. */
  smea: SmeaMode;
  /** V3 전용(`dynamic_thresholding`). */
  decrisp: boolean;
};

export type SmeaMode = 'off' | 'smea' | 'dyn';

/** 없으면 폴더 밖. */
export type FolderName = string;

export type Preset = {
  id: string;
  name: string;
  folder?: FolderName;
  /** 상위 프롬프트 */
  commonPositive: string;
  /** 하위 프롬프트 */
  backPositive: string;
  commonNegative: string;
  generation: GenerationSettings;
};

export type CharacterPromptSet = {
  id: string;
  name: string;
  positive: string;
  negative: string;
};

export type Character = {
  id: string;
  name: string;
  folder?: FolderName;
  promptSets: CharacterPromptSet[];
  createdAt: string;
};

export type Emotion = {
  id: string;
  name: string;
  /** 첫 캐릭터용. */
  prompt: string;
  /** 두 번째 캐릭터부터. 씬 모음은 여러 작업이 함께 써서 캐릭터 ID가 아니라 순서로 맞춘다. */
  extraPrompts?: string[];
  /** 씬 프롬프트와 같은 쪽 네거티브 뒤에 붙는다. */
  negative?: string;
  /** NovelAI mood 값(예: happy). 비면 씬 이름으로 추천한다. */
  augmentMood?: string;
  /** 0(강함)~5(약함) */
  augmentDefry?: number;
  /**
   * SDStudio 조합 칸. 칸마다 켜진 후보 하나씩 고른 모든 조합을 생성한다. 켜진 후보가 없는 칸이 있으면
   * 조합이 0개다(SDStudio와 같다). 고른 후보는 위의 고정 프롬프트 뒤에 붙는다.
   */
  slots?: SceneOption[][];
  /** 생성 설정의 seed 방식보다 우선한다(SDStudio 씬 seed). */
  seed?: number;
  /** 일반 생성의 결과 크기(SDStudio 씬 해상도). 인페인트는 캔버스 크기를 쓴다. 둘 다 있거나 둘 다 없다. */
  width?: number;
  height?: number;
};

export type SceneOption = {
  id: string;
  /** 비면 프롬프트로 보여 준다. */
  name?: string;
  /** 씬 프롬프트 자리 몫 */
  prompt: string;
  /** j번째 캐릭터 몫(0이 첫 캐릭터). 위치 설정과 관계없이 그 캐릭터 프롬프트에 붙는다. */
  characterPrompts: string[];
  enabled: boolean;
};

export type SceneOptionText = Pick<SceneOption, 'prompt' | 'characterPrompts'>;

export type EmotionSet = {
  id: string;
  name: string;
  folder?: FolderName;
  emotions: Emotion[];
};

/** `<세트.조각>`으로 부르는 문구(SDStudio 문법). multi면 줄마다 후보 하나이고 seed로 고른다. */
export type PromptPiece = {
  id: string;
  name: string;
  prompt: string;
  multi: boolean;
};

export type PieceSet = {
  id: string;
  name: string;
  folder?: FolderName;
  pieces: PromptPiece[];
};

export type ResolutionPresetId = '1216x832' | '832x1216' | '1024x1024' | 'custom';
export type ReferenceSide = 'left' | 'right' | 'top' | 'bottom';

/** 참고 영역 기준이라 해상도·비율을 바꿔도 구도가 유지된다. */
export type FreePlacement = {
  /** 이미지 중심. 참고 영역 너비·높이에 대한 비율(0.5가 가운데) */
  x: number;
  y: number;
  /** 1 = 전체 보이기 크기 */
  scaleX: number;
  scaleY: number;
  /** 도, 시계 방향 */
  rotation: number;
  flipX: boolean;
};

export type CanvasLayout = {
  mode: 'auto' | 'prepared';
  resolution: ResolutionPresetId;
  width: number;
  height: number;
  referenceSide: ReferenceSide;
  /** 0.2~0.8 */
  referenceRatio: number;
  fit: 'contain' | 'cover' | 'free';
  /** cover로 잘릴 때 남길 쪽이기도 하다. */
  anchor: 'top' | 'center' | 'bottom';
  /** fit이 free일 때. 없으면 전체 보이기 */
  free?: FreePlacement;
  background: string;
};

export type DividerLine = {
  enabled: boolean;
  color: string;
  /** NovelAI 마스크 한 칸이 8px라 8 단위 */
  widthPx: number;
  /** 생성 영역 경계 기준. center는 반씩 걸친다. */
  placement: 'outside' | 'center' | 'inside';
  /** 경계에서 띄우는 px. center에서는 쓰지 않는다. */
  gapPx: number;
};

/** 파일은 `references/<id>/`. */
export type Reference = {
  id: string;
  name: string;
  folder?: FolderName;
  image?: {
    originalFile: string;
    canvasFile: string;
    maskFile: string;
    originalName: string;
    canvasWidth: number;
    canvasHeight: number;
    referenceRect: Rect;
    outputRect: Rect;
    /** 그리기 층(투명 PNG, 캔버스 크기). canvas.png에는 이미 합쳐져 있다. */
    paintFile?: string;
  };
  layout: CanvasLayout;
  divider: DividerLine;
  /** 작업의 인페인트 요청은 생성 설정 대신 이 값을 쓴다. 0~1 */
  inpaintStrength: number;
  maskExpansionPx: number;
  backgroundThreshold: number;
  updatedAt: string;
};

/** `reference`는 인페인트(예전 이름 레퍼런스 생성). */
export type ProjectMode = 'reference' | 'txt2img';

/** 0~1. NovelAI `centers`. */
export type CharacterCenter = { x: number; y: number };

export type ExtraCharacterPrompt = { name: string; prompt: string; negative: string };

export type CharacterSlot = {
  characterId: string;
  promptSetId: string;
  /** manual일 때만 쓴다. V4·V4.5는 5×5 칸의 가운데 값. */
  center?: CharacterCenter;
};

/** ai는 `use_coords: false`. */
export type CharacterPositionMode = 'ai' | 'manual';

export type Project = {
  id: string;
  name: string;
  folder?: FolderName;
  mode: ProjectMode;
  presetId: string;
  /** 비면 캐릭터 없이 생성한다. 인페인트 참고 이미지는 첫 캐릭터용. */
  characters: CharacterSlot[];
  positionMode: CharacterPositionMode;
  emotionSetId: string;
  /** 상위 프롬프트 뒤, 씬 프롬프트 앞(SDStudio 추가 프롬프트). 생성 설정에는 저장하지 않는다. */
  extraPrompt?: string;
  /** 인페인트에서만 쓰지만 모드를 바꿔도 남겨 둔다. */
  referenceId: string;
  /** 없으면 캐릭터 레퍼런스를 골라 둔 작업은 캐릭터 레퍼런스, 아니면 바이브. */
  aidMode?: AidMode;
  /** 고른 순서 */
  characterReferenceIds: string[];
  /** 고른 순서 */
  vibeIds: string[];
  /** 없으면 켬(NovelAI 웹 기본값). */
  normalizeVibes?: boolean;
  /** 다듬기 창에서 마지막으로 쓴 값. 없으면 생성 설정의 i2i 값으로 시작한다. */
  refine?: RefineSettings;
  /** 켜면 이 작업의 씬 생성 결과마다 `refine`으로 다듬기를 이어 붙인다. */
  autoRefine?: boolean;
  excludedEmotionIds: string[];
  /** 감정 ID → 생성 기록 ID */
  favorites: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type AidMode = 'character' | 'vibe';

export type RefinePrompt = 'source' | 'negative-only' | 'empty' | 'custom';

export type RefineSettings = {
  /** 비면 원본 결과의 모델 */
  model: string;
  /** source 말고는 캐릭터 프롬프트와 위치를 뺀다. empty는 네거티브까지 비운다. */
  prompt: RefinePrompt;
  /** prompt가 custom일 때 그대로 보낸다(조각·품질 태그를 펼치지 않는다). */
  customPositive?: string;
  customNegative?: string;
  /** 비율 방식이면 결과마다 크기를 정한다(`RATIO_SIZES`). */
  size: { width: number; height: number } | 'exact-ratio' | 'closest-ratio';
  fit: 'crop' | 'pad';
  strength: number;
  noise: number;
  /** 결과 하나마다 */
  count: number;
  /** source: 원본 seed부터 장마다 +1 */
  seedMode: 'source' | 'random';
};

/** NovelAI `base_caption` 값. */
export type ReferenceTarget = 'character&style' | 'character' | 'style';

/** 작업 폴더 `pictures/`에 내용 해시 이름으로 둔다. */
export type Picture = {
  file: string;
  width: number;
  height: number;
  name: string;
};

/** V4.5 전용(V5는 500 오류). Opus여도 레퍼런스마다 장당 5 Anlas. */
export type CharacterReference = {
  id: string;
  name: string;
  folder?: FolderName;
  image?: Picture;
  target: ReferenceTarget;
  /** 0~1 밖의 값도 그대로 보낸다. */
  strength: number;
  /** 요청의 secondary strength는 1 - fidelity. */
  fidelity: number;
  updatedAt: string;
};

/** V4.5 전용. 인코딩마다 2 Anlas. */
export type Vibe = {
  id: string;
  name: string;
  folder?: FolderName;
  image?: Picture;
  /** 0~1 밖의 값도 그대로 보낸다. */
  strength: number;
  /** 0~1. 바꾸면 다시 인코딩한다. */
  informationExtracted: number;
  /** 원본 없이 가져온 인코딩(바이브 파일·이미지 메타데이터)의 이름. 있으면 그림은 보기용이고 다시 인코딩할 수 없다. */
  encodingId?: string;
  updatedAt: string;
};

export type JobVibe = {
  name: string;
  /** 인코딩 결과는 작업 폴더 밖 `vibes/`에 캐시한다. */
  imagePath: string;
  imageSha256: string;
  strength: number;
  informationExtracted: number;
  /** 있으면 캐시를 이 이름으로 찾고, 없으면 인코딩하지 않고 막는다. */
  encodingId?: string;
};

export type JobReference = {
  name: string;
  /** 정해진 캔버스(1024×1536 등)에 검은 여백으로 맞춘 그림. */
  imagePath: string;
  imageSha256: string;
  target: ReferenceTarget;
  strength: number;
  fidelity: number;
};

/** 그림은 `inputs/`의 해시 이름 파일(불변). */
export type JobAid =
  | { kind: 'character'; references: JobReference[] }
  | {
      kind: 'vibe';
      vibes: JobVibe[];
      /** 없으면 켬. 이 값 이전의 작업은 모두 켠 채로 보냈다. */
      normalize?: boolean;
    };

/** 그림 경로는 뺀다. */
export type RecordAid =
  | {
      kind: 'character';
      references: Array<{
        name: string;
        target: ReferenceTarget;
        strength: number;
        fidelity: number;
      }>;
    }
  | {
      kind: 'vibe';
      vibes: Array<{ name: string; strength: number; informationExtracted: number }>;
      normalize?: boolean;
    };

export type ExportFormat = 'png' | 'webp' | 'avif';
export type ExportScope = 'scene' | 'combo' | 'all';

export type NaiTagFamily =
  'v5' | 'v5-curated' | 'v4-5-full' | 'v4-5-curated' | 'v4-full' | 'v4-curated' | 'v3' | 'v3-furry';

export type NaiTagTable = {
  quality: Partial<Record<QualityLevel, string>>;
  uc: Partial<Record<Exclude<UcPresetId, 'none'>, string>>;
  /** UC 프리셋이 없고 네거티브도 비었을 때 NovelAI 웹이 보내는 값(V3: `lowres`). */
  emptyUc?: string;
  /** 예전 문구. 옛 이미지를 불러올 때만 쓴다. */
  legacyQuality?: Partial<Record<QualityLevel, string>>;
  legacyUc?: Partial<Record<Exclude<UcPresetId, 'none'>, string>>;
};

/** WebP 무손실은 PNG와 픽셀이 같고(알파 채널 정보 유지) 약 40% 작다. 메타데이터는 XMP에 넣는다. */
export type StorageFormat = 'png' | 'webp-lossless';

export type AppSettings = {
  outputFilenameTemplate: string;
  keepDiagnosticCanvas: boolean;
  storageFormat: StorageFormat;
  export: {
    format: ExportFormat;
    quality: number;
    target: 'favorite' | 'latest';
    /** 씬마다 한 장, 조합마다 한 장, 모든 생성 결과 */
    scope: ExportScope;
    /** 씬 내보내기 파일 이름. 토큰은 `EXPORT_FILENAME_TOKENS`. */
    filenameTemplate: string;
  };
  /** 0~1000ms */
  requestDelayMs: number;
  /** V4·V4.5·V5에만 적용된다. */
  streaming: boolean;
  tagAutocomplete: boolean;
  appearance: {
    theme: ThemeId;
    mode: ThemeMode;
  };
  layout: {
    focusLevel: FocusLevel;
    edgePeek: boolean;
  };
  update: {
    autoCheck: boolean;
    /** 더 새 버전이 나오면 다시 알린다. */
    skippedVersion: string;
    /** 바뀐 점 안내까지 확인한 앱 버전. 비면 1.1.1 이하에서 올라왔다. */
    seenVersion: string;
  };
};

/** 집중 모드(Tab)가 숨기는 범위 */
export type FocusLevel = 'panels' | 'inputs' | 'all';

export type ThemeId = 'navy' | 'graphite' | 'violet' | 'forest' | 'rose';
export type ThemeMode = 'dark' | 'light' | 'system';

/** 결과는 `projects/free/`에 쌓인다. */
export type FreeGeneration = {
  /** 비었거나 지워졌으면 첫 생성 설정. */
  presetId: string;
  /** 비면 캐릭터 없이 생성한다. */
  characters: CharacterSlot[];
  positionMode: CharacterPositionMode;
  prompt: string;
  /** `prompt`와 같은 쪽 네거티브 뒤에 붙는다. */
  negative: string;
  /** 한 장씩 따로 요청한다(Opus 무료 범위). */
  count: number;
  mode: 'txt2img' | 'img2img' | 'augment';
  image?: FreeImage;
  /** 없으면 `DEFAULT_AUGMENT_SETTINGS`. */
  augment?: AugmentSettings;
  /** 끄면 이미지 전체를 i2i한다. */
  inpaint: boolean;
  /** 캐릭터 프롬프트가 비면 `middle`. */
  promptPosition: EmotionPosition;
  /** `Project`와 같다. 디렉터 툴에는 쓰지 않는다. */
  aidMode?: AidMode;
  characterReferenceIds: string[];
  vibeIds: string[];
  normalizeVibes?: boolean;
};

/** 파일은 `sources/`. NovelAI는 64 배수 크기만 받아 오른쪽·아래에 여백을 넣고, 결과에서는 `outputRect`만 남긴다. */
export type FreeImage = {
  name: string;
  file: string;
  width: number;
  height: number;
  outputRect: Rect;
  /** 없으면 마스크를 아직 칠하지 않았다. */
  maskFile?: string;
  /** 자유 생성 결과였으면 새 결과의 `sourceRecordId`가 된다. */
  fromRecord?: { projectId: string; generationId: string };
  /** 라이브러리 인페인트에서 복사했으면 인페인팅에 reference inset을 붙이고 이 세기(0~1)를 쓴다. */
  fromReference?: FreeImageReference;
};

export type FreeImageReference = { referenceId: string; name: string; inpaintStrength: number };

export type Library = {
  schemaVersion: 2;
  settings: AppSettings;
  presets: Preset[];
  characters: Character[];
  emotionSets: EmotionSet[];
  references: Reference[];
  characterReferences: CharacterReference[];
  vibes: Vibe[];
  projects: Project[];
  pieceSets: PieceSet[];
  freeGeneration: FreeGeneration;
  lastProjectId?: string;
};

export type LibrarySection =
  | 'presets'
  | 'characters'
  | 'emotionSets'
  | 'references'
  | 'characterReferences'
  | 'vibes'
  | 'pieceSets';

/** 이 값 이전의 기록·큐는 모두 inpaint로 읽는다. */
export type GenerationKind = 'inpaint' | 'txt2img' | 'img2img' | 'augment';

/** NovelAI `augment-image`의 `req_type`. */
export type AugmentTool =
  'emotion' | 'bg-removal' | 'declutter' | 'lineart' | 'sketch' | 'colorize';

export type AugmentSettings = {
  tool: AugmentTool;
  /** NovelAI mood 값. */
  mood: string;
  toolPrompt: string;
  defry: number;
  count: number;
};

export type AugmentInfo = {
  tool: AugmentTool;
  mood?: string;
  toolPrompt?: string;
  defry?: number;
  /** 응답 한 번에 여러 장일 때(배경 제거는 3장) 0부터의 순서. */
  part?: number;
  parts?: number;
};

/** 작업 폴더의 generations.json에 쌓인다. */
export type GenerationRecord = {
  id: string;
  kind: GenerationKind;
  /** i2i·디렉터 툴의 입력이 된 기록. */
  sourceRecordId?: string;
  projectId: string;
  /** 자유 생성은 빈 값. 입력 프롬프트는 `emotionPrompt`에 남는다. */
  emotionId: string;
  emotionName: string;
  createdAt: string;
  file: string;
  thumbFile?: string;
  canvasFile?: string;
  /** 실제로 보낸 입력(목표 크기). `inputs/`에 있다. */
  inputFile?: string;
  augment?: AugmentInfo;
  aid?: RecordAid;
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
  /** 두 번째 캐릭터부터. 첫 캐릭터는 `characterPrompt`. */
  extraCharacters?: ExtraCharacterPrompt[];
  /** 없으면 AI가 정했다. */
  characterCenters?: CharacterCenter[];
  emotionPrompt: string;
  /** 이 값 이전의 기록에는 없다. */
  emotionNegative?: string;
  /** 두 번째 캐릭터부터의 씬 프롬프트. 1.1.2 이전 기록에는 없다. */
  emotionExtraPrompts?: string[];
  /** 조합 칸이 있는 씬이면 고른 후보 ID(`comboKey`)와 이름. */
  comboKey?: string;
  comboName?: string;
  /** 고른 후보의 내용(`comboKey` 순서). 1.1.2 이전 기록에는 없다. */
  comboOptions?: SceneOptionText[];
  settings: GenerationSettings;
  /** 생성 전후 Anlas 차이. 조회할 수 없었으면 없다. */
  anlasSpent?: number;
  anlasEstimate?: number;
};

export type JobStatus =
  'queued' | 'generating' | 'retry_wait' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

/** 등록한 뒤에는 바뀌지 않는다. */
export type JobSnapshotCommon = {
  id: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  characterName: string;
  emotionId: string;
  emotionName: string;
  emotionPrompt: string;
  emotionNegative?: string;
  emotionExtraPrompts?: string[];
  comboKey?: string;
  comboName?: string;
  comboOptions?: SceneOptionText[];
  presetName: string;
  promptSetName: string;
  emotionSetName: string;
  referenceName: string;
  /** reference inset·품질 태그 포함. */
  prompt: string;
  /** UC 프리셋 포함. */
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  /** 두 번째 캐릭터부터. 첫 캐릭터는 `characterPrompt`. */
  extraCharacters?: ExtraCharacterPrompt[];
  /** 없으면 AI가 정한다(`use_coords: false`). */
  characterCenters?: CharacterCenter[];
  /** 사용자 입력 원문. 메타데이터에 따로 남긴다. */
  source: {
    /** 상위 프롬프트 */
    commonPositive: string;
    /** 1.1.1 이하 기록에는 없다. */
    backPositive?: string;
    extraPrompt?: string;
    commonNegative: string;
    characterPositive: string;
  };
  seed: number;
  variantIndex: number;
  /** 인페인트는 캔버스 크기, 나머지는 결과 크기. */
  canvasWidth: number;
  canvasHeight: number;
  outputFilenameTemplate: string;
  settings: GenerationSettings;
  warnings: string[];
  sourceRecordId?: string;
  /** 일반 생성·인페인트에만 쓴다. */
  aid?: JobAid;
  /** 있으면 끝난 결과마다 이 값으로 다듬기를 큐에 이어 붙인다. */
  refine?: RefineSettings;
};

/** 작업 폴더 기준 상대 경로. 해시 이름의 불변 파일이다. */
type SourceImage = {
  imagePath: string;
  imageSha256: string;
};

export type InpaintJobSnapshot = JobSnapshotCommon &
  SourceImage & {
    kind: 'inpaint';
    maskPath: string;
    maskSha256: string;
    outputRect: Rect;
    keepDiagnosticCanvas: boolean;
  };

export type Txt2ImgJobSnapshot = JobSnapshotCommon & { kind: 'txt2img' };

export type Img2ImgJobSnapshot = JobSnapshotCommon &
  SourceImage & {
    kind: 'img2img';
    strength: number;
    noise: number;
    /** 없으면 이미지 전체. */
    outputRect?: Rect;
  };

export type AugmentJobSnapshot = JobSnapshotCommon &
  SourceImage & {
    kind: 'augment';
    tool: AugmentTool;
    /** NovelAI mood 값. */
    mood?: string;
    toolPrompt: string;
    /** 0(강함)~5(약함) */
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
  /** 이 값 이전의 작업에는 없다. */
  anlasEstimate?: number;
};

export type QueueSnapshot = {
  paused: boolean;
  updatedAt: string;
  jobs: QueuedGenerationJob[];
};

/** 무거운 프롬프트·설정을 뺀 기록(715장 기준 2.7MB → 0.9MB). 정보 패널은 전체 기록을 따로 받는다. */
export type GenerationSummary = Omit<
  GenerationRecord,
  | 'prompt'
  | 'negativePrompt'
  | 'characterPrompt'
  | 'characterNegativePrompt'
  | 'emotionExtraPrompts'
  | 'comboOptions'
  | 'settings'
> & { model: string };

/** 프롬프트·설정·입력 경로를 뺀다. */
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
    | 'missing-character-positive'
    | 'multiple-presets'
    | 'images-not-imported'
    | 'scene-characters-mixed';
  message: string;
  path?: string;
};
