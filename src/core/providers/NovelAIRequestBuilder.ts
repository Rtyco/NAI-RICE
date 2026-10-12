import type {
  AugmentTool,
  CharacterCenter,
  GenerationJobSnapshot,
  GenerationSettings,
  JobAid,
  ReferenceTarget,
} from '../domain/types';
import {
  modelInfo,
  NAI_MODELS,
  naiTagHints,
  requestModelId,
  supportsReferenceAid,
  varietySigma,
} from './NaiModels';

export const NAI_IMAGE_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
/** 바이브 인코딩. 응답은 ZIP이 아니라 인코딩 결과 그대로다(0단계: 약 49KB). */
export const NAI_ENCODE_VIBE_ENDPOINT = 'https://image.novelai.net/ai/encode-vibe';
/** 디렉터 툴. 응답은 생성과 같은 ZIP이다. */
export const NAI_AUGMENT_ENDPOINT = 'https://image.novelai.net/ai/augment-image';
export const NAI_USER_ENDPOINT = 'https://image.novelai.net/user/data';

export const SUPPORTED_NAI_MODELS = NAI_MODELS.map((model) => model.id);

/** 확산 모델 요청(일반 생성·i2i·인페인트)에 공통인 입력. */
export type NaiPromptInput = {
  prompt: string;
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  /** 두 번째 캐릭터부터. */
  extraCharacters?: Array<{ prompt: string; negative: string }>;
  /** 주면 첫 캐릭터부터 이 위치로 보낸다(`use_coords: true`). */
  characterCenters?: CharacterCenter[];
  width: number;
  height: number;
  seed: number;
  settings: GenerationSettings;
  aid?: NaiAidInput;
};

/** 캐릭터 레퍼런스(캔버스에 맞춘 그림) 또는 바이브(인코딩 결과). */
export type NaiAidInput =
  | { kind: 'character'; imageBase64: string; target: ReferenceTarget; fidelity: number }
  | {
      kind: 'vibe';
      vibes: Array<{ encodedBase64: string; strength: number }>;
      normalize: boolean;
    };

/** 요청에 넣는 입력 이미지. 생성 방식마다 NovelAI의 `action`이 다르다. */
export type NaiImageInput =
  | { action: 'generate' }
  | { action: 'img2img'; imageBase64: string; strength: number; noise: number }
  | { action: 'infill'; imageBase64: string; maskBase64: string; strength: number };

export type NaiInpaintRequestInput = NaiPromptInput & { imageBase64: string; maskBase64: string };

export type NaiAugmentRequestInput = {
  tool: AugmentTool;
  imageBase64: string;
  width: number;
  height: number;
  mood?: string;
  toolPrompt: string;
  defry: number;
};

export type NaiHttpRequest = { url: string; body: Record<string, unknown> };

function join(...parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter(Boolean)
    .join(', ');
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * 일반 생성·i2i·인페인트 요청 본문을 만든다. 프롬프트 구조와 샘플러 설정은 셋이 같고,
 * 입력 이미지와 그에 딸린 필드만 다르다(0단계에서 각 형식이 받아들여지는 것을 확인했다).
 */
export function buildNovelAIDiffusionRequest(
  input: NaiPromptInput,
  image: NaiImageInput,
): Record<string, unknown> {
  const model = modelInfo(input.settings.model);
  if (!model) throw new Error(`지원되지 않는 NovelAI 모델입니다: ${input.settings.model}`);
  const isV5 = model.generation === 'v5';
  const isV3 = model.generation === 'v3';
  const infill = image.action === 'infill';
  const sampler = input.settings.sampler || 'k_euler_ancestral';
  const seed = input.seed >>> 0;
  const strength = image.action === 'generate' ? 0 : clamp(image.strength, 0, 1);
  const noise = image.action === 'img2img' ? clamp(image.noise, 0, 1) : 0;

  const characters = [
    { prompt: input.characterPrompt, negative: input.characterNegativePrompt },
    ...(input.extraCharacters ?? []),
  ];
  // V3는 캐릭터 프롬프트를 지원하지 않으므로 공통 프롬프트 뒤에 합친다.
  const prompt = isV3
    ? join(input.prompt, ...characters.map((character) => character.prompt))
    : input.prompt;
  const negativePrompt = isV3
    ? join(input.negativePrompt, ...characters.map((character) => character.negative))
    : input.negativePrompt;

  const imageParams =
    image.action === 'generate'
      ? {}
      : {
          noise,
          strength,
          image: image.imageBase64,
          ...(infill ? { mask: image.maskBase64 } : {}),
        };
  const infillParams = infill ? { inpaintImg2ImgStrength: strength, add_original_image: true } : {};

  const width = Math.round(input.width);
  const height = Math.round(input.height);
  const shared = {
    params_version: 3,
    width,
    height,
    noise_schedule: isV5 ? 'karras' : input.settings.noiseSchedule,
    scale: Math.min(model.maxScale, Math.max(0, input.settings.promptGuidance)),
    sampler,
    steps: Math.min(model.maxSteps, Math.max(1, Math.round(input.settings.steps))),
    seed,
    n_samples: 1,
    negative_prompt: negativePrompt,
    cfg_rescale: input.settings.cfgRescale,
    skip_cfg_above_sigma: varietySigma(input.settings, width, height),
    ...imageParams,
    // 품질 태그와 UC 프리셋은 NovelAI 웹처럼 앱이 프롬프트에 직접 넣고, 무엇을 넣었는지는 힌트로만 알린다.
    ...naiTagHints(model.id, input.settings),
  };
  const request = {
    input: prompt,
    model: requestModelId(model.id, infill ? 'inpaint' : 'generate', input.settings.effort),
    action: image.action,
  };

  if (isV3) {
    // SMEA는 커뮤니티 구현처럼 일반 생성에만 넣는다. i2i·인페인트에서 받는지는 확인하지 않았다.
    const smea = image.action === 'generate' ? (input.settings.smea ?? 'off') : 'off';
    return {
      ...request,
      parameters: {
        ...shared,
        ...(image.action === 'generate' ? {} : { extra_noise_seed: seed }),
        sm: smea !== 'off',
        sm_dyn: smea === 'dyn',
        dynamic_thresholding: Boolean(input.settings.decrisp),
        controlnet_strength: 1,
        legacy: false,
        legacy_v3_extend: false,
        ...infillParams,
      },
    };
  }

  const useCoords = Boolean(input.characterCenters);
  // 위치를 AI에 맡길 때도 웹처럼 가운데를 넣어 보낸다. 프롬프트가 빈 캐릭터는 웹처럼 뺀다.
  const characterEntries = characters
    .map((character, index) => ({
      prompt: character.prompt,
      uc: character.negative,
      center: input.characterCenters?.[index] ?? { x: 0.5, y: 0.5 },
    }))
    .filter((entry) => entry.prompt.trim());
  const v4 = {
    params_version: isV5 ? 4 : 3,
    characterPrompts: characterEntries,
    use_coords: useCoords,
    prefer_brownian: sampler === 'k_euler_ancestral',
    deliberate_euler_ancestral_bug: false,
    ...(image.action === 'generate'
      ? {}
      : {
          img2img: {
            strength,
            begin_from_sigma: null,
            noise,
            extra_noise_seed: seed,
            color_correct: true,
          },
        }),
    // i2i는 NovelAI 웹처럼 바깥에도 노이즈 seed를 둔다.
    ...(image.action === 'img2img' ? { extra_noise_seed: seed } : {}),
    v4_prompt: {
      caption: {
        base_caption: prompt,
        char_captions: characterEntries.map((entry) => ({
          char_caption: entry.prompt,
          centers: [entry.center],
        })),
      },
      use_coords: useCoords,
      use_order: true,
    },
    v4_negative_prompt: {
      caption: {
        base_caption: negativePrompt,
        char_captions: characterEntries.map((entry) => ({
          char_caption: entry.uc,
          centers: [entry.center],
        })),
      },
      ...(isV5 ? {} : { legacy_uc: false }),
    },
  };
  const legacy = isV5
    ? {}
    : {
        controlnet_strength: 1,
        dynamic_thresholding: false,
        legacy: false,
        legacy_v3_extend: false,
        autoSmea: false,
        legacy_uc: false,
        ...infillParams,
        normalize_reference_strength_multiple: false,
      };
  return {
    ...request,
    ...(isV5 ? { use_new_shared_trial: true } : {}),
    parameters: { ...shared, ...v4, ...legacy, ...aidParams(model.id, input.aid) },
  };
}

/**
 * Normalize Reference Strengths. NovelAI 웹은 바이브가 둘 이상이고 세기 절댓값의 합이 1을 넘을 때만 합이 1이
 * 되도록 나눠서 보낸다(웹 코드 2026-10). 플래그도 함께 보내지만 나누는 것은 웹 쪽이라 앱도 직접 나눈다.
 */
export function vibeStrengths(strengths: number[], normalize: boolean): number[] {
  if (!normalize || strengths.length < 2) return strengths;
  const sum = strengths.reduce((total, value) => total + Math.abs(value), 0);
  return sum > 1 ? strengths.map((value) => value / sum) : strengths;
}

/** 캐릭터 레퍼런스·바이브 필드. 0단계에서 V4.5 요청으로 받아들여진 형식이다. */
function aidParams(modelId: string, aid: NaiAidInput | undefined): Record<string, unknown> {
  if (!aid) return {};
  if (!supportsReferenceAid(modelId))
    throw new Error('캐릭터 레퍼런스와 바이브는 V4.5 모델에서만 쓸 수 있습니다.');
  if (aid.kind === 'vibe')
    return {
      reference_image_multiple: aid.vibes.map((vibe) => vibe.encodedBase64),
      reference_strength_multiple: vibeStrengths(
        aid.vibes.map((vibe) => clamp(vibe.strength, 0, 1)),
        aid.normalize,
      ),
      normalize_reference_strength_multiple: aid.normalize,
    };
  return {
    director_reference_images: [aid.imageBase64],
    director_reference_descriptions: [
      {
        caption: {
          base_caption: aid.target,
          char_captions: [],
        },
        legacy_uc: false,
      },
    ],
    director_reference_information_extracted: [1],
    director_reference_strength_values: [1],
    director_reference_secondary_strength_values: [1 - clamp(aid.fidelity, 0, 1)],
  };
}

export function buildNovelAIInpaintRequest(input: NaiInpaintRequestInput): Record<string, unknown> {
  return buildNovelAIDiffusionRequest(input, {
    action: 'infill',
    imageBase64: input.imageBase64,
    maskBase64: input.maskBase64,
    strength: input.settings.inpaintStrength,
  });
}

/** 디렉터 툴 요청 본문. Emotion은 `감정;;프롬프트`, Colorize는 프롬프트를 받고, 둘만 강도(defry)가 있다. */
export function buildNovelAIAugmentRequest(input: NaiAugmentRequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    req_type: input.tool,
    width: Math.round(input.width),
    height: Math.round(input.height),
    image: input.imageBase64,
  };
  if (input.tool === 'emotion') body.prompt = `${input.mood || 'neutral'};;${input.toolPrompt}`;
  if (input.tool === 'colorize') body.prompt = input.toolPrompt;
  if (input.tool === 'emotion' || input.tool === 'colorize')
    body.defry = clamp(Math.round(input.defry), 0, 5);
  return body;
}

/** 바이브 인코딩 요청 본문. 인코딩은 일반 생성 모델 ID로 하고, 인페인트 요청에도 그 결과를 쓴다(0단계). */
export function buildNovelAIEncodeVibeRequest(
  imageBase64: string,
  settings: Pick<GenerationSettings, 'model'>,
  informationExtracted: number,
): Record<string, unknown> {
  return {
    image: imageBase64,
    information_extracted: clamp(informationExtracted, 0, 1),
    model: requestModelId(settings.model, 'generate'),
  };
}

/**
 * 바이브 인코딩 결과를 다시 쓸 때의 이름. 같은 그림·모델·information_extracted면 결과가 같아 한 번만 인코딩한다.
 * 파일 이름으로 쓰므로 영문·숫자·하이픈만 남긴다.
 */
export function vibeCacheKey(
  imageSha256: string,
  settings: Pick<GenerationSettings, 'model'>,
  informationExtracted: number,
): string {
  const model = requestModelId(settings.model, 'generate');
  const information = Math.round(clamp(informationExtracted, 0, 1) * 100);
  return `${imageSha256}-${model}-ie${information}`.replace(/[^0-9a-z-]/gi, '-');
}

/**
 * 작업에 필요한 입력 파일(base64). 큐가 스냅샷의 해시를 확인한 뒤 넘긴다. `aidBase64`는 캐릭터 레퍼런스면
 * 맞춘 그림 하나, 바이브면 바이브 순서대로 인코딩 결과다.
 */
export type NaiJobInputs = { imageBase64?: string; maskBase64?: string; aidBase64?: string[] };

function jobAidInput(aid: JobAid, base64: string[] | undefined): NaiAidInput {
  const count = aid.kind === 'character' ? 1 : aid.vibes.length;
  if (base64?.length !== count) throw new Error('작업에 참고 그림이 없습니다.');
  return aid.kind === 'character'
    ? { kind: 'character', imageBase64: base64[0], target: aid.target, fidelity: aid.fidelity }
    : {
        kind: 'vibe',
        vibes: aid.vibes.map((vibe, index) => ({
          encodedBase64: base64[index],
          strength: vibe.strength,
        })),
        normalize: aid.normalize ?? true,
      };
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`작업에 ${label}이(가) 없습니다.`);
  return value;
}

export function buildNovelAIJobRequest(
  job: GenerationJobSnapshot,
  inputs: NaiJobInputs,
): NaiHttpRequest {
  const prompts: NaiPromptInput = {
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    characterPrompt: job.characterPrompt,
    characterNegativePrompt: job.characterNegativePrompt,
    extraCharacters: job.extraCharacters,
    characterCenters: job.characterCenters,
    width: job.canvasWidth,
    height: job.canvasHeight,
    seed: job.seed,
    settings: job.settings,
    ...(job.aid ? { aid: jobAidInput(job.aid, inputs.aidBase64) } : {}),
  };
  switch (job.kind) {
    case 'inpaint':
      return {
        url: NAI_IMAGE_ENDPOINT,
        body: buildNovelAIInpaintRequest({
          ...prompts,
          imageBase64: required(inputs.imageBase64, '입력 이미지'),
          maskBase64: required(inputs.maskBase64, '마스크'),
        }),
      };
    case 'txt2img':
      return {
        url: NAI_IMAGE_ENDPOINT,
        body: buildNovelAIDiffusionRequest(prompts, { action: 'generate' }),
      };
    case 'img2img':
      return {
        url: NAI_IMAGE_ENDPOINT,
        body: buildNovelAIDiffusionRequest(prompts, {
          action: 'img2img',
          imageBase64: required(inputs.imageBase64, '입력 이미지'),
          strength: job.strength,
          noise: job.noise,
        }),
      };
    case 'augment':
      return {
        url: NAI_AUGMENT_ENDPOINT,
        body: buildNovelAIAugmentRequest({
          tool: job.tool,
          imageBase64: required(inputs.imageBase64, '입력 이미지'),
          width: job.canvasWidth,
          height: job.canvasHeight,
          mood: job.mood,
          toolPrompt: job.toolPrompt,
          defry: job.defry,
        }),
      };
  }
}
