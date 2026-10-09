import { describe, expect, it } from 'vitest';
import type { GenerationRecord } from '../../src/core/domain/types';
import { buildResultImg2ImgJobs } from '../../src/core/jobs/JobBuilder';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/core/model/defaults';
import { generationEnqueueRequestSchema } from '../../src/core/validation/schemas';

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
});
