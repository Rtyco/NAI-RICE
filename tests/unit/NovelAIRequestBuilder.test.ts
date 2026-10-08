import { describe, expect, it } from 'vitest';
import type { GenerationSettings } from '../../src/core/domain/types';
import { buildNovelAIInpaintRequest } from '../../src/core/providers/NovelAIRequestBuilder';

const settings: GenerationSettings = {
  model: 'nai-diffusion-5-full-inpainting',
  sampler: 'k_euler_ancestral',
  steps: 28,
  promptGuidance: 5,
  cfgRescale: 0,
  noiseSchedule: 'karras',
  inpaintStrength: 1,
  seedMode: 'fixed',
  fixedSeed: 7,
  variantsPerEmotion: 1,
  qualityTags: false,
  qualityLevel: 'standard',
  referenceInset: true,
  referenceInsetPosition: 'common-start',
  emotionPosition: 'character-end',
  ucPreset: 'none',
};

describe('NovelAIRequestBuilder', () => {
  it('builds the current V5 infill request with immutable image and mask inputs', () => {
    const body = buildNovelAIInpaintRequest({
      prompt: 'reference inset, cinematic lighting',
      negativePrompt: 'text, watermark',
      characterPrompt: '1girl, smile',
      characterNegativePrompt: 'bad hands',
      imageBase64: 'IMAGE',
      maskBase64: 'MASK',
      width: 1216,
      height: 832,
      seed: 4_294_967_295,
      settings,
    }) as any;

    expect(body).toMatchObject({
      input: 'reference inset, cinematic lighting',
      model: 'nai-diffusion-5-full-inpainting',
      action: 'infill',
      use_new_shared_trial: true,
      parameters: {
        params_version: 4,
        width: 1216,
        height: 832,
        seed: 4_294_967_295,
        image: 'IMAGE',
        mask: 'MASK',
        negative_prompt: 'text, watermark',
        strength: 1,
        img2img: { strength: 1, noise: 0, extra_noise_seed: 4_294_967_295 },
      },
    });
    expect(body.parameters.characterPrompts).toEqual([
      {
        prompt: '1girl, smile',
        uc: 'bad hands',
        center: { x: 0.5, y: 0.5 },
      },
    ]);
    expect(body.parameters.v4_prompt.caption.base_caption).toBe(
      'reference inset, cinematic lighting',
    );
    expect(body.parameters.v4_negative_prompt.caption.base_caption).toBe('text, watermark');
    expect(body.parameters.v4_prompt.caption.char_captions).toEqual([
      { char_caption: '1girl, smile', centers: [{ x: 0.5, y: 0.5 }] },
    ]);
    expect(body.parameters.v4_negative_prompt.caption.char_captions).toEqual([
      { char_caption: 'bad hands', centers: [{ x: 0.5, y: 0.5 }] },
    ]);
  });

  it('uses the legacy parameter version and preserves the original image for V4.5', () => {
    const body = buildNovelAIInpaintRequest({
      prompt: 'reference inset, neutral',
      negativePrompt: '',
      characterPrompt: '',
      characterNegativePrompt: '',
      imageBase64: 'IMAGE',
      maskBase64: 'MASK',
      width: 1024,
      height: 1024,
      seed: 1,
      settings: { ...settings, model: 'nai-diffusion-4-5-full-inpainting' },
    }) as any;

    expect(body.use_new_shared_trial).toBeUndefined();
    expect(body.parameters.params_version).toBe(3);
    expect(body.parameters.add_original_image).toBe(true);
  });

  it('rejects unknown model identifiers before any network request', () => {
    expect(() =>
      buildNovelAIInpaintRequest({
        prompt: 'reference inset',
        negativePrompt: '',
        characterPrompt: '',
        characterNegativePrompt: '',
        imageBase64: 'IMAGE',
        maskBase64: 'MASK',
        width: 1024,
        height: 1024,
        seed: 1,
        settings: { ...settings, model: 'unknown-model' },
      }),
    ).toThrow('지원되지 않는 NovelAI 인페인트 모델');
  });

  it('V3는 v4_prompt 없이 캐릭터 프롬프트를 공통 프롬프트에 합쳐 보내', () => {
    const body = buildNovelAIInpaintRequest({
      prompt: 'reference inset, masterpiece',
      negativePrompt: 'lowres',
      characterPrompt: '1girl, smile',
      characterNegativePrompt: 'bad hands',
      imageBase64: 'IMAGE',
      maskBase64: 'MASK',
      width: 1216,
      height: 832,
      seed: 5,
      settings: { ...settings, model: 'nai-diffusion-3-inpainting', noiseSchedule: 'native' },
    }) as any;
    expect(body.input).toBe('reference inset, masterpiece, 1girl, smile');
    expect(body.parameters.negative_prompt).toBe('lowres, bad hands');
    expect(body.parameters.v4_prompt).toBeUndefined();
    expect(body.parameters).toMatchObject({
      params_version: 3,
      noise_schedule: 'native',
      image: 'IMAGE',
      mask: 'MASK',
      seed: 5,
    });
  });

  it('NovelAI 웹처럼 품질 태그·UC 프리셋 힌트를 보내고, 옛 서버 플래그는 보내지 않아', () => {
    const request = (model: string, extra: Partial<GenerationSettings>) =>
      (
        buildNovelAIInpaintRequest({
          prompt: 'p',
          negativePrompt: '',
          characterPrompt: '',
          characterNegativePrompt: '',
          imageBase64: 'I',
          maskBase64: 'M',
          width: 1024,
          height: 1024,
          seed: 1,
          settings: { ...settings, model, ...extra },
        }) as any
      ).parameters;
    const v5 = 'nai-diffusion-5-full-inpainting';
    expect(request(v5, {})).toMatchObject({ tag_hint_qt: 0, tag_hint_uc_preset: 0 });
    expect(
      request(v5, { qualityTags: true, qualityLevel: 'light', ucPreset: 'heavy' }),
    ).toMatchObject({ tag_hint_qt: 3, tag_hint_uc_preset: 2 });
    expect(request(v5, { qualityTags: true, ucPreset: 'furry' })).toMatchObject({
      tag_hint_qt: 1,
      tag_hint_uc_preset: 5,
    });
    // 모델에 없는 단계·프리셋은 붙지 않으므로 힌트도 없음(Light 단계는 Standard로 붙는다).
    expect(
      request('nai-diffusion-4-5-curated-inpainting', {
        qualityTags: true,
        qualityLevel: 'light',
        ucPreset: 'furry',
      }),
    ).toMatchObject({ tag_hint_qt: 1, tag_hint_uc_preset: 0 });
    const v3 = request('nai-diffusion-3-inpainting', { ucPreset: 'human' });
    expect(v3).toMatchObject({ tag_hint_uc_preset: 4 });
    for (const params of [request(v5, {}), v3, request('nai-diffusion-4-5-full-inpainting', {})]) {
      expect(params.qualityToggle).toBeUndefined();
      expect(params.ucPreset).toBeUndefined();
    }
  });

  it('V4 Full과 Curated 인페인트 모델도 v4 형식으로 만들어', () => {
    for (const model of ['nai-diffusion-4-full-inpainting', 'nai-diffusion-4-curated-inpainting']) {
      const body = buildNovelAIInpaintRequest({
        prompt: 'p',
        negativePrompt: 'n',
        characterPrompt: 'c',
        characterNegativePrompt: '',
        imageBase64: 'I',
        maskBase64: 'M',
        width: 1024,
        height: 1024,
        seed: 1,
        settings: { ...settings, model },
      }) as any;
      expect(body.model).toBe(model);
      expect(body.parameters.v4_prompt.caption.char_captions).toHaveLength(1);
    }
  });
});
