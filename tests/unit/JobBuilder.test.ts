import { describe, expect, it } from 'vitest';
import type { Reference } from '../../src/core/domain/types';
import { buildJobs, composeRequestPrompts, seedForVariant } from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createEmotion,
  createPreset,
  createProject,
  createPromptSet,
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
} from '../../src/core/model/defaults';
import { checkFreeGeneration, generationCostWarnings } from '../../src/core/providers/NaiCost';
import { generationEnqueueRequestSchema } from '../../src/core/validation/schemas';

const reference: Reference = {
  id: 'ref-1',
  name: '레퍼런스',
  image: {
    originalFile: 'original.png',
    canvasFile: 'canvas.png',
    maskFile: 'mask.png',
    originalName: 'a.png',
    canvasWidth: 1216,
    canvasHeight: 832,
    referenceRect: { x: 0, y: 0, width: 608, height: 832 },
    outputRect: { x: 608, y: 0, width: 608, height: 832 },
  },
  layout: DEFAULT_LAYOUT,
  maskExpansionPx: 8,
  backgroundThreshold: 16,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function setup(seedMode: 'fixed' | 'random-per-job', variants = 3) {
  const promptSet = createPromptSet('기본', { positive: 'silver hair', negative: 'bad hands' });
  const character = createCharacter('아리아', [promptSet]);
  const emotionSet = {
    id: 'set',
    name: '감정',
    emotions: [createEmotion('기쁨', 'smile'), createEmotion('빈 감정', '')],
  };
  const preset = createPreset('프리셋', {
    commonPositive: 'masterpiece',
    commonNegative: 'lowres',
  });
  preset.generation = {
    ...preset.generation,
    seedMode,
    fixedSeed: 100,
    variantsPerEmotion: variants,
  };
  const project = createProject('작업', {
    presetId: preset.id,
    character,
    emotionSetId: emotionSet.id,
    referenceId: reference.id,
  });
  return { character, promptSet, emotionSet, preset, project };
}

const input = {
  imagePath: 'inputs/a.png',
  maskPath: 'inputs/b.png',
  imageSha256: 'a',
  maskSha256: 'b',
};

describe('buildJobs', () => {
  it('고정 seed에서도 변형마다 다른 seed를 써서 중복 생성을 막아', () => {
    const { character, promptSet, emotionSet, preset, project } = setup('fixed');
    const jobs = buildJobs({
      project,
      preset,
      characterName: character.name,
      promptSet,
      emotionSet,
      reference,
      emotionIds: emotionSet.emotions.map((emotion) => emotion.id),
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(jobs.map((job) => job.seed)).toEqual([100, 101, 102]);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(3);
    expect(jobs[0]).toMatchObject({
      projectId: project.id,
      prompt: 'reference inset, masterpiece',
      negativePrompt: 'lowres',
      characterPrompt: 'silver hair, smile',
      characterNegativePrompt: 'bad hands',
      source: { commonPositive: 'masterpiece', characterPositive: 'silver hair' },
      canvasWidth: 1216,
      outputRect: { x: 608, y: 0, width: 608, height: 832 },
    });
  });

  it('seed 재사용과 생성 수 지정을 우선해', () => {
    const { character, promptSet, emotionSet, preset, project } = setup('random-per-job');
    const jobs = buildJobs({
      project,
      preset,
      characterName: character.name,
      promptSet,
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: DEFAULT_SETTINGS,
      seedOverride: 4_294_967_295,
      variantsOverride: 2,
    });
    expect(jobs.map((job) => job.seed)).toEqual([4_294_967_295, 0]);
    expect(seedForVariant(4_294_967_295, 2)).toBe(0);
  });

  it('품질 태그와 UC 프리셋을 모델 문구로 붙여', () => {
    const { promptSet, preset } = setup('fixed');
    preset.generation = {
      ...preset.generation,
      model: 'nai-diffusion-4-5-full-inpainting',
      qualityTags: true,
      ucPreset: 'light',
    };
    const prompts = composeRequestPrompts(preset, promptSet, 'smile');
    expect(prompts.prompt).toBe(
      'reference inset, masterpiece, very aesthetic, masterpiece, no text',
    );
    expect(prompts.negativePrompt.startsWith('nsfw, lowres, artistic error, scan artifacts')).toBe(
      true,
    );
    expect(prompts.negativePrompt.endsWith(', lowres')).toBe(true);
  });

  it('포지티브나 감정에 nsfw가 있으면 UC 프리셋 앞에 nsfw를 붙이지 않아', () => {
    const { promptSet, preset } = setup('fixed');
    preset.generation = { ...preset.generation, ucPreset: 'heavy' };
    expect(composeRequestPrompts(preset, promptSet, 'nsfw, smile').negativePrompt).not.toMatch(
      /^nsfw/,
    );
    expect(composeRequestPrompts(preset, promptSet, 'smile').negativePrompt).toMatch(/^nsfw, /);
  });

  it('V3는 네거티브가 모두 비면 NovelAI 웹처럼 lowres를 보내', () => {
    const { promptSet, preset } = setup('fixed');
    preset.commonNegative = '';
    for (const model of ['nai-diffusion-3-inpainting', 'nai-diffusion-furry-3-inpainting']) {
      preset.generation = { ...preset.generation, model, ucPreset: 'none' };
      expect(
        composeRequestPrompts(preset, { ...promptSet, negative: '' }, undefined).negativePrompt,
      ).toBe('lowres');
      // 캐릭터 네거티브가 있으면 V3 요청에서 그것과 합쳐지므로 기본값은 넣지 않는다.
      expect(composeRequestPrompts(preset, promptSet, undefined).negativePrompt).toBe('');
    }
    preset.generation = { ...preset.generation, model: 'nai-diffusion-5-full-inpainting' };
    expect(
      composeRequestPrompts(preset, { ...promptSet, negative: '' }, undefined).negativePrompt,
    ).toBe('');
  });

  it('참고 이미지가 없으면 작업을 만들지 않아', () => {
    const { character, promptSet, emotionSet, preset, project } = setup('fixed');
    expect(() =>
      buildJobs({
        project,
        preset,
        characterName: character.name,
        promptSet,
        emotionSet,
        reference: { ...reference, image: undefined },
        emotionIds: [],
        input,
        settings: DEFAULT_SETTINGS,
      }),
    ).toThrow(/참고 이미지/);
  });
});

describe('checkFreeGeneration', () => {
  it('기본 해상도 3종과 28 steps는 무료 기준 안이야', () => {
    for (const [width, height] of [
      [1216, 832],
      [832, 1216],
      [1024, 1024],
    ]) {
      expect(checkFreeGeneration({ steps: 28 }, width, height).free).toBe(true);
    }
  });

  it('면적이나 steps가 넘으면 이유를 알려줘', () => {
    const result = checkFreeGeneration({ steps: 30 }, 1280, 1024);
    expect(result.free).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });
});

describe('생성 큐 등록 검증', () => {
  const hashed = { ...input, imageSha256: 'a'.repeat(64), maskSha256: 'b'.repeat(64) };

  function jobsFor(steps: number, model = 'nai-diffusion-4-5-full-inpainting') {
    const { character, promptSet, emotionSet, preset, project } = setup('random-per-job', 2);
    preset.generation = { ...preset.generation, steps, model };
    return buildJobs({
      project,
      preset,
      characterName: character.name,
      promptSet,
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input: hashed,
      settings: DEFAULT_SETTINGS,
    });
  }

  it('buildJobs가 만든 작업은 메인 프로세스 검증을 통과해', () => {
    expect(generationEnqueueRequestSchema.safeParse({ jobs: jobsFor(28) }).success).toBe(true);
  });

  it('형식이 어긋난 작업은 거부해', () => {
    const [job] = jobsFor(28);
    const bad = [
      { ...job, projectId: '../outside' },
      { ...job, imageSha256: 'not-a-hash' },
      { ...job, canvasWidth: 100_000 },
      { ...job, settings: { ...job.settings, steps: -1 } },
    ];
    for (const item of bad)
      expect(generationEnqueueRequestSchema.safeParse({ jobs: [item] }).success).toBe(false);
    expect(generationEnqueueRequestSchema.safeParse({ jobs: [] }).success).toBe(false);
  });

  it('Anlas 경고는 작업 내용으로 다시 계산하고 중복을 합쳐', () => {
    expect(generationCostWarnings(jobsFor(28))).toEqual([]);
    expect(generationCostWarnings(jobsFor(40))).toHaveLength(1);
    const v5 = jobsFor(28, 'nai-diffusion-5-full-inpainting');
    expect(generationCostWarnings(v5, { percent: 50, isNegative: false })).toEqual([]);
    expect(generationCostWarnings(v5, { percent: 0, isNegative: false })).toHaveLength(1);
  });
});
