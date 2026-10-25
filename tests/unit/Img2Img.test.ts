import { describe, expect, it } from 'vitest';
import type { GenerationRecord } from '../../src/core/domain/types';
import { buildResultImg2ImgJobs } from '../../src/core/jobs/JobBuilder';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/core/model/defaults';
import {
  defaultRefineSettings,
  projectRefineSettings,
  refineTarget,
} from '../../src/core/model/refine';
import { generationEnqueueRequestSchema, projectSchema } from '../../src/core/validation/schemas';

const image = { imagePath: `inputs/${'a'.repeat(64)}.png`, imageSha256: 'a'.repeat(64) };

const record: GenerationRecord = {
  id: 'rec-1',
  kind: 'inpaint',
  projectId: 'project-a',
  emotionId: 'e1',
  emotionName: '기쁨',
  createdAt: '2026-10-10T00:00:00.000Z',
  file: 'outputs/기쁨/a.png',
  width: 608,
  height: 832,
  seed: 100,
  variantIndex: 1,
  presetName: 'P',
  characterName: '아리아',
  promptSetName: '기본',
  emotionSetName: '감정',
  referenceName: '아리아',
  prompt: 'reference inset, masterpiece',
  negativePrompt: 'lowres',
  characterPrompt: '1girl, smile',
  characterNegativePrompt: '',
  emotionPrompt: 'smile',
  settings: DEFAULT_GENERATION_SETTINGS,
};

describe('i2i 작업', () => {
  it('결과를 i2i로 보내면 원래 프롬프트에서 reference inset만 빼고 원본 seed부터 이어가', () => {
    const jobs = buildResultImg2ImgJobs({
      record,
      image,
      width: 832,
      height: 1216,
      strength: 0.4,
      noise: 0,
      count: 2,
      seedMode: 'source',
      outputFilenameTemplate: '{emotion}__{seed}',
      projectName: '작업',
    });
    expect(jobs.map((job) => job.seed)).toEqual([100, 101]);
    expect(jobs[0]).toMatchObject({
      kind: 'img2img',
      sourceRecordId: 'rec-1',
      emotionId: 'e1',
      prompt: 'masterpiece',
      characterPrompt: '1girl, smile',
      canvasWidth: 832,
      canvasHeight: 1216,
    });
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
  });

  it.each([
    ['negative-only', '', 'lowres'],
    ['empty', '', ''],
    ['custom', 'masterpiece, sharp', 'blurry'],
  ] as const)(
    '모델을 바꾸고 프롬프트를 %s로 하면 캐릭터를 빼고 정한 문구만 보내',
    (prompt, positive, negative) => {
      const [job] = buildResultImg2ImgJobs({
        record: {
          ...record,
          extraCharacters: [{ name: 'B', prompt: '1boy', negative: 'hat' }],
          characterCenters: [{ x: 0.3, y: 0.5 }],
          settings: { ...DEFAULT_GENERATION_SETTINGS, model: 'nai-diffusion-5-full-inpainting' },
        },
        image,
        width: 832,
        height: 1216,
        strength: 0.3,
        noise: 0,
        count: 1,
        seedMode: 'source',
        model: 'nai-diffusion-4-5-full-inpainting',
        prompt,
        customPositive: ' masterpiece, sharp ',
        customNegative: 'blurry',
        outputFilenameTemplate: '{emotion}__{seed}',
        projectName: '작업',
      });
      expect(job).toMatchObject({
        prompt: positive,
        characterPrompt: '',
        negativePrompt: negative,
        source: { commonPositive: positive, commonNegative: negative },
        settings: { model: 'nai-diffusion-4-5-full-inpainting', qualityTags: false },
      });
      expect(job).not.toHaveProperty('extraCharacters');
      expect(job).not.toHaveProperty('characterCenters');
    },
  );
});

describe('다듬기 설정', () => {
  it('저장한 값이 없으면 인페인트 결과 영역에 가까운 기본 해상도로 시작해', () => {
    const settings = projectRefineSettings(
      { mode: 'reference' },
      { generation: { ...DEFAULT_GENERATION_SETTINGS, img2imgStrength: 0.45 } },
      {
        image: {
          originalFile: '',
          canvasFile: '',
          maskFile: '',
          originalName: '',
          canvasWidth: 1216,
          canvasHeight: 832,
          referenceRect: { x: 0, y: 0, width: 608, height: 832 },
          outputRect: { x: 608, y: 0, width: 608, height: 832 },
        },
      },
    );
    expect(settings).toMatchObject({ size: { width: 832, height: 1216 }, strength: 0.45 });
    expect(refineTarget('closest-ratio', 608, 832).width).toBeLessThan(1024);
  });

  it('작업과 작업 큐가 다듬기 설정을 읽어', () => {
    const refine = defaultRefineSettings(DEFAULT_GENERATION_SETTINGS, { width: 64, height: 64 });
    const project = projectSchema.parse({
      id: 'project-a',
      name: 'A',
      presetId: 'p',
      characters: [],
      emotionSetId: 'e',
      referenceId: '',
      refine,
      autoRefine: true,
      createdAt: '',
      updatedAt: '',
    });
    expect(project).toMatchObject({ refine, autoRefine: true });
    const [job] = buildResultImg2ImgJobs({
      record,
      image,
      width: 832,
      height: 1216,
      strength: 0.4,
      noise: 0,
      count: 1,
      seedMode: 'source',
      outputFilenameTemplate: '',
      projectName: '작업',
    });
    const parsed = generationEnqueueRequestSchema.parse({ jobs: [{ ...job, refine }] });
    expect(parsed.jobs[0].refine).toEqual(refine);
    const broken = projectSchema.parse({ ...project, refine: { model: 1 } });
    expect(broken.refine).toBeUndefined();
  });
});
