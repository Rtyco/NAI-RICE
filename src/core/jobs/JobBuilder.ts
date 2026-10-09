import type {
  AppSettings,
  CharacterPromptSet,
  EmotionSet,
  GenerationKind,
  GenerationRecord,
  Img2ImgJobSnapshot,
  InpaintJobSnapshot,
  PieceSet,
  Preset,
  Project,
  Reference,
  Txt2ImgJobSnapshot,
} from '../domain/types';
import { createPromptSet, FREE_PROJECT_ID, normalizeGenerationSettings } from '../model/defaults';
import {
  composeSeparatedPrompts,
  referenceInsetCount,
  removeReferenceInset,
} from '../prompts/PromptComposer';
import { expandPieces } from '../prompts/PromptPieces';
import { applyNaiTags, emptyNegativeFor, naiTagText } from '../providers/NaiModels';

type EmotionJobBuildInput = {
  project: Project;
  preset: Preset;
  characterName: string;
  promptSet: CharacterPromptSet;
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

export type JobBuildInput = EmotionJobBuildInput & {
  reference: Reference;
  input: { imagePath: string; maskPath: string; imageSha256: string; maskSha256: string };
};

export type Txt2ImgJobBuildInput = EmotionJobBuildInput;

/** 메인 프로세스가 목표 크기로 맞춰 작업 폴더의 inputs/에 넣어 둔 i2i 입력. */
export type ImageInput = { imagePath: string; imageSha256: string };

export type Img2ImgJobBuildInput = EmotionJobBuildInput & {
  reference: Reference;
  image: ImageInput;
};

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
  /** 찾지 못한 프롬프트 조각 참조. 있으면 생성하지 않는다. */
  missingPieces: string[];
};

/**
 * 프리셋·캐릭터·감정으로 NovelAI에 보낼 최종 프롬프트 4개를 만든다. 미리보기와 생성이 같은 함수를 쓴다.
 * 프롬프트 조각은 맨 먼저 펼친다. multi 조각은 seed로 줄을 고르며, seed가 없으면(미리보기) 첫 줄이다.
 * reference inset 태그는 참고 이미지를 옆에 두는 인페인트에만 붙인다.
 */
export function composeRequestPrompts(
  rawPreset: Preset,
  rawPromptSet: Pick<CharacterPromptSet, 'positive' | 'negative'>,
  rawEmotionPrompt: string | undefined,
  pieces: { sets: PieceSet[]; seed?: number } = { sets: [] },
  kind: GenerationKind = 'inpaint',
): RequestPrompts {
  const missing = new Set<string>();
  const expand = (text: string) => {
    const result = expandPieces(text, pieces.sets, pieces.seed);
    result.missing.forEach((ref) => missing.add(ref));
    return result.text;
  };
  const preset: Preset = {
    ...rawPreset,
    commonPositive: expand(rawPreset.commonPositive),
    commonNegative: expand(rawPreset.commonNegative),
  };
  const promptSet = {
    positive: expand(rawPromptSet.positive),
    negative: expand(rawPromptSet.negative),
  };
  const emotionPrompt = rawEmotionPrompt === undefined ? undefined : expand(rawEmotionPrompt);
  const settings = normalizeGenerationSettings(preset.generation);
  // 품질 태그는 reference inset 위치를 정할 수 있도록 따로 넘긴다.
  const prompts = composeSeparatedPrompts({
    commonPositive: preset.commonPositive,
    qualityTags: naiTagText(settings.model, settings).quality,
    characterPositive: promptSet.positive,
    emotion: emotionPrompt,
    emotionPosition: settings.emotionPosition,
    referenceInset: {
      enabled: settings.referenceInset && kind === 'inpaint',
      position: settings.referenceInsetPosition,
    },
  });
  // 네거티브에는 UC 프리셋(과 NovelAI 웹처럼 자동 nsfw)을 앞에 붙인다. nsfw는 완성된 포지티브를 보고 정한다.
  const tagged = applyNaiTags(
    settings.model,
    { ...settings, qualityTags: false },
    prompts.commonPositive,
    preset.commonNegative,
    prompts.characterPositive,
  );
  return {
    prompt: prompts.commonPositive,
    // 네거티브가 모두 비면 NovelAI 웹처럼 모델 기본값(V3의 lowres)을 보낸다.
    negativePrompt:
      tagged.negative || (promptSet.negative.trim() ? '' : emptyNegativeFor(settings.model)),
    characterPrompt: prompts.characterPositive,
    characterNegativePrompt: promptSet.negative,
    missingPieces: [...missing],
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
  const settings = normalizeGenerationSettings(input.preset.generation);
  const wanted = new Set(input.emotionIds);
  const selected = input.emotionSet.emotions.filter(
    (emotion) => wanted.has(emotion.id) && emotion.prompt.trim(),
  );
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
      const { missingPieces, ...prompts } = composeRequestPrompts(
        input.preset,
        input.promptSet,
        emotion.prompt,
        { sets: input.pieceSets ?? [], seed },
        kind,
      );
      if (missingPieces.length) {
        throw new Error(
          `"${emotion.name}"에서 찾을 수 없는 프롬프트 조각: ${missingPieces.join(', ')}. 라이브러리의 프롬프트 조각에서 이름을 확인하십시오.`,
        );
      }
      const warnings: string[] = [];
      if (!input.promptSet.positive.trim())
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
          characterName: input.characterName,
          emotionId: emotion.id,
          emotionName: emotion.name,
          emotionPrompt: emotion.prompt,
          presetName: input.preset.name,
          promptSetName: input.promptSet.name,
          emotionSetName: input.emotionSet.name,
          ...prompts,
          source: {
            commonPositive: input.preset.commonPositive,
            commonNegative: input.preset.commonNegative,
            characterPositive: input.promptSet.positive,
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
  character?: { name: string; promptSet: CharacterPromptSet };
  prompt: string;
  count: number;
  /** 주면 i2i로 만든다. 세기는 생성 설정 값을 쓴다. */
  img2img?: { image: ImageInput; sourceRecordId?: string };
  pieceSets?: PieceSet[];
  seedOverride?: number;
  now?: () => Date;
  randomSeed?: () => number;
};

/**
 * 자유 생성: 감정 대신 입력한 프롬프트로 `count`장을 만든다. 입력은 장면·구도 설명일 때가 많아
 * 캐릭터 프롬프트가 아니라 공통 포지티브 끝에 붙인다.
 */
export function buildFreeJobs(
  input: FreeJobBuildInput,
): Array<Txt2ImgJobSnapshot | Img2ImgJobSnapshot> {
  const settings = normalizeGenerationSettings(input.preset.generation);
  const preset: Preset = {
    ...input.preset,
    generation: { ...input.preset.generation, emotionPosition: 'common-end' },
  };
  const promptSet = input.character?.promptSet ?? createPromptSet('', {});
  const now = input.now ?? (() => new Date());
  const randomSeed = input.randomSeed ?? (() => Math.floor(Math.random() * UINT32));
  const jobs: Array<Txt2ImgJobSnapshot | Img2ImgJobSnapshot> = [];
  for (let variantIndex = 1; variantIndex <= input.count; variantIndex += 1) {
    const seed =
      input.seedOverride !== undefined
        ? seedForVariant(input.seedOverride, variantIndex)
        : settings.seedMode === 'fixed'
          ? seedForVariant(settings.fixedSeed ?? 0, variantIndex)
          : randomSeed();
    const { missingPieces, ...prompts } = composeRequestPrompts(
      preset,
      promptSet,
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
      characterName: input.character?.name ?? '',
      emotionId: '',
      emotionName: '',
      emotionPrompt: input.prompt,
      presetName: input.preset.name,
      promptSetName: input.character?.promptSet.name ?? '',
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
      canvasWidth: settings.width,
      canvasHeight: settings.height,
      // 감정이 없으므로 설정의 파일명 규칙 대신 날짜·시각과 seed로 이름을 짓는다.
      outputFilenameTemplate: FREE_FILENAME_TEMPLATE,
      settings: { ...settings },
      warnings: [],
    };
    jobs.push(
      input.img2img
        ? {
            ...common,
            kind: 'img2img',
            ...input.img2img.image,
            ...(input.img2img.sourceRecordId
              ? { sourceRecordId: input.img2img.sourceRecordId }
              : {}),
            strength: settings.img2imgStrength,
            noise: settings.img2imgNoise,
          }
        : { ...common, kind: 'txt2img' },
    );
  }
  return jobs;
}

/** 감정이 없는 자유 생성 결과는 설정의 파일명 규칙 대신 날짜·시각과 seed로 이름을 짓는다. */
export const FREE_FILENAME_TEMPLATE = '{date}-{time}__{seed}';

/** i2i 모드: 인페인트의 원본 이미지를 감정마다 다시 그린다. 크기는 생성 설정의 해상도다. */
export function buildImg2ImgJobs(input: Img2ImgJobBuildInput): Img2ImgJobSnapshot[] {
  const settings = normalizeGenerationSettings(input.preset.generation);
  return buildEmotionJobs(
    input,
    'img2img',
    {
      referenceName: input.reference.name,
      canvasWidth: settings.width,
      canvasHeight: settings.height,
    },
    (common) => ({
      ...common,
      kind: 'img2img',
      ...input.image,
      strength: settings.img2imgStrength,
      noise: settings.img2imgNoise,
    }),
  );
}

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
 * 결과를 i2i로 다시 그린다(업스케일 우회). 원래 결과의 최종 프롬프트와 설정을 그대로 쓰고 크기와 세기만
 * 바꾼다. 결과에는 참고 이미지가 없으므로 reference inset 태그는 뺀다. 기록에는 사용자가 쓴 원문이 없어서,
 * 메타데이터의 원문 자리에도 최종 프롬프트를 넣는다.
 */
export function buildResultImg2ImgJobs(input: ResultImg2ImgInput): Img2ImgJobSnapshot[] {
  const { record } = input;
  const now = input.now ?? (() => new Date());
  const randomSeed = input.randomSeed ?? (() => Math.floor(Math.random() * UINT32));
  const prompt = removeReferenceInset(record.prompt);
  const characterPrompt = removeReferenceInset(record.characterPrompt);
  const jobs: Img2ImgJobSnapshot[] = [];
  for (let variantIndex = 1; variantIndex <= input.count; variantIndex += 1) {
    const seed =
      input.seedMode === 'source' ? seedForVariant(record.seed, variantIndex) : randomSeed();
    const createdAt = now().toISOString();
    jobs.push({
      kind: 'img2img',
      id: `${record.projectId}-${record.id}-i2i-${variantIndex}-${seed}-${createdAt}`,
      createdAt,
      projectId: record.projectId,
      projectName: input.projectName,
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
      source: {
        commonPositive: prompt,
        commonNegative: record.negativePrompt,
        characterPositive: characterPrompt,
      },
      seed,
      variantIndex,
      canvasWidth: input.width,
      canvasHeight: input.height,
      outputFilenameTemplate: input.outputFilenameTemplate,
      settings: { ...normalizeGenerationSettings(record.settings) },
      warnings: [],
      sourceRecordId: record.id,
      ...input.image,
      strength: input.strength,
      noise: input.noise,
    });
  }
  return jobs;
}

/** 일반 생성: 참고 이미지 없이 생성 설정의 해상도로 감정마다 txt2img를 한다. */
export function buildTxt2ImgJobs(input: Txt2ImgJobBuildInput): Txt2ImgJobSnapshot[] {
  const settings = normalizeGenerationSettings(input.preset.generation);
  return buildEmotionJobs(
    input,
    'txt2img',
    { referenceName: '', canvasWidth: settings.width, canvasHeight: settings.height },
    (common) => ({ ...common, kind: 'txt2img' }),
  );
}
