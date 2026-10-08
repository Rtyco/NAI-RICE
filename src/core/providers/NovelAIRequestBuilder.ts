import type { GenerationSettings } from '../domain/types';
import { modelInfo, NAI_MODELS, naiTagHints } from './NaiModels';

export const NAI_IMAGE_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
export const NAI_USER_ENDPOINT = 'https://image.novelai.net/user/data';

export const SUPPORTED_NAI_MODELS = NAI_MODELS.map((model) => model.id);

export type NaiInpaintRequestInput = {
  prompt: string;
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  imageBase64: string;
  maskBase64: string;
  width: number;
  height: number;
  seed: number;
  settings: GenerationSettings;
};

function join(...parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter(Boolean)
    .join(', ');
}

export function buildNovelAIInpaintRequest(input: NaiInpaintRequestInput): Record<string, unknown> {
  const model = modelInfo(input.settings.model);
  if (!model) throw new Error(`지원되지 않는 NovelAI 인페인트 모델입니다: ${input.settings.model}`);
  const isV5 = model.generation === 'v5';
  const isV3 = model.generation === 'v3';
  const sampler = input.settings.sampler || 'k_euler_ancestral';
  const strength = Math.max(0, Math.min(1, input.settings.inpaintStrength));
  const seed = input.seed >>> 0;

  // V3는 캐릭터 프롬프트를 지원하지 않으므로 공통 프롬프트 뒤에 합친다.
  const prompt = isV3 ? join(input.prompt, input.characterPrompt) : input.prompt;
  const negativePrompt = isV3
    ? join(input.negativePrompt, input.characterNegativePrompt)
    : input.negativePrompt;

  const shared = {
    params_version: 3,
    width: Math.round(input.width),
    height: Math.round(input.height),
    noise_schedule: isV5 ? 'karras' : input.settings.noiseSchedule,
    scale: Math.min(model.maxScale, Math.max(0, input.settings.promptGuidance)),
    sampler,
    steps: Math.min(model.maxSteps, Math.max(1, Math.round(input.settings.steps))),
    noise: 0,
    seed,
    n_samples: 1,
    negative_prompt: negativePrompt,
    strength,
    cfg_rescale: input.settings.cfgRescale,
    skip_cfg_above_sigma: null,
    image: input.imageBase64,
    mask: input.maskBase64,
    // 품질 태그와 UC 프리셋은 NovelAI 웹처럼 앱이 프롬프트에 직접 넣고, 무엇을 넣었는지는 힌트로만 알린다.
    ...naiTagHints(model.id, input.settings),
  };

  if (isV3) {
    return {
      input: prompt,
      model: model.id,
      action: 'infill',
      parameters: {
        ...shared,
        extra_noise_seed: seed,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        legacy_v3_extend: false,
        add_original_image: true,
        inpaintImg2ImgStrength: strength,
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
    img2img: {
      strength,
      begin_from_sigma: null,
      noise: 0,
      extra_noise_seed: seed,
      color_correct: true,
    },
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
        inpaintImg2ImgStrength: strength,
        add_original_image: true,
        normalize_reference_strength_multiple: false,
      };
  return {
    input: prompt,
    model: model.id,
    action: 'infill',
    ...(isV5 ? { use_new_shared_trial: true } : {}),
    parameters: { ...shared, ...v4, ...legacy },
  };
}
