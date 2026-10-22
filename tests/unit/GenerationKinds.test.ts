import { describe, expect, it } from 'vitest';
import type {
  AugmentJobSnapshot,
  GenerationJobSnapshot,
  Img2ImgJobSnapshot,
  InpaintJobSnapshot,
  Txt2ImgJobSnapshot,
} from '../../src/core/domain/types';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/core/model/defaults';
import { estimateJobAnlas, generationCostWarnings } from '../../src/core/providers/NaiCost';
import {
  buildNovelAIJobRequest,
  NAI_AUGMENT_ENDPOINT,
  NAI_IMAGE_ENDPOINT,
} from '../../src/core/providers/NovelAIRequestBuilder';
import {
  generationEnqueueRequestSchema,
  generationIndexSchema,
} from '../../src/core/validation/schemas';

const common = {
  id: 'job',
  createdAt: '2026-10-09T00:00:00.000Z',
  projectId: 'project-a',
  projectName: '작업',
  characterName: '아리아',
  emotionId: 'e1',
  emotionName: '기쁨',
  emotionPrompt: 'smile',
  presetName: 'P',
  promptSetName: '기본',
  emotionSetName: '감정',
  referenceName: '',
  prompt: '1girl',
  negativePrompt: 'lowres',
  characterPrompt: '',
  characterNegativePrompt: '',
  source: { commonPositive: '1girl', commonNegative: 'lowres', characterPositive: '' },
  seed: 7,
  variantIndex: 1,
  canvasWidth: 832,
  canvasHeight: 1216,
  outputFilenameTemplate: '',
  settings: { ...DEFAULT_GENERATION_SETTINGS },
  warnings: [],
};
const image = { imagePath: 'inputs/a.png', imageSha256: 'a'.repeat(64) };

function omit<T extends object>(value: T, key: keyof T): Partial<T> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

const inpaint: InpaintJobSnapshot = {
  ...common,
  ...image,
  kind: 'inpaint',
  maskPath: 'inputs/b.png',
  maskSha256: 'b'.repeat(64),
  outputRect: { x: 0, y: 0, width: 416, height: 1216 },
  keepDiagnosticCanvas: false,
};
const txt2img: Txt2ImgJobSnapshot = { ...common, kind: 'txt2img' };
const img2img: Img2ImgJobSnapshot = {
  ...common,
  ...image,
  kind: 'img2img',
  strength: 0.4,
  noise: 0,
};
const augment = (tool: AugmentJobSnapshot['tool'], extra: Partial<AugmentJobSnapshot> = {}) =>
  ({
    ...common,
    ...image,
    kind: 'augment',
    tool,
    toolPrompt: '',
    defry: 0,
    ...extra,
  }) satisfies AugmentJobSnapshot;

describe('생성 방식 구분 이전 데이터', () => {
  it('kind가 없는 생성 기록은 인페인트로 읽고, 새 필드는 그대로 둬', () => {
    const old = {
      id: 'r1',
      projectId: 'project-a',
      emotionId: 'e1',
      emotionName: '기쁨',
      createdAt: '',
      file: 'outputs/기쁨/a.png',
      width: 416,
      height: 1216,
      seed: 7,
      variantIndex: 1,
      presetName: 'P',
      promptSetName: '기본',
      prompt: '1girl',
      negativePrompt: '',
      characterPrompt: '',
      characterNegativePrompt: '',
      emotionPrompt: 'smile',
      settings: DEFAULT_GENERATION_SETTINGS,
    };
    const parsed = generationIndexSchema.parse({
      schemaVersion: 2,
      records: [old, { ...old, id: 'r2', kind: 'img2img', sourceRecordId: 'r1', anlasEstimate: 0 }],
    });
    expect(parsed.records[0].kind).toBe('inpaint');
    expect(parsed.records[1]).toMatchObject({
      kind: 'img2img',
      sourceRecordId: 'r1',
      anlasEstimate: 0,
    });
  });
});

describe('생성 작업 검증', () => {
  const accepts = (job: unknown) =>
    generationEnqueueRequestSchema.safeParse({ jobs: [job] }).success;

  it('종류마다 필요한 입력이 있으면 받아들여', () => {
    for (const job of [inpaint, txt2img, img2img, augment('emotion', { mood: 'happy' })])
      expect(accepts(job)).toBe(true);
  });

  it('종류가 없거나, 그 종류에 필요한 입력이 없거나, 값이 범위를 벗어나면 거부해', () => {
    for (const job of [
      omit(inpaint, 'kind'),
      omit(inpaint, 'maskPath'),
      omit(img2img, 'imagePath'),
      { ...img2img, strength: 1.5 },
      { ...augment('emotion'), defry: 6 },
      { ...augment('emotion'), tool: 'upscale' },
    ])
      expect(accepts(job)).toBe(false);
  });
});

describe('작업별 NovelAI 요청', () => {
  const inputs = { imageBase64: 'IMG', maskBase64: 'MASK' };
  const body = (job: GenerationJobSnapshot) => buildNovelAIJobRequest(job, inputs).body as any;

  it('인페인트는 인페인트 모델로, 일반 생성과 i2i는 일반 모델로 보내', () => {
    expect(buildNovelAIJobRequest(inpaint, inputs).url).toBe(NAI_IMAGE_ENDPOINT);
    expect(body(inpaint)).toMatchObject({
      model: 'nai-diffusion-4-5-full-inpainting',
      action: 'infill',
    });
    expect(body(txt2img)).toMatchObject({ model: 'nai-diffusion-4-5-full', action: 'generate' });
    expect(body(img2img)).toMatchObject({ model: 'nai-diffusion-4-5-full', action: 'img2img' });
  });

  it('일반 생성은 이미지·마스크·강도를 보내지 않아', () => {
    const params = body(txt2img).parameters;
    for (const key of [
      'image',
      'mask',
      'strength',
      'noise',
      'img2img',
      'extra_noise_seed',
      'add_original_image',
      'inpaintImg2ImgStrength',
    ])
      expect(params).not.toHaveProperty(key);
  });

  it('i2i는 이미지·강도·노이즈를 보내고 색 보정은 끄며, 마스크와 원본 섞기는 보내지 않아', () => {
    const params = body({ ...img2img, noise: 0.1 }).parameters;
    expect(params).toMatchObject({
      image: 'IMG',
      strength: 0.4,
      noise: 0.1,
      extra_noise_seed: 7,
      color_correct: false,
    });
    expect(params).not.toHaveProperty('img2img');
    expect(params).not.toHaveProperty('mask');
    expect(params).not.toHaveProperty('add_original_image');
  });

  it('디렉터 툴은 augment-image로 보내고, Emotion·Colorize만 프롬프트와 강도를 붙여', () => {
    expect(buildNovelAIJobRequest(augment('declutter'), inputs)).toEqual({
      url: NAI_AUGMENT_ENDPOINT,
      body: { req_type: 'declutter', width: 832, height: 1216, image: 'IMG' },
    });
    expect(body(augment('emotion', { mood: 'sad', toolPrompt: 'tears', defry: 3 }))).toMatchObject({
      req_type: 'emotion',
      prompt: 'sad;;tears',
      defry: 3,
    });
    expect(body(augment('colorize', { toolPrompt: 'brown hair', defry: 9 }))).toMatchObject({
      prompt: 'brown hair',
      defry: 5,
    });
  });

  it('입력 이미지가 필요한 작업에 이미지가 없으면 요청을 만들지 않아', () => {
    expect(() => buildNovelAIJobRequest(img2img, {})).toThrow('입력 이미지');
    expect(() => buildNovelAIJobRequest(inpaint, { imageBase64: 'IMG' })).toThrow('마스크');
  });
});

describe('작업별 예상 Anlas', () => {
  it('i2i는 무료 기준을 넘으면 strength만큼 계산해', () => {
    expect(estimateJobAnlas(img2img)).toBe(0);
    const paid = { ...img2img, settings: { ...img2img.settings, steps: 40 } };
    expect(estimateJobAnlas({ ...paid, strength: 0.5 })).toBe(
      Math.ceil(estimateJobAnlas({ ...paid, strength: 1 }) * 0.5),
    );
  });

  it('배경 제거만 Opus여도 Anlas가 들고, 다른 디렉터 툴은 무료 기준 안이면 0이야', () => {
    expect(estimateJobAnlas(augment('bg-removal'))).toBe(65);
    expect(estimateJobAnlas(augment('bg-removal', { canvasWidth: 608, canvasHeight: 832 }))).toBe(
      35,
    );
    expect(estimateJobAnlas(augment('emotion'))).toBe(0);
    expect(generationCostWarnings([augment('bg-removal')])).toEqual([
      '배경 제거는 Opus여도 Anlas가 듭니다.',
    ]);
    expect(generationCostWarnings([augment('lineart')])).toEqual([]);
  });
});
