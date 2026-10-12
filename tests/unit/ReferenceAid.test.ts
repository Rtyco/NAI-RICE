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
  DEFAULT_LAYOUT,
  DEFAULT_REFERENCE_AID,
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
} from '../../src/core/providers/NovelAIRequestBuilder';
import { generationEnqueueRequestSchema, librarySchema } from '../../src/core/validation/schemas';

const sha = 'c'.repeat(64);
const character: JobAid = {
  kind: 'character',
  imagePath: `inputs/${sha}.png`,
  imageSha256: sha,
  styleAware: false,
  fidelity: 0.75,
};
const vibe: JobAid = {
  kind: 'vibe',
  imagePath: `inputs/${sha}.png`,
  imageSha256: sha,
  strength: 0.5,
  informationExtracted: 0.8,
};

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
      aid: { job: character, referenceName: reference.name },
    });
    expect(job).toMatchObject({ kind: 'txt2img', referenceName: '아리아 참고', aid: character });
    expect(generationEnqueueRequestSchema.safeParse({ jobs: [job] }).success).toBe(true);
    const { body } = buildNovelAIJobRequest(job, { aidBase64: 'REF' });
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
  });

  it('바이브는 인페인트에도 붙이고 인코딩 결과와 세기를 보내', () => {
    const [job] = buildJobs({
      ...setup(),
      reference,
      input: {
        imagePath: 'inputs/a.png',
        maskPath: 'inputs/b.png',
        imageSha256: 'a',
        maskSha256: 'b',
      },
      aid: { job: vibe, referenceName: reference.name },
    });
    expect(job.kind).toBe('inpaint');
    expect(generationEnqueueRequestSchema.safeParse({ jobs: [withHashes(job)] }).success).toBe(
      true,
    );
    const { body } = buildNovelAIJobRequest(job, {
      imageBase64: 'IMG',
      maskBase64: 'MASK',
      aidBase64: 'VIBE',
    });
    expect(body.model).toBe('nai-diffusion-4-5-full-inpainting');
    expect(body.parameters).toMatchObject({
      reference_image_multiple: ['VIBE'],
      reference_strength_multiple: [0.5],
      normalize_reference_strength_multiple: true,
    });
    expect(() => buildNovelAIJobRequest(job, { imageBase64: 'IMG', maskBase64: 'MASK' })).toThrow(
      '참고 그림',
    );
  });

  it('V4.5가 아니면 작업을 만들지 않아', () => {
    expect(() =>
      buildTxt2ImgJobs({
        ...setup('nai-diffusion-5-full-inpainting'),
        aid: { job: vibe, referenceName: '' },
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
    const [job] = buildTxt2ImgJobs({ ...setup(), aid: { job: character, referenceName: '' } });
    expect(estimateJobAnlas(job)).toBe(5);
    expect(generationCostWarnings([job])).toContain(
      '캐릭터 레퍼런스는 Opus여도 한 장에 5 Anlas가 듭니다.',
    );
    const [plain] = buildTxt2ImgJobs({ ...setup(), aid: { job: vibe, referenceName: '' } });
    expect(estimateJobAnlas(plain)).toBe(0);
  });

  it('참고 방식에 필요한 그림과 V4.5 모델이 없으면 알려 주고, 인페인트에는 캐릭터 레퍼런스를 쓰지 않아', () => {
    const library = createDefaultLibrary();
    const { project, preset } = setup('nai-diffusion-5-full-inpainting');
    const full = { ...library, presets: [preset], references: [reference] };
    const txt = { ...project, mode: 'txt2img' as const };
    const aid = { ...DEFAULT_REFERENCE_AID, kind: 'character' as const };
    expect(projectAid({ ...txt, referenceAid: aid })).toEqual(aid);
    expect(projectAid({ ...project, referenceAid: aid })).toBeUndefined();
    expect(projectAid({ ...txt, referenceAid: DEFAULT_REFERENCE_AID })).toBeUndefined();
    const missing = (value: typeof project, lib = full) => resolveProject(lib, value).missing;
    expect(missing({ ...txt, referenceAid: aid })).toContain('V4.5 모델');
    expect(missing({ ...txt, referenceAid: aid }, { ...full, references: [] })).toContain(
      '참고 이미지',
    );
    expect(missing(txt, { ...full, references: [] })).not.toContain('참고 이미지');
  });

  it('작업의 참고 방식 설정을 읽고, 잘못된 값은 기본값으로 바꿔', () => {
    const library = createDefaultLibrary();
    const { project } = setup();
    const parsed = librarySchema.parse({
      ...library,
      projects: [
        {
          ...project,
          referenceAid: { kind: 'vibe', styleAware: 'x', fidelity: 2, vibeStrength: 0.3 },
        },
      ],
    });
    expect(parsed.projects[0].referenceAid).toEqual({
      kind: 'vibe',
      styleAware: true,
      fidelity: 1,
      vibeStrength: 0.3,
      vibeInformation: 1,
    });
  });
});
