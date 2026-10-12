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

/** V5 Full의 Effort. NovelAI 웹은 Medium을 별도 모델 ID(`-medium`)로 보낸다. */
export type Effort = 'high' | 'medium';

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
  /**
   * V5 Full이 아닌 모델에서는 무시한다. Medium이면 Steps·Sampler·UC 프리셋·CFG Rescale이 고정되고 네거티브는
   * 보내지 않는다(`effectiveGenerationSettings`). 저장된 값은 그대로 두어 High로 돌아오면 되살아난다.
   */
  effort: Effort;
  /** NovelAI의 Variety+. 모델이 지원하지 않으면(V5) 무시한다. */
  variety: boolean;
  /** V3 전용 SMEA·SMEA DYN. 다른 모델과 i2i·인페인트에서는 무시한다. */
  smea: SmeaMode;
  /** V3 전용 Decrisp(`dynamic_thresholding`). */
  decrisp: boolean;
};

export type SmeaMode = 'off' | 'smea' | 'dyn';

/** 사이드바 작업 목록과 라이브러리 목록에서 묶어 둔 폴더 이름. 없으면 폴더 밖에 있다. */
export type FolderName = string;

export type Preset = {
  id: string;
  name: string;
  folder?: FolderName;
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
  folder?: FolderName;
  promptSets: CharacterPromptSet[];
  createdAt: string;
};

export type Emotion = {
  id: string;
  name: string;
  /** 첫 캐릭터의 씬 프롬프트. 생성 설정의 씬 프롬프트 위치(공통 끝·캐릭터 끝)에 붙는다. */
  prompt: string;
  /**
   * 두 번째 캐릭터부터의 씬 프롬프트(순서 기준). 그 캐릭터 프롬프트 끝에 붙고, 비어 있으면 그 캐릭터에는 붙이지
   * 않는다. 씬 모음은 여러 작업이 함께 쓰므로 캐릭터 ID가 아니라 순서로 맞춘다.
   */
  extraPrompts?: string[];
  /** Emotion 툴로 씬 세트를 만들 때 이 씬에 쓰는 표정(NovelAI 값, 예: happy). 비어 있으면 씬 이름으로 추천한다. */
  augmentMood?: string;
  /** 위 표정의 강도(defry). 0이 가장 강하고 5가 가장 약하다. */
  augmentDefry?: number;
};

/** 감정 모음: 감정 이름과 프롬프트 목록. 여러 작업에서 공유할 수 있다. */
export type EmotionSet = {
  id: string;
  name: string;
  folder?: FolderName;
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
  folder?: FolderName;
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
  };
  layout: CanvasLayout;
  maskExpansionPx: number;
  backgroundThreshold: number;
  updatedAt: string;
};

/**
 * 인페인트(`reference`, 예전 이름 레퍼런스 생성)는 참고 이미지 옆에 인페인트하고, 일반 생성은 참고 이미지
 * 없이 txt2img로 만든다.
 */
export type ProjectMode = 'reference' | 'txt2img';

/** 0~1의 캔버스 위치. NovelAI 요청의 `centers`와 같다. */
export type CharacterCenter = { x: number; y: number };

export type ExtraCharacterPrompt = { name: string; prompt: string; negative: string };

/** 작업·자유 생성에 넣은 캐릭터 한 명. */
export type CharacterSlot = {
  characterId: string;
  promptSetId: string;
  /** 위치를 직접 지정할 때(`positionMode: 'manual'`) 쓴다. V4·V4.5는 5×5 칸의 가운데 값이다. */
  center?: CharacterCenter;
};

/** 캐릭터 위치: AI가 정함(`use_coords: false`) 또는 직접 지정. */
export type CharacterPositionMode = 'ai' | 'manual';

/** 작업: 프리셋 · 캐릭터 · 감정 모음 · 레퍼런스를 골라 묶은 조합. 생성 결과는 작업에 쌓인다. */
export type Project = {
  id: string;
  name: string;
  folder?: FolderName;
  mode: ProjectMode;
  presetId: string;
  /** 비어 있으면 캐릭터 없이 생성한다. 인페인트의 참고 이미지는 첫 캐릭터만 참고가 된다. */
  characters: CharacterSlot[];
  positionMode: CharacterPositionMode;
  emotionSetId: string;
  /** 인페인트 방식에서만 쓰지만, 모드를 다시 바꿀 때를 위해 남겨 둔다. */
  referenceId: string;
  /**
   * 캐릭터 레퍼런스와 바이브 중 무엇을 쓰는지. 둘은 함께 쓰지 않아, 고른 것은 둘 다 남겨 두고 이 값으로 고른다.
   * 없으면 캐릭터 레퍼런스를 골라 둔 작업은 캐릭터 레퍼런스, 아니면 바이브다.
   */
  aidMode?: AidMode;
  /** 고른 캐릭터 레퍼런스(고른 순서). 여럿이면 NovelAI가 섞어 한 캐릭터로 그린다. */
  characterReferenceIds: string[];
  /** 고른 바이브(고른 순서). 일반 생성과 인페인트에 쓴다. */
  vibeIds: string[];
  /** NovelAI의 Normalize Reference Strengths. 없으면 켠다(NovelAI 웹 기본값). */
  normalizeVibes?: boolean;
  /** 일괄 생성에서 제외할 감정. */
  excludedEmotionIds: string[];
  /** 감정별 대표 이미지(생성 기록 ID). */
  favorites: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type AidMode = 'character' | 'vibe';

/** 캐릭터 레퍼런스가 따라 그리는 것. NovelAI 요청의 `base_caption` 값 그대로다. */
export type ReferenceTarget = 'character&style' | 'character' | 'style';

/** 캐릭터 레퍼런스·바이브의 그림. 작업 폴더의 `pictures/`에 내용 해시 이름으로 둔다. */
export type Picture = {
  file: string;
  width: number;
  height: number;
  /** 불러온 파일 이름. */
  name: string;
};

/**
 * 캐릭터 레퍼런스: 그림의 캐릭터를 따라 그린다(일반 생성·인페인트). V4.5 전용이고(0단계: V5는 500 오류) Opus여도
 * 레퍼런스마다 한 장에 5 Anlas가 든다.
 */
export type CharacterReference = {
  id: string;
  name: string;
  folder?: FolderName;
  image?: Picture;
  target: ReferenceTarget;
  /** 세기(Strength). NovelAI 웹 슬라이더는 0~1이지만 그 밖의 값도 그대로 보낸다. */
  strength: number;
  /** 충실도(Fidelity). 요청의 secondary strength는 1 - 이 값이다. */
  fidelity: number;
  updatedAt: string;
};

/** 바이브: 그림의 분위기·그림체를 따라간다. V4.5 전용이고, 인코딩 한 번에 2 Anlas가 든다. */
export type Vibe = {
  id: string;
  name: string;
  folder?: FolderName;
  image?: Picture;
  /** 세기. NovelAI 웹 슬라이더는 0~1이지만 그 밖의 값도 그대로 보낸다. */
  strength: number;
  /** 인코딩의 information_extracted(0~1). 바꾸면 다시 인코딩한다. */
  informationExtracted: number;
  /**
   * 원본 그림 없이 인코딩만 가져온 바이브(NovelAI 바이브 파일의 `type: 'encoding'`, 이미지 메타데이터)의 인코딩
   * 이름. 있으면 그림은 보기용이고, 가져온 모델·정보 추출 값으로만 쓸 수 있다(다시 인코딩할 원본이 없다).
   */
  encodingId?: string;
  updatedAt: string;
};

export type JobVibe = {
  /** 라이브러리 항목 이름. 결과 정보에 보인다. */
  name: string;
  /** 인코딩할 원본 그림. 인코딩 결과는 작업 폴더 밖 `vibes/`에 두고 다시 쓴다. */
  imagePath: string;
  imageSha256: string;
  strength: number;
  informationExtracted: number;
  /** 인코딩만 있는 바이브. 인코딩 결과를 그림 해시 대신 이 이름으로 찾고, 없으면 인코딩하지 않고 막는다. */
  encodingId?: string;
};

export type JobReference = {
  name: string;
  /** 정해진 캔버스(1024×1536 등)에 검은 여백을 넣어 맞춘 그림. */
  imagePath: string;
  imageSha256: string;
  target: ReferenceTarget;
  strength: number;
  fidelity: number;
};

/** 작업에 넣는 참고 방식. 그림은 작업 폴더의 `inputs/`에 해시 이름으로 둔 불변 입력이다. */
export type JobAid =
  | { kind: 'character'; references: JobReference[] }
  | {
      kind: 'vibe';
      vibes: JobVibe[];
      /** Normalize Reference Strengths. 없으면 켠다. 이 값이 생기기 전의 작업은 모두 켠 채로 보냈다. */
      normalize?: boolean;
    };

/** 결과 기록에 남기는 참고 방식(그림 경로는 뺀다). */
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

/**
 * 결과·전체 캔버스를 저장할 형식. WebP 무손실은 픽셀이 PNG와 똑같아(NovelAI가 알파 채널에 숨긴 정보도
 * 남는다) 실측 약 40% 작고, 텍스트 메타데이터는 XMP에 넣는다.
 */
export type StorageFormat = 'png' | 'webp-lossless';

export type AppSettings = {
  outputFilenameTemplate: string;
  keepDiagnosticCanvas: boolean;
  storageFormat: StorageFormat;
  export: {
    format: ExportFormat;
    quality: number;
    target: 'favorite' | 'latest';
  };
  /** NovelAI 요청 사이에 기다리는 시간(0~1000ms). */
  requestDelayMs: number;
  /** 스트리밍으로 생성 과정의 중간 그림을 받아 보여 준다. 받는 모델(V4·V4.5·V5)만 바뀐다. */
  streaming: boolean;
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
  characters: CharacterSlot[];
  positionMode: CharacterPositionMode;
  prompt: string;
  /** 한 번에 만들 장수. 한 장씩 따로 요청해 Opus 무료 범위를 지킨다. */
  count: number;
  mode: 'txt2img' | 'img2img' | 'augment';
  /** i2i로 다시 그리거나 디렉터 툴을 적용할 이미지. */
  image?: FreeImage;
  /** 디렉터 툴 모드의 설정. 비어 있으면 기본값(`DEFAULT_AUGMENT_SETTINGS`)이다. */
  augment?: AugmentSettings;
  /** i2i에서 마스크로 칠한 곳만 다시 그린다(인페인팅). 끄면 이미지 전체를 i2i한다. */
  inpaint: boolean;
  /** 입력한 프롬프트를 붙일 곳. 캐릭터 프롬프트가 비어 있으면 공통 포지티브 끝에 붙인다. */
  promptPosition: EmotionPosition;
  /** 참고(캐릭터 레퍼런스·바이브). 뜻은 `Project`의 같은 필드와 같다. 디렉터 툴에는 쓰지 않는다. */
  aidMode?: AidMode;
  characterReferenceIds: string[];
  vibeIds: string[];
  normalizeVibes?: boolean;
};

/**
 * 자유 생성 i2i에서 다시 그릴 이미지와 인페인팅 마스크. 파일은 `sources/`에 있다. NovelAI는 64의 배수 크기만
 * 받으므로 이미지 오른쪽·아래에 여백을 넣어 두고, 결과에서는 `outputRect`(원래 이미지 영역)만 남긴다.
 */
export type FreeImage = {
  name: string;
  file: string;
  width: number;
  height: number;
  outputRect: Rect;
  /** 비어 있으면 아직 마스크를 칠하지 않았다. */
  maskFile?: string;
  /** 생성 결과에서 가져왔으면 그 기록. 자유 생성 결과였으면 새 결과에 `sourceRecordId`로 남긴다. */
  fromRecord?: { projectId: string; generationId: string };
};

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

/**
 * 생성 방식. 인페인트는 지금의 레퍼런스 인셋, txt2img는 일반 생성, img2img는 이미지를 다시 그리기,
 * augment는 NovelAI 디렉터 툴이다. 이 구분이 생기기 전의 기록·큐는 모두 인페인트로 읽는다.
 */
export type GenerationKind = 'inpaint' | 'txt2img' | 'img2img' | 'augment';

/** 디렉터 툴 종류. NovelAI `augment-image`의 `req_type` 값이다. */
export type AugmentTool =
  'emotion' | 'bg-removal' | 'declutter' | 'lineart' | 'sketch' | 'colorize';

/** 디렉터 툴에 고른 값. 디렉터 툴 창과 자유 생성의 디렉터 툴이 쓴다. */
export type AugmentSettings = {
  tool: AugmentTool;
  /** Emotion 툴의 표정(NovelAI 값). */
  mood: string;
  /** Emotion·Colorize에 덧붙이는 프롬프트. */
  toolPrompt: string;
  defry: number;
  /** 한 번에 보낼 횟수. */
  count: number;
};

/** 디렉터 툴 결과에 남기는 툴 설정. */
export type AugmentInfo = {
  tool: AugmentTool;
  mood?: string;
  toolPrompt?: string;
  defry?: number;
  /** 응답 한 번에 여러 장이 오면(배경 제거는 세 장) 0부터의 순서와 전체 장수. */
  part?: number;
  parts?: number;
};

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
  /** i2i·디렉터 툴에 실제로 보낸 입력(목표 크기로 맞춘 것). 작업 폴더의 `inputs/`에 있다. */
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
  /** 두 번째 캐릭터부터의 최종 캐릭터 프롬프트. 첫 캐릭터는 `characterPrompt`다. */
  extraCharacters?: ExtraCharacterPrompt[];
  /** 위치를 직접 지정했으면 첫 캐릭터부터의 위치. 없으면 AI가 정했다. */
  characterCenters?: CharacterCenter[];
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
export type JobSnapshotCommon = {
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
  /** 두 번째 캐릭터부터의 최종 캐릭터 프롬프트. 첫 캐릭터는 `characterPrompt`다. */
  extraCharacters?: ExtraCharacterPrompt[];
  /** 위치를 직접 지정하면 첫 캐릭터부터의 위치. 없으면 AI가 정한다(`use_coords: false`). */
  characterCenters?: CharacterCenter[];
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
  /** 캐릭터 레퍼런스·바이브. 일반 생성과 인페인트에만 쓴다. */
  aid?: JobAid;
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
    /** 결과에서 남길 영역. 비어 있으면 받은 이미지 전체다. */
    outputRect?: Rect;
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
