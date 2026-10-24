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
  GenerationSettings,
  Img2ImgJobSnapshot,
  InpaintJobSnapshot,
  JobAid,
  JobSnapshotCommon,
  PieceSet,
  Preset,
  Project,
  Rect,
  Reference,
  Txt2ImgJobSnapshot,
} from '../domain/types';
import {
  DEFAULT_GENERATION_SETTINGS,
  effectiveGenerationSettings,
  FREE_PROJECT_ID,
  hasScenePrompt,
} from '../model/defaults';
import {
  composeSeparatedPrompts,
  fillMarkers,
  referenceInsetCount,
  removeReferenceInset,
} from '../prompts/PromptComposer';
import { expandPieces } from '../prompts/PromptPieces';
import { comboPrompts, sceneCombos, type ComboPrompts } from '../model/sceneCombos';
import { requestCenters } from '../model/characterPositions';
import {
  applyNaiTags,
  emptyNegativeFor,
  maxCharactersFor,
  modelLabel,
  supportsReferenceAid,
  naiTagText,
  usesMedium,
} from '../providers/NaiModels';

/** 첫 캐릭터가 참고 이미지의 캐릭터다. */
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
  pieceSets?: PieceSet[];
  /** 설정의 Seed 방식보다 우선한다. */
  seedOverride?: number;
  variantsOverride?: number;
  /** 조합 칸이 있는 씬에서 이 조합만 만든다(기록의 `comboKey`). */
  comboKey?: string;
  aid?: JobAid;
  now?: () => Date;
  randomSeed?: () => number;
};

/** `inputs/`의 해시 이름 파일 */
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

/** 메인 프로세스가 목표 크기로 맞춘 `inputs/` 파일 */
export type ImageInput = { imagePath: string; imageSha256: string };

const UINT32 = 4_294_967_296;

/** 고정 seed에서도 변형마다 결과가 다르도록. */
export function seedForVariant(baseSeed: number, variantIndex: number): number {
  return (((baseSeed + variantIndex - 1) % UINT32) + UINT32) % UINT32;
}

export type RequestPrompts = {
  prompt: string;
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  /** 두 번째 캐릭터부터. 이름은 작업을 만들 때 채운다. */
  extraCharacters: Array<{ prompt: string; negative: string }>;
  /** 있으면 생성하지 않는다. */
  missingPieces: string[];
};

/** 자유 생성은 문자열 하나. */
export type ScenePrompts = string | ComboPrompts;

const joinPrompts = (texts: string[]) =>
  texts
    .map((text) => text.trim().replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter(Boolean)
    .join(', ');

/** 미리보기와 생성이 같이 쓴다. 조각을 먼저 펼치며 multi는 seed로 고른다(seed가 없으면 첫 줄). reference inset은 인페인트의 첫 캐릭터에만 붙는다. */
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
  // NovelAI 웹은 medium이면 직접 쓴 네거티브와 캐릭터 네거티브를 비우고 UC 프리셋만 보낸다(2026-10).
  const medium = usesMedium(settings);
  const commonPositive = expand(rawPreset.commonPositive);
  const emotionPosition = scenePosition(settings.emotionPosition, rawCharacters.length);
  // 씬 네거티브는 씬 프롬프트와 같은 쪽(공통 또는 첫 캐릭터)에 붙는다.
  const sceneNegative = typeof scene === 'object' && !medium ? expand(scene.negative ?? '') : '';
  const sceneOnCommon = emotionPosition !== 'character-end';
  const commonNegative = medium
    ? ''
    : joinPrompts([expand(rawPreset.commonNegative), sceneOnCommon ? sceneNegative : '']);
  const characters = rawCharacters.map((set, index) => {
    const negative = medium ? '' : expand(set.negative);
    return {
      positive: expand(set.positive),
      negative:
        index === 0 && !sceneOnCommon && sceneNegative
          ? joinPrompts([negative, sceneNegative])
          : negative,
    };
  });
  const first = characters[0] ?? { positive: '', negative: '' };
  const firstScene =
    scene === undefined ? undefined : typeof scene === 'string' ? scene : scene.prompt;
  const extraScenes = typeof scene === 'object' ? (scene.extraPrompts ?? []) : [];
  const emotionPrompt = firstScene === undefined ? undefined : expand(firstScene);
  const extraCharacters = characters.slice(1).map((character, index) => ({
    prompt: fillMarkers(character.positive, expand(extraScenes[index] ?? '')),
    negative: character.negative,
  }));
  const insetWritten = extraCharacters.some((character) => referenceInsetCount(character.prompt));
  const prompts = composeSeparatedPrompts({
    commonPositive,
    qualityTags: naiTagText(settings.model, settings).quality,
    characterPositive: first.positive,
    emotion: emotionPrompt,
    emotionPosition,
    characterScene:
      typeof scene === 'object' && characters.length
        ? expand(scene.firstCharacter ?? '')
        : undefined,
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
  // 자동 nsfw는 완성된 포지티브를 보고 정한다.
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
    // 모두 비면 NovelAI 웹처럼 모델 기본값(V3의 lowres)을 보낸다.
    negativePrompt:
      tagged.negative || (anyCharacterNegative ? '' : emptyNegativeFor(settings.model)),
    characterPrompt: prompts.characterPositive,
    characterNegativePrompt: first.negative,
    extraCharacters,
    missingPieces: [...missing],
  };
}

/** `{character}` 파일 이름은 이름을 `+`로 잇는다. 모델 인원을 넘으면 오류. */
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

function assertAidModel(aid: JobAid | undefined, model: string): void {
  if (aid && !supportsReferenceAid(model))
    throw new Error(
      `캐릭터 레퍼런스와 바이브는 V4.5 모델에서만 쓸 수 있습니다. 지금 모델은 ${modelLabel(model)}입니다.`,
    );
}

type EmotionJobCommon = Omit<
  InpaintJobSnapshot,
  'kind' | keyof JobBuildInput['input'] | 'outputRect' | 'keepDiagnosticCanvas'
>;

function buildEmotionJobs<T>(
  input: EmotionJobBuildInput,
  kind: GenerationKind,
  extra: { referenceName: string; canvasWidth: number; canvasHeight: number },
  make: (common: EmotionJobCommon) => T,
): T[] {
  const settings = effectiveGenerationSettings(input.preset.generation);
  assertAidModel(input.aid, settings.model);
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
    const combos = sceneCombos(emotion).filter(
      (combo) => input.comboKey === undefined || combo.key === input.comboKey,
    );
    for (const [comboIndex, combo] of combos.entries()) {
      for (let variantIndex = 1; variantIndex <= variants; variantIndex += 1) {
        const fixedSeed =
          input.seedOverride ??
          emotion.seed ??
          (settings.seedMode === 'fixed' ? (settings.fixedSeed ?? 0) : undefined);
        const seed =
          fixedSeed !== undefined ? seedForVariant(fixedSeed, variantIndex) : randomSeed();
        const { missingPieces, extraCharacters, ...prompts } = composeRequestPrompts(
          input.preset,
          input.characters.map((character) => character.promptSet),
          comboPrompts(emotion, combo),
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
            id: `${input.project.id}-${emotion.id}-${comboIndex ? `${comboIndex}-` : ''}${variantIndex}-${seed}-${createdAt}`,
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
            ...(emotion.negative?.trim() ? { emotionNegative: emotion.negative } : {}),
            ...(combo.key ? { comboKey: combo.key, comboName: combo.name } : {}),
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
            ...(input.aid ? { aid: { ...input.aid } } : {}),
          }),
        );
      }
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
      settings: {
        ...common.settings,
        inpaintStrength: input.reference.inpaintStrength,
      },
      kind: 'inpaint',
      ...input.input,
      outputRect: { ...image.outputRect },
      keepDiagnosticCanvas: input.settings.keepDiagnosticCanvas,
    }),
  );
}

export type FreeJobBuildInput = {
  preset: Preset;
  characters?: JobCharacter[];
  positionMode?: CharacterPositionMode;
  prompt: string;
  negative?: string;
  /** 캐릭터 프롬프트가 없으면 공통 포지티브 끝. */
  promptPosition?: EmotionPosition;
  count: number;
  /** 크기는 해상도 설정 대신 이미지 크기. 마스크가 있으면 인페인팅. */
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
  aid?: JobAid;
  now?: () => Date;
  randomSeed?: () => number;
};

/** 캐릭터가 없으면 V4 캐릭터 프롬프트에 씬만 들어가므로 공통 쪽에 붙인다. */
export function scenePosition(position: EmotionPosition, characterCount: number): EmotionPosition {
  return characterCount || position !== 'character-end' ? position : 'common-end';
}

/** 캐릭터 프롬프트가 없을 때 캐릭터 끝에 붙이면 V4 캐릭터 프롬프트에 입력만 들어간다. */
export function freePromptPosition(
  position: EmotionPosition | undefined,
  firstCharacterPositive: string | undefined,
): EmotionPosition {
  if (position === 'character-end') return firstCharacterPositive?.trim() ? position : 'common-end';
  return position ?? 'common-end';
}

/** 자유 생성의 입력 프롬프트 자리를 생성 설정의 씬 자리로 바꾼다. */
export function freePromptPreset(
  preset: Preset,
  promptSets: Array<Pick<CharacterPromptSet, 'positive'>>,
  promptPosition: EmotionPosition | undefined,
): Preset {
  const emotionPosition = freePromptPosition(promptPosition, promptSets[0]?.positive);
  return { ...preset, generation: { ...preset.generation, emotionPosition } };
}

export function buildFreeJobs(
  input: FreeJobBuildInput,
): Array<Txt2ImgJobSnapshot | InpaintJobSnapshot | Img2ImgJobSnapshot> {
  const settings = effectiveGenerationSettings(input.preset.generation);
  assertAidModel(input.aid, settings.model);
  const characters = input.characters ?? [];
  const preset = freePromptPreset(
    input.preset,
    characters.map((character) => character.promptSet),
    input.promptPosition,
  );
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
      { prompt: input.prompt, negative: input.negative },
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
      ...(input.negative?.trim() ? { emotionNegative: input.negative } : {}),
      presetName: input.preset.name,
      emotionSetName: '',
      referenceName: '',
      ...prompts,
      source: {
        commonPositive: input.preset.commonPositive,
        commonNegative: input.preset.commonNegative,
        characterPositive: characters[0]?.promptSet.positive ?? '',
      },
      seed,
      variantIndex,
      canvasWidth: input.image?.width ?? settings.width,
      canvasHeight: input.image?.height ?? settings.height,
      outputFilenameTemplate: FREE_FILENAME_TEMPLATE,
      settings: { ...settings },
      warnings: [],
      ...(input.aid ? { aid: { ...input.aid } } : {}),
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
            // 캔버스가 원본과 거의 같다.
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

/** 자유 생성은 씬이 없어 설정의 파일명 규칙을 쓰지 않는다. */
export const FREE_FILENAME_TEMPLATE = '{date}-{time}__{seed}';

export type ResultImg2ImgInput = {
  record: GenerationRecord;
  image: ImageInput;
  width: number;
  height: number;
  strength: number;
  noise: number;
  count: number;
  /** source: 원본 seed부터 차례로. */
  seedMode: 'source' | 'random';
  outputFilenameTemplate: string;
  projectName: string;
  now?: () => Date;
  randomSeed?: () => number;
};

/** 원래 결과의 최종 프롬프트·설정을 쓴다. 참고 이미지가 없어 reference inset은 빼고, 원문이 없어 원문 자리에도 최종 프롬프트를 넣는다. */
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
    ...(record.emotionNegative ? { emotionNegative: record.emotionNegative } : {}),
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

export type AugmentTarget = {
  emotionId: string;
  emotionName: string;
  emotionPrompt: string;
  emotionNegative?: string;
  mood?: string;
  defry?: number;
};

export type FreeAugmentInput = {
  image: ImageInput;
  width: number;
  height: number;
  settings: AugmentSettings;
  /** 자유 생성 결과에서 가져왔을 때만 */
  sourceRecordId?: string;
  now?: () => Date;
};

/** 프롬프트·설정이 없어 빈 값과 기본 설정을 넣는다. 디렉터 툴은 seed를 받지 않아 0. */
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
  /** 없으면 원래 결과의 씬 */
  targets?: AugmentTarget[];
  /** 같은 입력이어도 결과가 매번 다르다(5단계 실측). */
  count?: number;
  outputFilenameTemplate: string;
  projectName: string;
  now?: () => Date;
};

/** 디렉터 툴은 seed를 받지 않아 원래 seed를 적는다. 프롬프트·설정은 요청에 쓰지 않지만 기록용으로 옮긴다. */
export function buildResultAugmentJobs(input: ResultAugmentInput): AugmentJobSnapshot[] {
  const { record } = input;
  const now = input.now ?? (() => new Date());
  const targets = input.targets ?? [
    {
      emotionId: record.emotionId,
      emotionName: record.emotionName,
      emotionPrompt: record.emotionPrompt,
      emotionNegative: record.emotionNegative,
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
        emotionNegative: target.emotionNegative,
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

export function buildTxt2ImgJobs(input: Txt2ImgJobBuildInput): Txt2ImgJobSnapshot[] {
  const settings = effectiveGenerationSettings(input.preset.generation);
  return buildEmotionJobs(
    input,
    'txt2img',
    { referenceName: '', canvasWidth: settings.width, canvasHeight: settings.height },
    (common) => {
      const size = sceneSize(
        input.emotionSet.emotions.find((emotion) => emotion.id === common.emotionId),
        settings,
      );
      return {
        ...common,
        canvasWidth: size.width,
        canvasHeight: size.height,
        settings: { ...common.settings, ...size },
        kind: 'txt2img',
      };
    },
  );
}

/** 씬 크기가 있으면 생성 설정 크기 대신 쓴다(일반 생성만). */
export function sceneSize(
  emotion: Pick<Emotion, 'width' | 'height'> | undefined,
  settings: Pick<GenerationSettings, 'width' | 'height'>,
): { width: number; height: number } {
  return emotion?.width && emotion.height
    ? { width: emotion.width, height: emotion.height }
    : { width: settings.width, height: settings.height };
}
