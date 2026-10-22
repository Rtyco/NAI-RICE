import { describe, expect, it } from 'vitest';
import type { Reference } from '../../src/core/domain/types';
import { buildJobs, composeRequestPrompts, seedForVariant } from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createEmotion,
  createPreset,
  createProject,
  createPromptSet,
  DEFAULT_DIVIDER,
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
} from '../../src/core/model/defaults';
import {
  checkFreeGeneration,
  estimateJobAnlas,
  generationCostWarnings,
  imageAnlasCost,
} from '../../src/core/providers/NaiCost';
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
  divider: DEFAULT_DIVIDER,
  inpaintStrength: 1,
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
      characters: [{ name: character.name, promptSet }],
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
      characters: [{ name: character.name, promptSet }],
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

  it('인페인트 강도는 생성 설정 대신 인페인트 항목의 값을 써', () => {
    const { character, promptSet, emotionSet, preset, project } = setup('fixed', 1);
    preset.generation = { ...preset.generation, inpaintStrength: 0.3 };
    const [job] = buildJobs({
      project,
      preset,
      characters: [{ name: character.name, promptSet }],
      emotionSet,
      reference: { ...reference, inpaintStrength: 0.85 },
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(job.settings.inpaintStrength).toBe(0.85);
  });

  it('품질 태그와 UC 프리셋을 모델 문구로 붙여', () => {
    const { promptSet, preset } = setup('fixed');
    preset.generation = {
      ...preset.generation,
      model: 'nai-diffusion-4-5-full-inpainting',
      qualityTags: true,
      ucPreset: 'light',
    };
    const prompts = composeRequestPrompts(preset, [promptSet], 'smile');
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
    expect(composeRequestPrompts(preset, [promptSet], 'nsfw, smile').negativePrompt).not.toMatch(
      /^nsfw/,
    );
    expect(composeRequestPrompts(preset, [promptSet], 'smile').negativePrompt).toMatch(/^nsfw, /);
  });

  it('V3는 네거티브가 모두 비면 NovelAI 웹처럼 lowres를 보내', () => {
    const { promptSet, preset } = setup('fixed');
    preset.commonNegative = '';
    for (const model of ['nai-diffusion-3-inpainting', 'nai-diffusion-furry-3-inpainting']) {
      preset.generation = { ...preset.generation, model, ucPreset: 'none' };
      expect(
        composeRequestPrompts(preset, [{ ...promptSet, negative: '' }], undefined).negativePrompt,
      ).toBe('lowres');
      // 캐릭터 네거티브가 있으면 V3 요청에서 그것과 합쳐지므로 기본값은 넣지 않는다.
      expect(composeRequestPrompts(preset, [promptSet], undefined).negativePrompt).toBe('');
    }
    preset.generation = { ...preset.generation, model: 'nai-diffusion-5-full-inpainting' };
    expect(
      composeRequestPrompts(preset, [{ ...promptSet, negative: '' }], undefined).negativePrompt,
    ).toBe('');
  });

  it('V5 Full Medium은 고정값으로 작업을 만들고 직접 쓴 네거티브는 보내지 않아', () => {
    const { character, promptSet, emotionSet, preset, project } = setup('fixed', 1);
    preset.generation = {
      ...preset.generation,
      model: 'nai-diffusion-5-full-inpainting',
      effort: 'medium',
      steps: 28,
      sampler: 'k_dpmpp_2m',
      ucPreset: 'light',
      cfgRescale: 0.4,
    };
    const [job] = buildJobs({
      project,
      preset,
      characters: [{ name: character.name, promptSet }],
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(job.settings).toMatchObject({
      effort: 'medium',
      steps: 14,
      sampler: 'k_euler_ancestral',
      ucPreset: 'heavy',
      cfgRescale: 0,
    });
    expect(job.negativePrompt).toMatch(/^nsfw, lowres, artistic error/);
    expect(job.negativePrompt).not.toMatch(/, lowres$/);
    expect(job.characterNegativePrompt).toBe('');
    expect(job.source.commonNegative).toBe('lowres');
  });

  it('V5 Full이 아니면 effort가 medium으로 남아 있어도 무시해', () => {
    const { promptSet, preset } = setup('fixed');
    preset.generation = {
      ...preset.generation,
      model: 'nai-diffusion-4-5-full-inpainting',
      effort: 'medium',
      steps: 28,
    };
    const prompts = composeRequestPrompts(preset, [promptSet], 'smile');
    expect(prompts.negativePrompt).toBe('lowres');
    expect(prompts.characterNegativePrompt).toBe('bad hands');
  });

  it('씬 네거티브는 공통 네거티브 뒤에 붙이고 작업에 따로 남겨', () => {
    const { character, promptSet, emotionSet, preset, project } = setup('fixed', 1);
    preset.generation = { ...preset.generation, model: 'nai-diffusion-4-5-full-inpainting' };
    emotionSet.emotions[0].negative = ', open mouth ';
    const [job] = buildJobs({
      project,
      preset,
      characters: [{ name: character.name, promptSet }],
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(job.negativePrompt).toBe('lowres, open mouth');
    expect(job.characterNegativePrompt).toBe('bad hands');
    expect(job.emotionNegative).toBe(', open mouth ');
    expect(job.source.commonNegative).toBe('lowres');

    preset.generation = {
      ...preset.generation,
      model: 'nai-diffusion-5-full-inpainting',
      effort: 'medium',
    };
    expect(
      composeRequestPrompts(preset, [promptSet], emotionSet.emotions[0]).negativePrompt,
    ).not.toMatch(/open mouth/);
  });

  it('참고 이미지가 없으면 작업을 만들지 않아', () => {
    const { character, promptSet, emotionSet, preset, project } = setup('fixed');
    expect(() =>
      buildJobs({
        project,
        preset,
        characters: [{ name: character.name, promptSet }],
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
      characters: [{ name: character.name, promptSet }],
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
    expect(generationCostWarnings(v5, { v5Quota: { percent: 50, isNegative: false } })).toEqual([]);
    expect(generationCostWarnings(v5, { v5Quota: { percent: 0, isNegative: false } })).toHaveLength(
      1,
    );
  });

  it('Opus가 아니면 무료 기준 안이어도 경고하고, 등급을 모르면 Opus로 봐', () => {
    expect(generationCostWarnings(jobsFor(28), { tier: 2 })).toEqual([
      'Opus 구독이 아니어서 모든 생성에 Anlas가 듭니다.',
    ]);
    expect(generationCostWarnings(jobsFor(28), { tier: 3 })).toEqual([]);
    expect(generationCostWarnings(jobsFor(28), {})).toEqual([]);
  });

  it('작업의 예상 Anlas: Opus 무료 기준 안이면 0, 넘거나 할당량이 없거나 Opus가 아니면 계산식 값', () => {
    const [free] = jobsFor(28);
    expect(estimateJobAnlas(free)).toBe(0);
    expect(estimateJobAnlas(free, { tier: 3 })).toBe(0);
    expect(estimateJobAnlas(free, { tier: 1 })).toBe(20);
    const [steps40] = jobsFor(40);
    expect(estimateJobAnlas(steps40)).toBe(imageAnlasCost({ width: 1216, height: 832, steps: 40 }));
    const [v5] = jobsFor(28, 'nai-diffusion-5-full-inpainting');
    expect(estimateJobAnlas(v5, { v5Quota: { percent: 10, isNegative: false } })).toBe(0);
    expect(estimateJobAnlas(v5, { v5Quota: { percent: 0, isNegative: true } })).toBe(20);
  });
});

describe('예상 Anlas', () => {
  it('0단계 실측값과 커뮤니티 계산식에 맞춰', () => {
    // 0단계: 512×512·29스텝 V4.5 일반 생성이 실제로 6 Anlas 차감됐다.
    expect(imageAnlasCost({ width: 512, height: 512, steps: 29 })).toBe(6);
    expect(imageAnlasCost({ width: 832, height: 1216, steps: 28 })).toBe(20);
    // 832×1216보다 크고 1024×1024 이하는 832×1216과 같다.
    expect(imageAnlasCost({ width: 1024, height: 1024, steps: 28 })).toBe(20);
    expect(imageAnlasCost({ width: 1024, height: 1536, steps: 28 })).toBe(30);
  });

  it('i2i strength를 곱하고 최소 2 Anlas야', () => {
    expect(imageAnlasCost({ width: 832, height: 1216, steps: 28, strength: 0.5 })).toBe(10);
    expect(imageAnlasCost({ width: 64, height: 64, steps: 1, strength: 0.1 })).toBe(2);
  });
});

describe('여러 캐릭터', () => {
  function cast() {
    const { character, promptSet, emotionSet, preset, project } = setup('fixed', 1);
    const second = createPromptSet('겨울', { positive: 'black hair', negative: 'hat' });
    const emotion = {
      ...createEmotion('웃음', 'smile'),
      extraPrompts: ['laughing'],
    };
    return {
      preset,
      project,
      emotionSet: { ...emotionSet, emotions: [emotion, createEmotion('2번만', '')] },
      characters: [
        { name: character.name, promptSet },
        { name: '리나', promptSet: second },
      ],
    };
  }

  it('씬 프롬프트를 캐릭터마다 순서대로 붙이고 이름을 +로 이어', () => {
    const { preset, project, emotionSet, characters } = cast();
    const [job] = buildJobs({
      project,
      preset,
      characters,
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(job).toMatchObject({
      characterName: '아리아+리나',
      promptSetName: '기본+겨울',
      characterPrompt: 'silver hair, smile',
      extraCharacters: [{ name: '리나', prompt: 'black hair, laughing', negative: 'hat' }],
    });
    expect(job.characterCenters).toBeUndefined();
    const hashed = { ...job, imageSha256: 'a'.repeat(64), maskSha256: 'b'.repeat(64) };
    expect(generationEnqueueRequestSchema.safeParse({ jobs: [hashed] }).success).toBe(true);
  });

  it('캐릭터가 없으면 씬과 reference inset을 캐릭터 쪽 대신 공통 쪽에 붙여', () => {
    const { preset, project, emotionSet } = cast();
    preset.generation = { ...preset.generation, referenceInsetPosition: 'character-end' };
    const [job] = buildJobs({
      project: { ...project, characters: [] },
      preset,
      characters: [],
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(job.prompt.startsWith('masterpiece, smile, reference inset')).toBe(true);
    expect(job).toMatchObject({ characterName: '', characterPrompt: '', warnings: [] });
    expect(job.extraCharacters).toBeUndefined();
  });

  it('두 번째 캐릭터 칸만 채운 씬도 생성 대상이고, 빈 칸의 캐릭터에는 아무것도 붙이지 않아', () => {
    const { preset, project, emotionSet, characters } = cast();
    emotionSet.emotions[1].extraPrompts = ['waving'];
    const jobs = buildJobs({
      project,
      preset,
      characters,
      emotionSet,
      reference,
      emotionIds: emotionSet.emotions.map((emotion) => emotion.id),
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[1].characterPrompt).toBe('silver hair');
    expect(jobs[1].extraCharacters?.[0].prompt).toBe('black hair, waving');
  });

  it('직접 지정한 위치는 V4.5에서 5×5 칸에 맞추고, 정하지 않은 캐릭터는 빈 칸을 채워', () => {
    const { preset, project, emotionSet, characters } = cast();
    preset.generation = { ...preset.generation, model: 'nai-diffusion-4-5-full-inpainting' };
    const [job] = buildJobs({
      project: { ...project, positionMode: 'manual' },
      preset,
      characters: [{ ...characters[0], center: { x: 0.52, y: 0.18 } }, characters[1]],
      emotionSet,
      reference,
      emotionIds: [emotionSet.emotions[0].id],
      input,
      settings: DEFAULT_SETTINGS,
    });
    expect(job.characterCenters).toEqual([
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it('모델이 받는 인원을 넘으면 작업을 만들지 않아', () => {
    const { preset, project, emotionSet, characters } = cast();
    preset.generation = { ...preset.generation, model: 'nai-diffusion-4-5-full-inpainting' };
    expect(() =>
      buildJobs({
        project,
        preset,
        characters: Array.from({ length: 7 }, () => characters[0]),
        emotionSet,
        reference,
        emotionIds: [emotionSet.emotions[0].id],
        input,
        settings: DEFAULT_SETTINGS,
      }),
    ).toThrow(/6명까지/);
  });

  it('Medium이면 두 번째 캐릭터부터의 네거티브도 비워', () => {
    const { preset, characters } = cast();
    preset.generation = {
      ...preset.generation,
      model: 'nai-diffusion-5-full-inpainting',
      effort: 'medium',
    };
    const prompts = composeRequestPrompts(
      preset,
      characters.map((character) => character.promptSet),
      'smile',
    );
    expect(prompts.extraCharacters).toEqual([{ prompt: 'black hair', negative: '' }]);
  });
});
