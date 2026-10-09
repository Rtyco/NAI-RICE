import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { Library } from '../../electron/services/Library';
import type { GenerationRecord, Img2ImgSource, Reference } from '../../src/core/domain/types';
import {
  buildFreeJobs,
  buildImg2ImgJobs,
  buildResultImg2ImgJobs,
} from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createDefaultLibrary,
  createEmotion,
  createPreset,
  createProject,
  createPromptSet,
  createReference,
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_SETTINGS,
  resolveProject,
} from '../../src/core/model/defaults';
import { generationEnqueueRequestSchema } from '../../src/core/validation/schemas';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const source: Img2ImgSource = {
  id: 'source-1',
  name: '원본',
  file: `${'b'.repeat(24)}.png`,
  width: 608,
  height: 832,
  createdAt: '2026-10-10T00:00:00.000Z',
};

const image = { imagePath: `inputs/${'a'.repeat(64)}.png`, imageSha256: 'a'.repeat(64) };

const reference: Reference = {
  ...createReference('아리아'),
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
};

function setup() {
  const promptSet = createPromptSet('기본', { positive: '1girl', negative: '' });
  const character = createCharacter('아리아', [promptSet]);
  const emotionSet = { id: 'set', name: '감정', emotions: [createEmotion('기쁨', 'smile')] };
  const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: '' });
  preset.generation = { ...preset.generation, img2imgStrength: 0.35, img2imgNoise: 0.1 };
  const project = {
    ...createProject('작업', {
      presetId: preset.id,
      character,
      emotionSetId: emotionSet.id,
      referenceId: reference.id,
    }),
    mode: 'img2img' as const,
  };
  return { promptSet, character, emotionSet, preset, project };
}

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
  it('i2i 모드는 생성 설정의 해상도·세기로 감정마다 만들고 reference inset은 붙이지 않아', () => {
    const { character, promptSet, emotionSet, preset, project } = setup();
    const jobs = buildImg2ImgJobs({
      project,
      preset,
      characterName: character.name,
      promptSet,
      emotionSet,
      emotionIds: [emotionSet.emotions[0].id],
      settings: DEFAULT_SETTINGS,
      source: { ...source, fromRecord: { projectId: project.id, generationId: 'rec-0' } },
      image,
    });
    expect(jobs[0]).toMatchObject({
      kind: 'img2img',
      canvasWidth: 832,
      canvasHeight: 1216,
      strength: 0.35,
      noise: 0.1,
      referenceName: '원본',
      sourceRecordId: 'rec-0',
      ...image,
    });
    expect(jobs[0].prompt).not.toContain('reference inset');
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
  });

  it('i2i 모드는 인페인트 대신 i2i 원본이 있어야 생성할 수 있어', () => {
    const library = createDefaultLibrary();
    const { character, project } = setup();
    const empty = createReference('빈 인페인트');
    const base = {
      ...project,
      presetId: library.presets[0].id,
      emotionSetId: library.emotionSets[0].id,
      referenceId: empty.id,
    };
    const full = { ...library, characters: [character], references: [empty], projects: [base] };
    expect(resolveProject(full, base).missing).toEqual(['i2i 원본']);
    const withSource = { ...full, img2imgSources: [source] };
    expect(resolveProject(withSource, { ...base, img2imgSourceId: source.id }).missing).toEqual([]);
  });

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

  it('자유 생성 i2i는 고른 원본과 생성 설정의 세기를 써', () => {
    const { preset } = setup();
    const [job] = buildFreeJobs({
      preset,
      prompt: 'cafe',
      count: 1,
      img2img: { image, sourceRecordId: 'rec-1' },
    });
    expect(job).toMatchObject({
      kind: 'img2img',
      strength: 0.35,
      sourceRecordId: 'rec-1',
      ...image,
    });
  });
});

describe('i2i 입력 준비', () => {
  it('i2i 원본을 sources에 넣고, 목표 크기로 자르거나 여백을 넣어 작업의 inputs에 저장해', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'desk-'));
    temporary.push(root);
    const library = new Library(root);
    await library.load();
    const source = await sharp({
      create: { width: 300, height: 100, channels: 4, background: '#ff000080' },
    })
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${source.toString('base64')}`;
    const stored = await library.addSourceImage({ kind: 'data', dataUrl });
    expect(stored).toMatchObject({ width: 300, height: 100 });
    expect(stored.file).toMatch(/^[0-9a-f]{24}\.png$/);
    // 같은 이미지는 같은 파일이 된다.
    expect((await library.addSourceImage({ kind: 'data', dataUrl })).file).toBe(stored.file);
    await expect(readFile(path.join(root, 'sources', stored.file))).resolves.toBeTruthy();

    const input = { kind: 'source' as const, file: stored.file };
    const cropped = await library.prepareImageInput({
      projectId: 'free',
      source: input,
      width: 256,
      height: 256,
      fit: 'crop',
    });
    const padded = await library.prepareImageInput({
      projectId: 'free',
      source: input,
      width: 256,
      height: 256,
      fit: 'pad',
    });
    expect(cropped.imagePath).toBe(`inputs/${cropped.imageSha256}.png`);
    expect(padded.imageSha256).not.toBe(cropped.imageSha256);
    const file = await readFile(library.resolveProject('free', padded.imagePath));
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([256, 256]);
    // 여백은 흰색이고, 반투명한 빨강은 흰 바탕에 합쳐진다.
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return [...data.subarray(offset, offset + 3)];
    };
    expect(pixel(0, 0)).toEqual([255, 255, 255]);
    expect(pixel(128, 128)).toEqual([255, 127, 127]);
    await expect(
      library.prepareImageInput({
        projectId: 'free',
        source: input,
        width: 0,
        height: 256,
        fit: 'crop',
      }),
    ).rejects.toThrow();
  });
});
