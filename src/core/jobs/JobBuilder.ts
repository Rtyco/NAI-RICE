import type {
  AppSettings,
  AugmentJobSnapshot,
  AugmentSettings,
  AugmentTool,
  CharacterCenter,
  CharacterPositionMode,
  CharacterPromptSet,
  Emotion,
  EmotionPosition,
  EmotionSet,
  GenerationKind,
  GenerationRecord,
  Img2ImgJobSnapshot,
  InpaintJobSnapshot,
  JobSnapshotCommon,
  PieceSet,
  Preset,
  Project,
  Rect,
  Reference,
  Txt2ImgJobSnapshot,
} from '../domain/types';
import {
  createPromptSet,
  DEFAULT_GENERATION_SETTINGS,
  effectiveGenerationSettings,
  FREE_PROJECT_ID,
  hasScenePrompt,
} from '../model/defaults';
import {
  composeSeparatedPrompts,
  referenceInsetCount,
  removeReferenceInset,
} from '../prompts/PromptComposer';
import { expandPieces } from '../prompts/PromptPieces';
import { requestCenters } from '../model/characterPositions';
import {
  applyNaiTags,
  emptyNegativeFor,
  maxCharactersFor,
  modelLabel,
  naiTagText,
  usesMedium,
} from '../providers/NaiModels';

/** 프롬프트를 만들 캐릭터 한 명. 첫 캐릭터가 참고 이미지의 캐릭터이고 씬 프롬프트의 첫 칸이 붙는다. */
export type JobCharacter = {
  name: string;
  promptSet: CharacterPromptSet;
  center?: CharacterCenter;
};

type EmotionJobBuildInput = {
  project: Project;
  preset: Preset;
  characters: JobCharacter[];
  emotionSet: EmotionSet;
  emotionIds: string[];
  settings: Pick<AppSettings, 'outputFilenameTemplate' | 'keepDiagnosticCanvas'>;
  /** 프롬프트의 `<세트.조각>` 참조를 펼칠 때 쓰는 프롬프트 조각. */
  pieceSets?: PieceSet[];
  /** 지정하면 설정의 Seed 방식보다 우선한다. "이 seed로 다시 생성"에 쓴다. */
  seedOverride?: number;
  variantsOverride?: number;
  now?: () => Date;
  randomSeed?: () => number;
};

/** 작업 폴더의 inputs/에 해시 이름으로 넣어 둔 인페인트 캔버스와 마스크. */
export type InpaintInput = {
  imagePath: string;
  maskPath: string;
  imageSha256: string;
  maskSha256: string;
};

export type JobBuildInput = EmotionJobBuildInput & {
  reference: Reference;
  input: InpaintInput;
};

export type Txt2ImgJobBuildInput = EmotionJobBuildInput;

/** 메인 프로세스가 목표 크기로 맞춰 작업 폴더의 inputs/에 넣어 둔 i2i 입력. */
export type ImageInput = { imagePath: string; imageSha256: string };

const UINT32 = 4_294_967_296;

/** 고정 seed에서도 변형마다 다른 결과가 나오도록 변형 번호만큼 seed를 이동한다. */
export function seedForVariant(baseSeed: number, variantIndex: number): number {
  return (((baseSeed + variantIndex - 1) % UINT32) + UINT32) % UINT32;
}

export type RequestPrompts = {
  prompt: string;
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  /** 두 번째 캐릭터부터. 이름은 비워 두고 작업을 만들 때 채운다. */
  extraCharacters: Array<{ prompt: string; negative: string }>;
  /** 찾지 못한 프롬프트 조각 참조. 있으면 생성하지 않는다. */
  missingPieces: string[];
};

/** 씬 하나의 프롬프트. 자유 생성처럼 입력한 문구 하나뿐이면 문자열로 넘긴다. */
export type ScenePrompts = string | Pick<Emotion, 'prompt' | 'extraPrompts'>;

/**
 * 프리셋·캐릭터들·씬으로 NovelAI에 보낼 최종 프롬프트를 만든다. 미리보기와 생성이 같은 함수를 쓴다.
 * 프롬프트 조각은 맨 먼저 펼친다. multi 조각은 seed로 줄을 고르며, seed가 없으면(미리보기) 첫 줄이다.
 * reference inset 태그는 참고 이미지를 옆에 두는 인페인트에만, 첫 캐릭터 쪽에 붙인다.
 */
export function composeRequestPrompts(
  rawPreset: Preset,
  rawCharacters: Array<Pick<CharacterPromptSet, 'positive' | 'negative'>>,
  scene: ScenePrompts | undefined,
  pieces: { sets: PieceSet[]; seed?: number } = { sets: [] },
  kind: GenerationKind = 'inpaint',
): RequestPrompts {
  const missing = new Set<string>();
  const expand = (text: string) => {
    const result = expandPieces(text, pieces.sets, pieces.seed);
    result.missing.forEach((ref) => missing.add(ref));
    return result.text;
  };
  const settings = effectiveGenerationSettings(rawPreset.generation);
  // NovelAI 웹은 Medium이면 직접 쓴 네거티브와 캐릭터 네거티브를 비우고 UC 프리셋만 보낸다(2026-10 웹 코드).
  const medium = usesMedium(settings);
  const commonPositive = expand(rawPreset.commonPositive);
  const commonNegative = medium ? '' : expand(rawPreset.commonNegative);
  const characters = rawCharacters.map((set) => ({
    positive: expand(set.positive),
    negative: medium ? '' : expand(set.negative),
  }));
  const first = characters[0] ?? { positive: '', negative: '' };
  const firstScene =
    scene === undefined ? undefined : typeof scene === 'string' ? scene : scene.prompt;
  const extraScenes = typeof scene === 'object' ? (scene.extraPrompts ?? []) : [];
  const emotionPrompt = firstScene === undefined ? undefined : expand(firstScene);
  const extraCharacters = characters.slice(1).map((character, index) => ({
    prompt: [character.positive, expand(extraScenes[index] ?? '')]
      .map((text) => text.trim().replace(/^[,\s]+|[,\s]+$/g, ''))
      .filter(Boolean)
      .join(', '),
    negative: character.negative,
  }));
  // 품질 태그는 reference inset 위치를 정할 수 있도록 따로 넘긴다.
  const insetWritten = extraCharacters.some((character) => referenceInsetCount(character.prompt));
  const prompts = composeSeparatedPrompts({
    commonPositive,
    qualityTags: naiTagText(settings.model, settings).quality,
    characterPositive: first.positive,
    emotion: emotionPrompt,
    // 캐릭터가 없으면 캐릭터 쪽에 붙일 곳이 없어 V4 캐릭터 프롬프트에 그것만 들어가므로 공통 쪽에 붙인다.
    emotionPosition: characters.length ? settings.emotionPosition : 'common-end',
    referenceInset: {
      enabled: settings.referenceInset && kind === 'inpaint' && !insetWritten,
      position: characters.length
        ? settings.referenceInsetPosition
        : settings.referenceInsetPosition === 'character-start'
          ? 'common-start'
          : settings.referenceInsetPosition === 'character-end'
            ? 'common-end'
            : settings.referenceInsetPosition,
    },
  });
  // 네거티브에는 UC 프리셋(과 NovelAI 웹처럼 자동 nsfw)을 앞에 붙인다. nsfw는 완성된 포지티브를 보고 정한다.
  const tagged = applyNaiTags(
    settings.model,
    { ...settings, qualityTags: false },
    prompts.commonPositive,
    commonNegative,
    [prompts.characterPositive, ...extraCharacters.map((character) => character.prompt)].join(', '),
  );
  const anyCharacterNegative = characters.some((character) => character.negative.trim());
  return {
    prompt: prompts.commonPositive,
    // 네거티브가 모두 비면 NovelAI 웹처럼 모델 기본값(V3의 lowres)을 보낸다.
    negativePrompt:
      tagged.negative || (anyCharacterNegative ? '' : emptyNegativeFor(settings.model)),
    characterPrompt: prompts.characterPositive,
    characterNegativePrompt: first.negative,
    extraCharacters,
    missingPieces: [...missing],
  };
}

/**
 * 캐릭터들을 작업 필드로 바꾼다. 결과 파일 이름의 `{character}`는 이름을 `+`로 잇는다(사용자 결정).
 * 모델이 받는 인원을 넘으면 오류를 던진다.
 */
function castFields(
  characters: JobCharacter[],
  extraPrompts: RequestPrompts['extraCharacters'],
  model: string,
  positionMode: CharacterPositionMode,
) {
  const max = maxCharactersFor(model);
  if (characters.length > max)
    throw new Error(
      `${modelLabel(model)}은(는) 캐릭터를 ${max}명까지 넣을 수 있습니다. 지금 ${characters.length}명입니다.`,
    );
  const centers = requestCenters(
    model,
    positionMode,
    characters.map((character) => character.center),
  );
  return {
    characterName: characters.map((character) => character.name).join('+'),
    promptSetName: characters.map((character) => character.promptSet.name).join('+'),
    ...(extraPrompts.length
      ? {
          extraCharacters: extraPrompts.map((prompts, index) => ({
            name: characters[index + 1].name,
            ...prompts,
          })),
        }
      : {}),
    ...(centers ? { characterCenters: centers } : {}),
  };
}

type EmotionJobCommon = Omit<
  InpaintJobSnapshot,
  'kind' | keyof JobBuildInput['input'] | 'outputRect' | 'keepDiagnosticCanvas'
>;

/** 고른 감정마다 변형 수만큼 seed와 프롬프트를 정한다. 생성 방식에 따른 필드는 `make`가 붙인다. */
function buildEmotionJobs<T>(
  input: EmotionJobBuildInput,
  kind: GenerationKind,
  extra: { referenceName: string; canvasWidth: number; canvasHeight: number },
  make: (common: EmotionJobCommon) => T,
): T[] {
  const settings = effectiveGenerationSettings(input.preset.generation);
  const wanted = new Set(input.emotionIds);
  const selected = input.emotionSet.emotions.filter(
    (emotion) => wanted.has(emotion.id) && hasScenePrompt(emotion),
  );
  const first = input.characters[0];
  const now = input.now ?? (() => new Date());
  const randomSeed = input.randomSeed ?? (() => Math.floor(Math.random() * UINT32));
  const variants = input.variantsOverride ?? settings.variantsPerEmotion;
  const jobs: T[] = [];

  for (const emotion of selected) {
    for (let variantIndex = 1; variantIndex <= variants; variantIndex += 1) {
      const seed =
        input.seedOverride !== undefined
          ? seedForVariant(input.seedOverride, variantIndex)
          : settings.seedMode === 'fixed'
            ? seedForVariant(settings.fixedSeed ?? 0, variantIndex)
            : randomSeed();
      const { missingPieces, extraCharacters, ...prompts } = composeRequestPrompts(
        input.preset,
        input.characters.map((character) => character.promptSet),
        emotion,
        { sets: input.pieceSets ?? [], seed },
        kind,
      );
      if (missingPieces.length) {
        throw new Error(
          `"${emotion.name}"에서 찾을 수 없는 프롬프트 조각: ${missingPieces.join(', ')}. 라이브러리의 프롬프트 조각에서 이름을 확인하십시오.`,
        );
      }
      const warnings: string[] = [];
      if (first && !first.promptSet.positive.trim())
        warnings.push('캐릭터 포지티브 프롬프트가 비어 있습니다.');
      const insets =
        referenceInsetCount(prompts.prompt) + referenceInsetCount(prompts.characterPrompt);
      if (kind === 'inpaint' && insets > 1)
        warnings.push(`reference inset 태그가 ${insets}번 들어 있습니다.`);
      const createdAt = now().toISOString();
      jobs.push(
        make({
          id: `${input.project.id}-${emotion.id}-${variantIndex}-${seed}-${createdAt}`,
          createdAt,
          projectId: input.project.id,
          projectName: input.project.name,
          ...castFields(
            input.characters,
            extraCharacters,
            settings.model,
            input.project.positionMode,
          ),
          emotionId: emotion.id,
          emotionName: emotion.name,
          emotionPrompt: emotion.prompt,
          presetName: input.preset.name,
          emotionSetName: input.emotionSet.name,
          ...prompts,
          source: {
            commonPositive: input.preset.commonPositive,
            commonNegative: input.preset.commonNegative,
            characterPositive: first?.promptSet.positive ?? '',
          },
          seed,
          variantIndex,
          ...extra,
          outputFilenameTemplate: input.settings.outputFilenameTemplate,
          settings: { ...settings },
          warnings,
        }),
      );
    }
  }
  return jobs;
}

export function buildJobs(input: JobBuildInput): InpaintJobSnapshot[] {
  const image = input.reference.image;
  if (!image) throw new Error('인페인트에 참고 이미지가 없습니다.');
  return buildEmotionJobs(
    input,
    'inpaint',
    {
      referenceName: input.reference.name,
      canvasWidth: image.canvasWidth,
      canvasHeight: image.canvasHeight,
    },
    (common) => ({
      ...common,
      kind: 'inpaint',
      ...input.input,
      outputRect: { ...image.outputRect },
      keepDiagnosticCanvas: input.settings.keepDiagnosticCanvas,
    }),
  );
}

export type FreeJobBuildInput = {
  preset: Preset;
  /** 캐릭터 없이 생성하면 비운다. */
  characters?: JobCharacter[];
  positionMode?: CharacterPositionMode;
  prompt: string;
  /** 비어 있거나 캐릭터 프롬프트가 없으면 공통 포지티브 끝에 붙인다. */
  promptPosition?: EmotionPosition;
  count: number;
  /**
   * 주면 이 이미지를 i2i로 다시 그린다. 마스크가 있으면 칠한 곳만 다시 그리는 인페인팅이다. 크기는 생성
   * 설정의 해상도 대신 이미지 크기이고, 세기는 생성 설정 값을 쓴다.
   */
  image?: {
    image: ImageInput;
    mask?: Pick<InpaintInput, 'maskPath' | 'maskSha256'>;
    width: number;
    height: number;
    outputRect: Rect;
    sourceRecordId?: string;
  };
  pieceSets?: PieceSet[];
  seedOverride?: number;
  now?: () => Date;
  randomSeed?: () => number;
};

/** 자유 생성: 씬 대신 입력한 프롬프트로 `count`장을 만든다. */
export function buildFreeJobs(
  input: FreeJobBuildInput,
): Array<Txt2ImgJobSnapshot | InpaintJobSnapshot | Img2ImgJobSnapshot> {
  const settings = effectiveGenerationSettings(input.preset.generation);
  const characters = input.characters ?? [];
  const promptSet = characters[0]?.promptSet ?? createPromptSet('', {});
  // 캐릭터 프롬프트가 없을 때 캐릭터 끝에 붙이면 V4 캐릭터 프롬프트에 입력만 들어가 공통과 따로 논다.
  const emotionPosition =
    input.promptPosition === 'character-end' && promptSet.positive.trim()
      ? 'character-end'
      : 'common-end';
  const preset: Preset = {
    ...input.preset,
    generation: { ...input.preset.generation, emotionPosition },
  };
  const now = input.now ?? (() => new Date());
  const randomSeed = input.randomSeed ?? (() => Math.floor(Math.random() * UINT32));
  const jobs: Array<Txt2ImgJobSnapshot | InpaintJobSnapshot | Img2ImgJobSnapshot> = [];
  for (let variantIndex = 1; variantIndex <= input.count; variantIndex += 1) {
    const seed =
      input.seedOverride !== undefined
        ? seedForVariant(input.seedOverride, variantIndex)
        : settings.seedMode === 'fixed'
          ? seedForVariant(settings.fixedSeed ?? 0, variantIndex)
          : randomSeed();
    const { missingPieces, extraCharacters, ...prompts } = composeRequestPrompts(
      preset,
      characters.map((character) => character.promptSet),
      input.prompt,
      { sets: input.pieceSets ?? [], seed },
      'txt2img',
    );
    if (missingPieces.length) {
      throw new Error(
        `찾을 수 없는 프롬프트 조각: ${missingPieces.join(', ')}. 라이브러리의 프롬프트 조각에서 이름을 확인하십시오.`,
      );
    }
    const createdAt = now().toISOString();
    const common = {
      id: `${FREE_PROJECT_ID}-${variantIndex}-${seed}-${createdAt}`,
      createdAt,
      projectId: FREE_PROJECT_ID,
      projectName: '자유 생성',
      ...castFields(characters, extraCharacters, settings.model, input.positionMode ?? 'ai'),
      emotionId: '',
      emotionName: '',
      emotionPrompt: input.prompt,
      presetName: input.preset.name,
      emotionSetName: '',
      referenceName: '',
      ...prompts,
      source: {
        commonPositive: input.preset.commonPositive,
        commonNegative: input.preset.commonNegative,
        characterPositive: promptSet.positive,
      },
      seed,
      variantIndex,
      canvasWidth: input.image?.width ?? settings.width,
      canvasHeight: input.image?.height ?? settings.height,
      // 감정이 없으므로 설정의 파일명 규칙 대신 날짜·시각과 seed로 이름을 짓는다.
      outputFilenameTemplate: FREE_FILENAME_TEMPLATE,
      settings: { ...settings },
      warnings: [],
    };
    const { image } = input;
    if (!image) {
      jobs.push({ ...common, kind: 'txt2img' });
      continue;
    }
    const fromImage = {
      ...common,
      ...image.image,
      ...(image.sourceRecordId ? { sourceRecordId: image.sourceRecordId } : {}),
      outputRect: { ...image.outputRect },
    };
    jobs.push(
      image.mask
        ? {
            ...fromImage,
            kind: 'inpaint',
            ...image.mask,
            // 캔버스가 원래 이미지와 거의 같아 따로 남길 필요가 없다.
            keepDiagnosticCanvas: false,
          }
        : {
            ...fromImage,
            kind: 'img2img',
            strength: settings.img2imgStrength,
            noise: settings.img2imgNoise,
          },
    );
  }
  return jobs;
}

/** 감정이 없는 자유 생성 결과는 설정의 파일명 규칙 대신 날짜·시각과 seed로 이름을 짓는다. */
export const FREE_FILENAME_TEMPLATE = '{date}-{time}__{seed}';

export type ResultImg2ImgInput = {
  record: GenerationRecord;
  image: ImageInput;
  width: number;
  height: number;
  strength: number;
  noise: number;
  count: number;
  /** source면 원본 seed부터, random이면 장마다 무작위. */
  seedMode: 'source' | 'random';
  outputFilenameTemplate: string;
  projectName: string;
  now?: () => Date;
  randomSeed?: () => number;
};

/**
 * 결과를 입력으로 쓰는 작업(i2i·디렉터 툴)의 공통 내용. 원래 결과의 최종 프롬프트와 설정을 그대로 쓴다.
 * 결과에는 참고 이미지가 없으므로 reference inset 태그는 뺀다. 기록에는 사용자가 쓴 원문이 없어서,
 * 메타데이터의 원문 자리에도 최종 프롬프트를 넣는다.
 */
function resultJobCommon(
  record: GenerationRecord,
  job: {
    id: string;
    createdAt: string;
    projectName: string;
    outputFilenameTemplate: string;
    seed: number;
    variantIndex: number;
    width: number;
    height: number;
  },
): JobSnapshotCommon {
  const prompt = removeReferenceInset(record.prompt);
  const characterPrompt = removeReferenceInset(record.characterPrompt);
  return {
    id: job.id,
    createdAt: job.createdAt,
    projectId: record.projectId,
    projectName: job.projectName,
    characterName: record.characterName,
    emotionId: record.emotionId,
    emotionName: record.emotionName,
    emotionPrompt: record.emotionPrompt,
    presetName: record.presetName,
    promptSetName: record.promptSetName,
    emotionSetName: record.emotionSetName,
    referenceName: record.referenceName,
    prompt,
    negativePrompt: record.negativePrompt,
    characterPrompt,
    characterNegativePrompt: record.characterNegativePrompt,
    ...(record.extraCharacters
      ? {
          extraCharacters: record.extraCharacters.map((character) => ({
            ...character,
            prompt: removeReferenceInset(character.prompt),
          })),
        }
      : {}),
    ...(record.characterCenters ? { characterCenters: record.characterCenters } : {}),
    source: {
      commonPositive: prompt,
      commonNegative: record.negativePrompt,
      characterPositive: characterPrompt,
    },
    seed: job.seed,
    variantIndex: job.variantIndex,
    canvasWidth: job.width,
    canvasHeight: job.height,
    outputFilenameTemplate: job.outputFilenameTemplate,
    settings: { ...effectiveGenerationSettings(record.settings) },
    warnings: [],
    sourceRecordId: record.id,
  };
}

/** 결과를 i2i로 다시 그린다(업스케일 우회). 원래 결과의 프롬프트와 설정에 크기와 세기만 바꾼다. */
export function buildResultImg2ImgJobs(input: ResultImg2ImgInput): Img2ImgJobSnapshot[] {
  const { record } = input;
  const now = input.now ?? (() => new Date());
  const randomSeed = input.randomSeed ?? (() => Math.floor(Math.random() * UINT32));
  const jobs: Img2ImgJobSnapshot[] = [];
  for (let variantIndex = 1; variantIndex <= input.count; variantIndex += 1) {
    const seed =
      input.seedMode === 'source' ? seedForVariant(record.seed, variantIndex) : randomSeed();
    const createdAt = now().toISOString();
    jobs.push({
      ...resultJobCommon(record, {
        ...input,
        id: `${record.projectId}-${record.id}-i2i-${variantIndex}-${seed}-${createdAt}`,
        createdAt,
        seed,
        variantIndex,
      }),
      kind: 'img2img',
      ...input.image,
      strength: input.strength,
      noise: input.noise,
    });
  }
  return jobs;
}

/** 디렉터 툴 결과를 쌓을 씬. Emotion 툴로 씬 세트를 만들 때는 씬마다 표정이 다르다. */
export type AugmentTarget = {
  emotionId: string;
  emotionName: string;
  emotionPrompt: string;
  mood?: string;
  defry?: number;
};

export type FreeAugmentInput = {
  image: ImageInput;
  width: number;
  height: number;
  settings: AugmentSettings;
  /** 생성 결과를 가져온 이미지면 그 기록(자유 생성 결과일 때만). */
  sourceRecordId?: string;
  now?: () => Date;
};

/**
 * 자유 생성의 디렉터 툴: 고른 이미지에 툴을 `count`번 적용한다. 프롬프트·생성 설정이 없어 빈 값과 기본 설정을
 * 넣고, seed도 받지 않아 0으로 둔다. 결과는 자유 생성의 날짜별 폴더에 쌓인다.
 */
export function buildFreeAugmentJobs(input: FreeAugmentInput): AugmentJobSnapshot[] {
  const now = input.now ?? (() => new Date());
  const { tool, mood, toolPrompt, defry } = input.settings;
  return Array.from({ length: Math.max(1, input.settings.count) }, (_, index) => {
    const variantIndex = index + 1;
    const createdAt = now().toISOString();
    return {
      kind: 'augment',
      id: `${FREE_PROJECT_ID}-${tool}-${variantIndex}-${createdAt}`,
      createdAt,
      projectId: FREE_PROJECT_ID,
      projectName: '자유 생성',
      characterName: '',
      emotionId: '',
      emotionName: '',
      emotionPrompt: '',
      presetName: '',
      promptSetName: '',
      emotionSetName: '',
      referenceName: '',
      prompt: '',
      negativePrompt: '',
      characterPrompt: '',
      characterNegativePrompt: '',
      source: { commonPositive: '', commonNegative: '', characterPositive: '' },
      seed: 0,
      variantIndex,
      canvasWidth: input.width,
      canvasHeight: input.height,
      outputFilenameTemplate: FREE_FILENAME_TEMPLATE,
      settings: { ...DEFAULT_GENERATION_SETTINGS },
      warnings: [],
      ...(input.sourceRecordId ? { sourceRecordId: input.sourceRecordId } : {}),
      ...input.image,
      tool,
      ...(tool === 'emotion' ? { mood } : {}),
      toolPrompt,
      defry,
    };
  });
}

export type ResultAugmentInput = {
  record: GenerationRecord;
  image: ImageInput;
  width: number;
  height: number;
  tool: AugmentTool;
  mood?: string;
  toolPrompt: string;
  defry: number;
  /** 비어 있으면 원래 결과의 씬에 쌓는다. */
  targets?: AugmentTarget[];
  /** 씬(대상)마다 보낼 횟수. 같은 입력이어도 결과가 매번 달라(5단계 실측) 여러 장 만들 수 있다. */
  count?: number;
  outputFilenameTemplate: string;
  projectName: string;
  now?: () => Date;
};

/**
 * 결과 하나에 디렉터 툴을 적용한다. 디렉터 툴은 seed를 받지 않아 원래 결과의 seed를 그대로 적는다. 프롬프트와
 * 설정은 요청에 쓰지 않지만 결과 정보와 메타데이터에 남도록 원래 결과의 것을 옮긴다.
 */
export function buildResultAugmentJobs(input: ResultAugmentInput): AugmentJobSnapshot[] {
  const { record } = input;
  const now = input.now ?? (() => new Date());
  const targets = input.targets ?? [
    {
      emotionId: record.emotionId,
      emotionName: record.emotionName,
      emotionPrompt: record.emotionPrompt,
    },
  ];
  const variants = Array.from({ length: Math.max(1, input.count ?? 1) }, (_, index) => index + 1);
  return targets.flatMap((target, index) =>
    variants.map((variantIndex) => {
      const createdAt = now().toISOString();
      return {
        ...resultJobCommon(record, {
          ...input,
          id: `${record.projectId}-${record.id}-${input.tool}-${index}-${variantIndex}-${createdAt}`,
          createdAt,
          seed: record.seed,
          variantIndex,
        }),
        emotionId: target.emotionId,
        emotionName: target.emotionName,
        emotionPrompt: target.emotionPrompt,
        kind: 'augment',
        ...input.image,
        tool: input.tool,
        ...(input.tool === 'emotion' ? { mood: target.mood ?? input.mood ?? 'neutral' } : {}),
        toolPrompt: input.toolPrompt,
        defry: target.defry ?? input.defry,
      };
    }),
  );
}

/** 일반 생성: 참고 이미지 없이 생성 설정의 해상도로 감정마다 txt2img를 한다. */
export function buildTxt2ImgJobs(input: Txt2ImgJobBuildInput): Txt2ImgJobSnapshot[] {
  const settings = effectiveGenerationSettings(input.preset.generation);
  return buildEmotionJobs(
    input,
    'txt2img',
    { referenceName: '', canvasWidth: settings.width, canvasHeight: settings.height },
    (common) => ({ ...common, kind: 'txt2img' }),
  );
}
