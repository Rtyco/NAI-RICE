import type {
  AppSettings,
  CharacterPromptSet,
  EmotionSet,
  GenerationKind,
  InpaintJobSnapshot,
  PieceSet,
  Preset,
  Project,
  Reference,
  Txt2ImgJobSnapshot,
} from '../domain/types';
import { normalizeGenerationSettings } from '../model/defaults';
import { composeSeparatedPrompts, referenceInsetCount } from '../prompts/PromptComposer';
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
