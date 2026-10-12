import { describe, expect, it } from 'vitest';
import type { JobAid, Reference } from '../../src/core/domain/types';
import { buildJobs, buildTxt2ImgJobs } from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createDefaultLibrary,
  createEmotion,
  createPreset,
  createProject,
  createPromptSet,
  createCharacterReference,
  createVibe,
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
  projectAid,
  resolveProject,
} from '../../src/core/model/defaults';
import { estimateJobAnlas, generationCostWarnings } from '../../src/core/providers/NaiCost';
import { supportsReferenceAid } from '../../src/core/providers/NaiModels';
import {
  buildNovelAIEncodeVibeRequest,
  buildNovelAIJobRequest,
  vibeCacheKey,
  vibeStrengths,
} from '../../src/core/providers/NovelAIRequestBuilder';
import { generationEnqueueRequestSchema, librarySchema } from '../../src/core/validation/schemas';

const sha = 'c'.repeat(64);
const character: JobAid = {
  kind: 'character',
  name: '아리아 얼굴',
  imagePath: `inputs/${sha}.png`,
  imageSha256: sha,
  target: 'character',
  fidelity: 0.75,
};
const sunset = {
  name: '노을',
  imagePath: `inputs/${sha}.png`,
  imageSha256: sha,
  strength: 0.5,
  informationExtracted: 0.8,
};
const vibe: JobAid = { kind: 'vibe', vibes: [sunset] };

const reference: Reference = {
  id: 'ref-1',
  name: '아리아 참고',
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

function setup(model = 'nai-diffusion-4-5-full-inpainting') {
  const promptSet = createPromptSet('기본', { positive: 'silver hair', negative: '' });
  const char = createCharacter('아리아', [promptSet]);
  const emotionSet = { id: 'set', name: '씬', emotions: [createEmotion('기쁨', 'smile')] };
  const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: '' });
  preset.generation = { ...preset.generation, model, variantsPerEmotion: 1 };
  const project = createProject('작업', {
    presetId: preset.id,
    character: char,
    emotionSetId: emotionSet.id,
    referenceId: reference.id,
  });
  return {
    project,
    preset,
    characters: [{ name: char.name, promptSet }],
    emotionSet,
    emotionIds: [emotionSet.emotions[0].id],
    settings: DEFAULT_SETTINGS,
  };
}

const withHashes = <T extends object>(job: T) => ({
  ...job,
  imageSha256: 'a'.repeat(64),
  maskSha256: 'b'.repeat(64),
});

describe('캐릭터 레퍼런스·바이브', () => {
  it('V4.5만 받고 V5나 V4는 받지 않아', () => {
    expect(supportsReferenceAid('nai-diffusion-4-5-full-inpainting')).toBe(true);
    expect(supportsReferenceAid('nai-diffusion-4-5-curated-inpainting')).toBe(true);
    expect(supportsReferenceAid('nai-diffusion-5-full-inpainting')).toBe(false);
    expect(supportsReferenceAid('nai-diffusion-4-full-inpainting')).toBe(false);
  });

  it('캐릭터 레퍼런스는 일반 생성에 0단계 형식으로 붙이고 충실도를 secondary strength로 바꿔', () => {
    const [job] = buildTxt2ImgJobs({
      ...setup(),
      aid: character,
    });
    expect(job).toMatchObject({ kind: 'txt2img', referenceName: '', aid: character });
    expect(generationEnqueueRequestSchema.safeParse({ jobs: [job] }).success).toBe(true);
    const { body } = buildNovelAIJobRequest(job, { aidBase64: ['REF'] });
    expect(body.parameters).toMatchObject({
      director_reference_images: ['REF'],
      director_reference_descriptions: [
        { caption: { base_caption: 'character', char_captions: [] }, legacy_uc: false },
      ],
      director_reference_information_extracted: [1],
      director_reference_strength_values: [1],
      director_reference_secondary_strength_values: [0.25],
    });
    expect(body.model).toBe('nai-diffusion-4-5-full');
    const style = buildNovelAIJobRequest(
      { ...job, aid: { ...character, target: 'style' } },
      { aidBase64: ['REF'] },
    ).body.parameters as { director_reference_descriptions: Array<{ caption: object }> };
    expect(style.director_reference_descriptions[0].caption).toMatchObject({
      base_caption: 'style',
    });
  });

  it('바이브는 인페인트에도 붙이고 바이브마다 인코딩 결과와 세기를 보내', () => {
    const [job] = buildJobs({
      ...setup(),
      reference,
      input: {
        imagePath: 'inputs/a.png',
        maskPath: 'inputs/b.png',
        imageSha256: 'a',
        maskSha256: 'b',
      },
      aid: { kind: 'vibe', vibes: [sunset, { ...sunset, name: '비', strength: 0.3 }] },
    });
    expect(job.kind).toBe('inpaint');
    expect(generationEnqueueRequestSchema.safeParse({ jobs: [withHashes(job)] }).success).toBe(
      true,
    );
    const { body } = buildNovelAIJobRequest(job, {
      imageBase64: 'IMG',
      maskBase64: 'MASK',
      aidBase64: ['VIBE1', 'VIBE2'],
    });
    expect(body.model).toBe('nai-diffusion-4-5-full-inpainting');
    expect(body.parameters).toMatchObject({
      reference_image_multiple: ['VIBE1', 'VIBE2'],
      reference_strength_multiple: [0.5, 0.3],
      normalize_reference_strength_multiple: true,
    });
    expect(() => buildNovelAIJobRequest(job, { imageBase64: 'IMG', maskBase64: 'MASK' })).toThrow(
      '참고 그림',
    );
    // NovelAI 웹은 바이브를 두 자리 수까지 받아 4개 넘게도 넣는다.
    const many = { kind: 'vibe', vibes: Array(12).fill(sunset) };
    expect(
      generationEnqueueRequestSchema.safeParse({ jobs: [withHashes({ ...job, aid: many })] })
        .success,
    ).toBe(true);
  });

  it('Normalize를 켜면 세기 합이 1을 넘을 때만 비율대로 줄이고, 끄면 그대로 보내', () => {
    const two = { kind: 'vibe' as const, vibes: [sunset, { ...sunset, strength: 0.75 }] };
    const strengths = (aid: JobAid) => {
      const [job] = buildTxt2ImgJobs({ ...setup(), aid });
      return buildNovelAIJobRequest(job, { aidBase64: ['A', 'B'] }).body.parameters as Record<
        string,
        unknown
      >;
    };
    expect(strengths(two)).toMatchObject({
      reference_strength_multiple: [0.4, 0.6],
      normalize_reference_strength_multiple: true,
    });
    expect(strengths({ ...two, normalize: false })).toMatchObject({
      reference_strength_multiple: [0.5, 0.75],
      normalize_reference_strength_multiple: false,
    });
    expect(vibeStrengths([0.3, 0.2], true)).toEqual([0.3, 0.2]);
    expect(vibeStrengths([0.8], true)).toEqual([0.8]);
  });

  it('V4.5가 아니면 작업을 만들지 않아', () => {
    expect(() =>
      buildTxt2ImgJobs({
        ...setup('nai-diffusion-5-full-inpainting'),
        aid: vibe,
      }),
    ).toThrow('V4.5');
  });

  it('바이브 인코딩은 일반 생성 모델로 하고, 같은 그림·모델·추출량이면 같은 이름으로 다시 써', () => {
    const settings = { model: 'nai-diffusion-4-5-full-inpainting' };
    expect(buildNovelAIEncodeVibeRequest('IMG', settings, 0.8)).toEqual({
      image: 'IMG',
      information_extracted: 0.8,
      model: 'nai-diffusion-4-5-full',
    });
    expect(vibeCacheKey(sha, settings, 0.8)).toBe(`${sha}-nai-diffusion-4-5-full-ie80`);
    expect(vibeCacheKey(sha, settings, 1)).not.toBe(vibeCacheKey(sha, settings, 0.8));
  });

  it('캐릭터 레퍼런스는 무료 조건 안에서도 장마다 5 Anlas를 더해', () => {
    const [job] = buildTxt2ImgJobs({ ...setup(), aid: character });
    expect(estimateJobAnlas(job)).toBe(5);
    expect(generationCostWarnings([job])).toContain(
      '캐릭터 레퍼런스는 Opus여도 한 장에 5 Anlas가 듭니다.',
    );
    const [plain] = buildTxt2ImgJobs({ ...setup(), aid: vibe });
    expect(estimateJobAnlas(plain)).toBe(0);
    const [six] = buildTxt2ImgJobs({
      ...setup(),
      aid: { kind: 'vibe', vibes: Array(6).fill(sunset) },
    });
    expect(estimateJobAnlas(six)).toBe(4);
    expect(generationCostWarnings([six])).toContain(
      '바이브가 4개를 넘으면 넘는 바이브마다 Opus여도 한 장에 2 Anlas가 듭니다.',
    );
  });

  it('방식 버튼으로 캐릭터 레퍼런스나 바이브를 쓰고, 고른 항목·그림·V4.5 모델이 없으면 알려 줘', () => {
    const library = createDefaultLibrary();
    const { project, preset } = setup('nai-diffusion-5-full-inpainting');
    const face = {
      ...createCharacterReference('얼굴'),
      image: { file: `${'d'.repeat(24)}.png`, width: 10, height: 10, name: 'a.png' },
    };
    const mood = createVibe('노을');
    const full = {
      ...library,
      presets: [preset],
      references: [reference],
      characterReferences: [face],
      vibes: [mood],
    };
    const txt = { ...project, mode: 'txt2img' as const };
    expect(projectAid(full, { ...txt, characterReferenceId: face.id })).toMatchObject({
      kind: 'character',
      item: face,
    });
    // 인페인트는 캐릭터 레퍼런스를 골라 두었어도 바이브만 쓴다.
    expect(projectAid(full, { ...project, characterReferenceId: face.id })).toBeUndefined();
    expect(projectAid(full, { ...project, vibeIds: [mood.id] })?.kind).toBe('vibe');
    expect(projectAid(full, txt)).toBeUndefined();
    const both = { ...txt, characterReferenceId: face.id, vibeIds: [mood.id] };
    expect(projectAid(full, both)?.kind).toBe('character');
    expect(projectAid(full, { ...both, aidMode: 'vibe' })).toMatchObject({
      kind: 'vibe',
      vibes: [{ id: mood.id, item: mood }],
    });
    const missing = (value: typeof project) => resolveProject(full, value).missing;
    expect(missing({ ...txt, characterReferenceId: face.id })).toContain('V4.5 모델');
    expect(missing({ ...txt, characterReferenceId: 'gone' })).toContain('캐릭터 레퍼런스');
    expect(missing({ ...txt, vibeIds: [mood.id] })).toContain('바이브 그림');
    expect(missing({ ...txt, vibeIds: ['gone'] })).toContain('바이브');
    expect(missing(txt)).not.toContain('V4.5 모델');
  });

  it('라이브러리의 캐릭터 레퍼런스·바이브를 읽고, 잘못된 값은 기본값으로 바꿔', () => {
    const library = createDefaultLibrary();
    const parsed = librarySchema.parse({
      ...library,
      characterReferences: [
        { id: 'c', name: '얼굴', target: 'x', fidelity: 2 },
        { id: 'd', name: '옛 항목', styleAware: false, fidelity: 0.5 },
      ],
      vibes: [{ id: 'v', name: '노을', strength: 0.3, image: { file: '../x.png' } }],
      projects: [{ ...setup().project, vibeIds: undefined, vibeId: 'v' }],
    });
    expect(parsed.characterReferences[0]).toMatchObject({ target: 'character&style', fidelity: 1 });
    expect(parsed.characterReferences[1]).toMatchObject({ target: 'character' });
    expect(parsed.projects[0].vibeIds).toEqual(['v']);
    expect(parsed.vibes[0]).toMatchObject({ strength: 0.3, informationExtracted: 1 });
    expect(parsed.vibes[0].image).toBeUndefined();
    const old: Record<string, unknown> = { ...library };
    delete old.characterReferences;
    delete old.vibes;
    expect(librarySchema.parse(old)).toMatchObject({ characterReferences: [], vibes: [] });
  });
});
