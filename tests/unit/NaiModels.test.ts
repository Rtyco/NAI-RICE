import { describe, expect, it } from 'vitest';
import { guessModelFromSource } from '../../src/core/metadata/NaiMetadata';
import {
  addsAutoNsfw,
  applyNaiTags,
  detectNaiTags,
  NAI_MODELS,
  NAI_TAGS,
  qualityLevelsFor,
  ucPresetsFor,
} from '../../src/core/providers/NaiModels';

const V5 = 'nai-diffusion-5-full-inpainting';

describe('NovelAI quality tags and UC presets', () => {
  it('모든 모델에 Standard 품질 태그와 Heavy·Light UC가 있어', () => {
    for (const model of NAI_MODELS) {
      const tags = NAI_TAGS[model.family];
      expect(tags.quality.standard, model.id).toBeTruthy();
      expect(tags.uc.heavy && tags.uc.light, model.id).toBeTruthy();
    }
  });

  it('V5만 품질 태그 Light가 있고, 모델에 없는 UC 프리셋은 고를 수 없어', () => {
    expect(qualityLevelsFor(V5)).toEqual(['standard', 'light']);
    expect(qualityLevelsFor('nai-diffusion-4-5-full-inpainting')).toEqual(['standard']);
    expect(ucPresetsFor(V5)).toEqual(['none', 'heavy', 'light', 'human', 'furry']);
    expect(ucPresetsFor('nai-diffusion-4-5-curated-inpainting')).toEqual([
      'none',
      'heavy',
      'light',
      'human',
    ]);
    expect(ucPresetsFor('nai-diffusion-4-full-inpainting')).toEqual(['none', 'heavy', 'light']);
    expect(ucPresetsFor('nai-diffusion-furry-3-inpainting')).toEqual(['none', 'heavy', 'light']);
  });

  it('V5 품질 태그 Standard와 Light는 서로 다른 문구를 붙여', () => {
    const standard = applyNaiTags(
      V5,
      { qualityTags: true, qualityLevel: 'standard', ucPreset: 'none' },
      'a',
      '',
    );
    const light = applyNaiTags(
      V5,
      { qualityTags: true, qualityLevel: 'light', ucPreset: 'none' },
      'a',
      '',
    );
    expect(standard.positive).toBe('a, very aesthetic, masterpiece, no text');
    expect(light.positive).toBe('a, very aesthetic, amazing quality, no text');
  });

  it('모델에 없는 UC 프리셋은 무시해', () => {
    expect(
      applyNaiTags(
        'nai-diffusion-4-full-inpainting',
        { qualityTags: false, ucPreset: 'furry' },
        'a',
        'b',
      ),
    ).toEqual({
      positive: 'a',
      negative: 'b',
    });
  });

  it('켜지 않으면 프롬프트를 바꾸지 않아', () => {
    expect(
      applyNaiTags(
        'nai-diffusion-3-inpainting',
        { qualityTags: false, ucPreset: 'none' },
        'a, ',
        ' b',
      ),
    ).toEqual({
      positive: 'a',
      negative: 'b',
    });
  });

  it('붙인 문구를 다시 찾아 떼어내고 설정을 알아내', () => {
    const model = 'nai-diffusion-4-5-curated-inpainting';
    for (const ucPreset of ['heavy', 'light', 'human'] as const) {
      const applied = applyNaiTags(model, { qualityTags: true, ucPreset }, '1girl, smile', 'text');
      expect(detectNaiTags(model, applied.positive, applied.negative)).toEqual({
        positive: '1girl, smile',
        negative: 'text',
        qualityTags: true,
        qualityLevel: 'standard',
        ucPreset,
      });
    }
    const light = applyNaiTags(
      V5,
      { qualityTags: true, qualityLevel: 'light', ucPreset: 'furry' },
      'x',
      '',
    );
    expect(detectNaiTags(V5, light.positive, light.negative)).toMatchObject({
      positive: 'x',
      qualityLevel: 'light',
      ucPreset: 'furry',
    });
  });

  it('모델을 모르면 모든 모델의 문구로 찾아봐', () => {
    const applied = applyNaiTags(
      'nai-diffusion-4-full-inpainting',
      { qualityTags: true, ucPreset: 'heavy' },
      'a',
      '',
    );
    const detected = detectNaiTags(undefined, applied.positive, applied.negative);
    expect(detected).toMatchObject({
      positive: 'a',
      negative: '',
      qualityTags: true,
      ucPreset: 'heavy',
    });
  });

  it('UC 프리셋을 쓰면 NovelAI 웹처럼 네거티브 맨 앞에 nsfw를 붙여', () => {
    const heavy = NAI_TAGS.v5.uc.heavy!;
    expect(applyNaiTags(V5, { qualityTags: false, ucPreset: 'heavy' }, 'x', 'text').negative).toBe(
      `nsfw, ${heavy}, text`,
    );
    // 포지티브나 캐릭터 프롬프트에 nsfw가 있으면, 또는 프리셋이 없으면 붙이지 않는다.
    expect(applyNaiTags(V5, { qualityTags: false, ucPreset: 'heavy' }, 'nsfw', '').negative).toBe(
      heavy,
    );
    expect(
      applyNaiTags(V5, { qualityTags: false, ucPreset: 'heavy' }, 'x', '', 'girl, NSFW').negative,
    ).toBe(heavy);
    expect(applyNaiTags(V5, { qualityTags: false, ucPreset: 'none' }, 'x', 'text').negative).toBe(
      'text',
    );
    // Curated 모델에는 붙이지 않는다.
    const curated = 'nai-diffusion-4-5-curated-inpainting';
    expect(addsAutoNsfw(curated, 'heavy')).toBe(false);
    expect(applyNaiTags(curated, { qualityTags: false, ucPreset: 'light' }, 'x', '').negative).toBe(
      NAI_TAGS['v4-5-curated'].uc.light,
    );
  });

  it('NovelAI 웹이 붙인 nsfw 뒤의 UC 프리셋도 찾고, 다시 붙을 nsfw는 떼어 내', () => {
    const heavy = NAI_TAGS.v5.uc.heavy!;
    expect(detectNaiTags(V5, 'x', `nsfw, ${heavy}`)).toMatchObject({
      negative: '',
      ucPreset: 'heavy',
    });
    expect(detectNaiTags(V5, 'x', `nsfw, ${NAI_TAGS.v5.uc.light}, bad feet`)).toMatchObject({
      negative: 'bad feet',
      ucPreset: 'light',
    });
    expect(detectNaiTags('nai-diffusion-4-5-full-inpainting', 'x', `nsfw, ${heavy}`)).toMatchObject(
      { negative: '', ucPreset: 'heavy' },
    );
    // 다시 붙지 않을 nsfw(포지티브에 nsfw가 있거나 Curated 모델)는 직접 쓴 것으로 보고 남긴다.
    expect(detectNaiTags(V5, 'nsfw, x', `nsfw, ${heavy}`)).toMatchObject({
      negative: 'nsfw',
      ucPreset: 'heavy',
    });
    const curated = 'nai-diffusion-4-5-curated-inpainting';
    expect(detectNaiTags(curated, 'x', `nsfw, ${NAI_TAGS['v4-5-curated'].uc.heavy}`)).toMatchObject(
      { negative: 'nsfw', ucPreset: 'heavy' },
    );
    // 프리셋이 없으면 nsfw를 그대로 둔다.
    expect(detectNaiTags(V5, 'x', 'nsfw, text')).toMatchObject({
      negative: 'nsfw, text',
      ucPreset: 'none',
    });
  });

  it('NovelAI 웹과 같은 문구를 붙여', () => {
    expect(NAI_TAGS['v4-5-full'].quality.standard).toBe('very aesthetic, masterpiece, no text');
    expect(NAI_TAGS['v4-5-curated'].quality.standard).toBe(
      'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general',
    );
    expect(NAI_TAGS['v4-curated'].quality.standard).toBe(
      'rating:general, best quality, very aesthetic, absurdres',
    );
    expect(NAI_TAGS['v4-full'].uc.light).toBe(
      'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, white blank page, blank page',
    );
  });

  it('예전 문구로 만든 이미지의 품질 태그·UC 프리셋도 알아봐', () => {
    for (const [model, family] of [
      ['nai-diffusion-4-5-full-inpainting', 'v4-5-full'],
      ['nai-diffusion-4-5-curated-inpainting', 'v4-5-curated'],
      ['nai-diffusion-4-curated-inpainting', 'v4-curated'],
    ] as const) {
      const tags = NAI_TAGS[family];
      for (const quality of [tags.quality.standard, tags.legacyQuality?.standard]) {
        expect(detectNaiTags(model, `white background, ${quality}`, ''), quality).toMatchObject({
          positive: 'white background',
          qualityTags: true,
        });
      }
    }
    for (const model of ['nai-diffusion-4-full-inpainting', 'nai-diffusion-4-curated-inpainting']) {
      const tags = NAI_TAGS[model.includes('curated') ? 'v4-curated' : 'v4-full'];
      for (const id of ['heavy', 'light'] as const) {
        for (const uc of [tags.uc[id], tags.legacyUc?.[id]]) {
          expect(detectNaiTags(model, 'x', `${uc}, text`), uc).toMatchObject({
            negative: 'text',
            ucPreset: id,
          });
        }
      }
    }
  });

  it('NovelAI 웹이 남긴 힌트를 먼저 따르고, 힌트가 없음이면 떼지 않아', () => {
    const quality = NAI_TAGS.v5.quality.standard!;
    const heavy = NAI_TAGS.v5.uc.heavy!;
    // 힌트가 '없음'이면 같은 문구가 있어도 사용자가 쓴 것으로 둔다.
    expect(
      detectNaiTags(V5, `x, ${quality}`, `${heavy}, text`, { quality: 0, uc: 0 }),
    ).toMatchObject({
      positive: `x, ${quality}`,
      negative: `${heavy}, text`,
      qualityTags: false,
      ucPreset: 'none',
    });
    // Human Focus는 Heavy로 시작하므로, 힌트가 Heavy면 Heavy만 떼고 나머지는 네거티브에 남는다.
    const human = NAI_TAGS.v5.uc.human!;
    expect(detectNaiTags(V5, 'x', human, { uc: 2 })).toMatchObject({
      negative: human.slice(heavy.length + 2),
      ucPreset: 'heavy',
    });
    expect(detectNaiTags(V5, 'x', human)).toMatchObject({ negative: '', ucPreset: 'human' });
    // 힌트와 문구가 맞지 않으면 문구로 찾는다.
    expect(detectNaiTags(V5, 'x', `nsfw, ${NAI_TAGS.v5.uc.light}`, { uc: 2 })).toMatchObject({
      ucPreset: 'light',
    });
  });

  it('V3 이미지의 네거티브가 기본값 lowres뿐이면 비운 것으로 봐', () => {
    expect(detectNaiTags('nai-diffusion-3-inpainting', 'x', 'lowres')).toMatchObject({
      negative: '',
      ucPreset: 'none',
    });
    expect(detectNaiTags('nai-diffusion-3-inpainting', 'x', 'lowres, text')).toMatchObject({
      negative: 'lowres, text',
    });
    expect(detectNaiTags(V5, 'x', 'lowres')).toMatchObject({ negative: 'lowres' });
  });

  it('태그 중간에서 잘린 문구는 품질 태그·UC 프리셋으로 보지 않아', () => {
    expect(detectNaiTags(V5, 'big very aesthetic, masterpiece, no text', '')).toMatchObject({
      positive: 'big very aesthetic, masterpiece, no text',
      qualityTags: false,
    });
    expect(detectNaiTags(V5, 'x', `${NAI_TAGS.v5.uc.light}s`)).toMatchObject({
      ucPreset: 'none',
    });
  });

  it('Source 라벨로 인페인트 모델을 추정해', () => {
    expect(guessModelFromSource('NovelAI Diffusion V4.5 4BDE2A90')).toBe(
      'nai-diffusion-4-5-full-inpainting',
    );
    expect(guessModelFromSource('NovelAI Diffusion V4.5 Curated 1A2B')).toBe(
      'nai-diffusion-4-5-curated-inpainting',
    );
    expect(guessModelFromSource('NovelAI Diffusion V4 F6302A9D')).toBe(
      'nai-diffusion-4-full-inpainting',
    );
    expect(guessModelFromSource('Stable Diffusion XL C1E1DE52')).toBe('nai-diffusion-3-inpainting');
    expect(guessModelFromSource('Stable Diffusion XL 9CC2F394')).toBe(
      'nai-diffusion-furry-3-inpainting',
    );
    expect(guessModelFromSource('Something else')).toBeUndefined();
  });
});
