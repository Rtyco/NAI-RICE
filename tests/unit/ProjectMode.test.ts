import { describe, expect, it } from 'vitest';
import {
  buildFreeJobs,
  buildTxt2ImgJobs,
  composeRequestPrompts,
} from '../../src/core/jobs/JobBuilder';
import { guessModelFromSource } from '../../src/core/metadata/NaiMetadata';
import {
  createCharacter,
  createDefaultLibrary,
  createEmotion,
  createPreset,
  createProject,
  createPromptSet,
  createReference,
  DEFAULT_SETTINGS,
  FREE_PROJECT_ID,
  resolveProject,
} from '../../src/core/model/defaults';
import { estimateJobAnlas } from '../../src/core/providers/NaiCost';
import {
  addsAutoNsfw,
  INPAINT_MODELS,
  NAI_TAGS,
  requestModelId,
  supportsInpaint,
} from '../../src/core/providers/NaiModels';
import { buildNovelAIJobRequest } from '../../src/core/providers/NovelAIRequestBuilder';
import { generationEnqueueRequestSchema, librarySchema } from '../../src/core/validation/schemas';

const V5_CURATED = 'nai-diffusion-5-curated';

function setup() {
  const promptSet = createPromptSet('기본', { positive: '1girl, silver hair', negative: '' });
  const character = createCharacter('아리아', [promptSet]);
  const emotionSet = { id: 'set', name: '감정', emotions: [createEmotion('기쁨', 'smile')] };
  const preset = createPreset('프리셋', { commonPositive: 'masterpiece', commonNegative: '' });
  preset.generation = {
    ...preset.generation,
    seedMode: 'fixed',
    fixedSeed: 5,
    width: 1024,
    height: 1024,
  };
  const project = {
    ...createProject('작업', {
      presetId: preset.id,
      character,
      emotionSetId: emotionSet.id,
      referenceId: 'none',
    }),
    mode: 'txt2img' as const,
  };
  return { promptSet, character, emotionSet, preset, project };
}

describe('작업 모드', () => {
  it('모드가 없는 옛 작업은 레퍼런스 생성, 해상도가 없는 옛 생성 설정은 832×1216으로 읽어', () => {
    const library = createDefaultLibrary();
    const character = createCharacter('아리아');
    const reference = createReference('아리아');
    const oldProject: Record<string, unknown> = createProject('작업', {
      presetId: library.presets[0].id,
      character,
      emotionSetId: library.emotionSets[0].id,
      referenceId: reference.id,
    });
    delete oldProject.mode;
    const oldGeneration: Record<string, unknown> = { ...library.presets[0].generation };
    delete oldGeneration.width;
    delete oldGeneration.height;
    const parsed = librarySchema.parse({
      ...library,
      presets: [{ ...library.presets[0], generation: oldGeneration }],
      characters: [character],
      references: [reference],
      projects: [oldProject],
    });
    expect(parsed.projects[0].mode).toBe('reference');
    expect(parsed.presets[0].generation).toMatchObject({ width: 832, height: 1216 });
  });

  it('일반 생성은 인페인트가 없어도 되고, 레퍼런스 생성은 인페인트 모델이 있어야 해', () => {
    const library = createDefaultLibrary();
    const character = createCharacter('아리아');
    const project = createProject('작업', {
      presetId: library.presets[0].id,
      character,
      emotionSetId: library.emotionSets[0].id,
      referenceId: 'missing',
    });
    const full = { ...library, characters: [character], projects: [project] };
    expect(resolveProject(full, project).missing).toEqual(['인페인트']);
    expect(resolveProject(full, { ...project, mode: 'txt2img' }).missing).toEqual([]);

    const curated = {
      ...full,
      presets: [
        {
          ...library.presets[0],
          generation: { ...library.presets[0].generation, model: V5_CURATED },
        },
      ],
    };
    expect(resolveProject(curated, project).missing).toContain('인페인트 모델');
    expect(resolveProject(curated, { ...project, mode: 'txt2img' }).missing).toEqual([]);
  });
});

describe('일반 생성 작업', () => {
  it('생성 설정의 해상도로 txt2img 작업을 만들고 reference inset은 붙이지 않아', () => {
    const { character, promptSet, emotionSet, preset, project } = setup();
    const jobs = buildTxt2ImgJobs({
      project,
      preset,
      characterName: character.name,
      promptSet,
      emotionSet,
      emotionIds: [emotionSet.emotions[0].id],
      settings: DEFAULT_SETTINGS,
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: 'txt2img',
      canvasWidth: 1024,
      canvasHeight: 1024,
      referenceName: '',
      seed: 5,
    });
    expect(`${jobs[0].prompt} ${jobs[0].characterPrompt}`).not.toContain('reference inset');
    expect(jobs[0]).not.toHaveProperty('imagePath');
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
    expect(estimateJobAnlas(jobs[0])).toBe(0);
  });

  it('미리보기도 생성 방식에 맞춰 reference inset을 넣거나 빼', () => {
    const { promptSet, preset } = setup();
    expect(composeRequestPrompts(preset, promptSet, 'smile').prompt).toContain('reference inset');
    expect(
      composeRequestPrompts(preset, promptSet, 'smile', { sets: [] }, 'txt2img').prompt,
    ).not.toContain('reference inset');
  });
});

describe('V5 Curated', () => {
  it('일반 생성 전용이라 인페인트 목록에는 없고 요청에는 그대로 보내', () => {
    expect(supportsInpaint(V5_CURATED)).toBe(false);
    expect(INPAINT_MODELS.map((model) => model.id)).not.toContain(V5_CURATED);
    expect(requestModelId(V5_CURATED, 'generate')).toBe(V5_CURATED);
    expect(() => requestModelId(V5_CURATED, 'inpaint')).toThrow();

    const { character, promptSet, emotionSet, preset, project } = setup();
    preset.generation = { ...preset.generation, model: V5_CURATED };
    const [job] = buildTxt2ImgJobs({
      project,
      preset,
      characterName: character.name,
      promptSet,
      emotionSet,
      emotionIds: [emotionSet.emotions[0].id],
      settings: DEFAULT_SETTINGS,
    });
    expect(buildNovelAIJobRequest(job, {}).body).toMatchObject({
      model: V5_CURATED,
      action: 'generate',
    });
  });

  it('V5 Full과 같은 품질 태그·UC를 쓰지만 nsfw는 자동으로 붙이지 않아(NovelAI 웹과 같음)', () => {
    expect(NAI_TAGS['v5-curated']).toBe(NAI_TAGS.v5);
    expect(addsAutoNsfw(V5_CURATED, 'heavy')).toBe(false);
    expect(addsAutoNsfw('nai-diffusion-5-full-inpainting', 'heavy')).toBe(true);
  });

  it('가져온 이미지의 Source가 V5 Curated면 그 모델로 읽어', () => {
    expect(guessModelFromSource('NovelAI Diffusion V5 Curated 1A2B3C4D')).toBe(V5_CURATED);
    expect(guessModelFromSource('NovelAI Diffusion V5 1A2B3C4D')).toBe(
      'nai-diffusion-5-full-inpainting',
    );
  });
});

describe('자유 생성 작업', () => {
  it('캐릭터 없이도 만들고, 입력한 프롬프트는 공통 포지티브 끝에 붙여', () => {
    const { preset } = setup();
    const jobs = buildFreeJobs({ preset, prompt: 'cafe, window', count: 3 });
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job) => job.seed)).toEqual([5, 6, 7]);
    expect(jobs[0]).toMatchObject({
      kind: 'txt2img',
      projectId: FREE_PROJECT_ID,
      emotionId: '',
      emotionPrompt: 'cafe, window',
      characterName: '',
      characterPrompt: '',
      canvasWidth: 1024,
      canvasHeight: 1024,
    });
    expect(jobs[0].prompt).toBe('masterpiece, cafe, window');
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
  });

  it('캐릭터를 고르면 캐릭터 프롬프트는 그대로 두고 seed를 지정해 다시 만들 수 있어', () => {
    const { preset, character, promptSet } = setup();
    const [job] = buildFreeJobs({
      preset,
      character: { name: character.name, promptSet },
      prompt: 'cafe',
      count: 1,
      seedOverride: 42,
    });
    expect(job).toMatchObject({
      characterName: '아리아',
      characterPrompt: '1girl, silver hair',
      seed: 42,
    });
    expect(job.prompt).toBe('masterpiece, cafe');
  });

  it('자유 생성 설정이 없는 옛 라이브러리도 읽어', () => {
    const library = createDefaultLibrary();
    const old: Record<string, unknown> = { ...library };
    delete old.freeGeneration;
    expect(librarySchema.parse(old).freeGeneration).toEqual({
      presetId: '',
      characterId: '',
      promptSetId: '',
      prompt: '',
      count: 1,
      mode: 'txt2img',
    });
  });
});
