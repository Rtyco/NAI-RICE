import type { AugmentTool, GenerationJobSnapshot, GenerationSettings } from '../domain/types';
import { modelInfo, NAI_MODELS, naiTagHints, requestModelId } from './NaiModels';

export const NAI_IMAGE_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
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
  width: number;
  height: number;
  seed: number;
  settings: GenerationSettings;
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

/** NovelAI에 보낼 요청 한 건. */
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

  // V3는 캐릭터 프롬프트를 지원하지 않으므로 공통 프롬프트 뒤에 합친다.
  const prompt = isV3 ? join(input.prompt, input.characterPrompt) : input.prompt;
  const negativePrompt = isV3
    ? join(input.negativePrompt, input.characterNegativePrompt)
    : input.negativePrompt;

  // 이미지를 받는 요청(i2i·인페인트)만 강도·노이즈·이미지를 보낸다.
  const imageParams =
    image.action === 'generate'
      ? {}
      : {
          noise,
          strength,
          image: image.imageBase64,
          ...(infill ? { mask: image.maskBase64 } : {}),
        };
  // 원본을 섞는 옵션은 인페인트에만 있다.
  const infillParams = infill ? { inpaintImg2ImgStrength: strength, add_original_image: true } : {};

  const shared = {
    params_version: 3,
    width: Math.round(input.width),
    height: Math.round(input.height),
    noise_schedule: isV5 ? 'karras' : input.settings.noiseSchedule,
    scale: Math.min(model.maxScale, Math.max(0, input.settings.promptGuidance)),
    sampler,
    steps: Math.min(model.maxSteps, Math.max(1, Math.round(input.settings.steps))),
    seed,
    n_samples: 1,
    negative_prompt: negativePrompt,
    cfg_rescale: input.settings.cfgRescale,
    skip_cfg_above_sigma: null,
    ...imageParams,
    // 품질 태그와 UC 프리셋은 NovelAI 웹처럼 앱이 프롬프트에 직접 넣고, 무엇을 넣었는지는 힌트로만 알린다.
    ...naiTagHints(model.id, input.settings),
  };
  const request = {
    input: prompt,
    model: requestModelId(model.id, infill ? 'inpaint' : 'generate'),
    action: image.action,
  };

  if (isV3) {
    return {
      ...request,
      parameters: {
        ...shared,
        ...(image.action === 'generate' ? {} : { extra_noise_seed: seed }),
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        legacy_v3_extend: false,
        ...infillParams,
      },
    };
  }

  const characterEntries = input.characterPrompt.trim()
    ? [
        {
          prompt: input.characterPrompt,
          uc: input.characterNegativePrompt,
          center: { x: 0.5, y: 0.5 },
        },
      ]
    : [];
  const v4 = {
    params_version: isV5 ? 4 : 3,
    characterPrompts: characterEntries,
    use_coords: false,
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
      use_coords: false,
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
    parameters: { ...shared, ...v4, ...legacy },
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

/** 작업에 필요한 입력 파일(base64). 큐가 스냅샷의 해시를 확인한 뒤 넘긴다. */
export type NaiJobInputs = { imageBase64?: string; maskBase64?: string };

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`작업에 ${label}이(가) 없습니다.`);
  return value;
}

/** 작업 하나를 생성 방식에 맞는 NovelAI 요청으로 바꾼다. */
export function buildNovelAIJobRequest(
  job: GenerationJobSnapshot,
  inputs: NaiJobInputs,
): NaiHttpRequest {
  const prompts: NaiPromptInput = {
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    characterPrompt: job.characterPrompt,
    characterNegativePrompt: job.characterNegativePrompt,
    width: job.canvasWidth,
    height: job.canvasHeight,
    seed: job.seed,
    settings: job.settings,
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
