import { describe, expect, it } from 'vitest';
import type { GenerationRecord } from '../../src/core/domain/types';
import { buildResultAugmentJobs } from '../../src/core/jobs/JobBuilder';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/core/model/defaults';
import { freeAugmentSize, sceneMood, suggestMood } from '../../src/core/providers/NaiAugment';
import { buildNovelAIJobRequest } from '../../src/core/providers/NovelAIRequestBuilder';
import {
  emotionSetSchema,
  generationEnqueueRequestSchema,
  generationRecordSchema,
} from '../../src/core/validation/schemas';

const image = { imagePath: `inputs/${'a'.repeat(64)}.png`, imageSha256: 'a'.repeat(64) };

const record: GenerationRecord = {
  id: 'rec-1',
  kind: 'inpaint',
  projectId: 'project-a',
  emotionId: 'e-neutral',
  emotionName: '중립',
  createdAt: '2026-10-10T00:00:00.000Z',
  file: 'outputs/중립/a.png',
  width: 832,
  height: 1216,
  seed: 100,
  variantIndex: 1,
  presetName: 'P',
  characterName: '아리아',
  promptSetName: '기본',
  emotionSetName: '씬',
  referenceName: '아리아',
  prompt: 'reference inset, masterpiece',
  negativePrompt: 'lowres',
  characterPrompt: '1girl',
  characterNegativePrompt: '',
  emotionPrompt: 'neutral expression',
  settings: DEFAULT_GENERATION_SETTINGS,
};

const base = {
  record,
  image,
  width: 832,
  height: 1216,
  toolPrompt: '',
  defry: 0,
  outputFilenameTemplate: '{emotion}__{seed}',
  projectName: '작업',
};

describe('디렉터 툴 작업', () => {
  it('결과 하나에 툴을 쓰면 원래 씬에 한 장을 쌓고 원래 결과를 남겨', () => {
    const jobs = buildResultAugmentJobs({ ...base, tool: 'declutter' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: 'augment',
      tool: 'declutter',
      sourceRecordId: 'rec-1',
      emotionId: 'e-neutral',
      seed: 100,
      prompt: 'masterpiece',
      canvasWidth: 832,
      canvasHeight: 1216,
    });
    expect(jobs[0].mood).toBeUndefined();
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
  });

  it('씬 세트를 만들면 씬마다 그 씬의 표정·강도로 작업을 만들고 결과는 그 씬에 쌓여', () => {
    const jobs = buildResultAugmentJobs({
      ...base,
      tool: 'emotion',
      toolPrompt: 'tears',
      defry: 1,
      targets: [
        { emotionId: 'e-happy', emotionName: '기쁨', emotionPrompt: 'smile', mood: 'happy' },
        { emotionId: 'e-sad', emotionName: '슬픔', emotionPrompt: 'sad', mood: 'sad', defry: 3 },
      ],
    });
    expect(jobs.map((job) => [job.emotionId, job.emotionName, job.mood, job.defry])).toEqual([
      ['e-happy', '기쁨', 'happy', 1],
      ['e-sad', '슬픔', 'sad', 3],
    ]);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(2);
    expect(buildNovelAIJobRequest(jobs[1], { imageBase64: 'IMG' }).body).toEqual({
      req_type: 'emotion',
      width: 832,
      height: 1216,
      image: 'IMG',
      prompt: 'sad;;tears',
      defry: 3,
    });
  });

  it('장수를 주면 대상마다 그만큼 만들고 장마다 번호를 붙여', () => {
    const jobs = buildResultAugmentJobs({
      ...base,
      tool: 'emotion',
      count: 3,
      targets: [
        { emotionId: 'e-happy', emotionName: '기쁨', emotionPrompt: '', mood: 'happy' },
        { emotionId: 'e-sad', emotionName: '슬픔', emotionPrompt: '', mood: 'sad' },
      ],
    });
    expect(jobs.map((job) => `${job.emotionId}:${job.variantIndex}`)).toEqual([
      'e-happy:1',
      'e-happy:2',
      'e-happy:3',
      'e-sad:1',
      'e-sad:2',
      'e-sad:3',
    ]);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(6);
  });

  it('씬 이름으로 Emotion 표정을 추천해', () => {
    expect(
      ['중립', '기쁨', '슬픔', '분노', '놀람', '부끄러움', '크게 웃음', 'Smile', '카페'].map(
        suggestMood,
      ),
    ).toEqual([
      'neutral',
      'happy',
      'sad',
      'angry',
      'surprised',
      'embarrassed',
      'laughing',
      'happy',
      undefined,
    ]);
  });

  it('씬에 정해 둔 표정이 있으면 이름 추천보다 먼저 써', () => {
    expect(sceneMood({ name: '기쁨', augmentMood: 'laughing' })).toBe('laughing');
    expect(sceneMood({ name: '기쁨' })).toBe('happy');
    expect(sceneMood({ name: '카페' })).toBeUndefined();
  });

  it('무료 면적 안이면 크기를 그대로 두고, 넘으면 비율을 지켜 64 배수로 줄여', () => {
    expect(freeAugmentSize(832, 1216)).toEqual({ width: 832, height: 1216 });
    expect(freeAugmentSize(1000, 700)).toEqual({ width: 1000, height: 700 });
    const big = freeAugmentSize(1664, 2432);
    expect(big.width * big.height).toBeLessThanOrEqual(1024 * 1024);
    expect([big.width % 64, big.height % 64]).toEqual([0, 0]);
    expect(big.width / big.height).toBeCloseTo(1664 / 2432, 1);
  });

  it('씬의 Emotion 툴 값과 결과의 툴 정보는 선택 사항이고 잘못된 값은 버려', () => {
    const set = emotionSetSchema.parse({
      id: 's',
      name: '씬',
      emotions: [
        { id: 'a', name: '기쁨', prompt: '', augmentMood: 'happy', augmentDefry: 2 },
        { id: 'b', name: '슬픔', prompt: '', augmentMood: '', augmentDefry: 9 },
        { id: 'c', name: '중립', prompt: '' },
      ],
    });
    expect(set.emotions.map((e) => [e.augmentMood, e.augmentDefry])).toEqual([
      ['happy', 2],
      [undefined, undefined],
      [undefined, undefined],
    ]);
    const parsed = generationRecordSchema.parse({
      ...record,
      augment: { tool: 'nope' },
    });
    expect(parsed.augment).toBeUndefined();
  });
});
