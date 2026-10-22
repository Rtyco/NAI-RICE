import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { fitImage } from '../../electron/services/Images';
import { Library } from '../../electron/services/Library';
import { buildFreeAugmentJobs, buildFreeJobs } from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createDefaultLibrary,
  createPreset,
  createProject,
  createPromptSet,
} from '../../src/core/model/defaults';
import { generationEnqueueRequestSchema, librarySchema } from '../../src/core/validation/schemas';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function openLibrary() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desk-'));
  temporary.push(root);
  const library = new Library(root);
  await library.load();
  return { root, library };
}

const pngUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

function maskPng(width: number, height: number, paint: boolean) {
  return sharp({
    create: { width, height, channels: 3, background: paint ? '#ffffff' : '#000000' },
  })
    .png()
    .toBuffer();
}

describe('자유 생성 i2i 작업', () => {
  const image = { imagePath: `inputs/${'a'.repeat(64)}.png`, imageSha256: 'a'.repeat(64) };
  const mask = { maskPath: `inputs/${'b'.repeat(64)}.png`, maskSha256: 'b'.repeat(64) };
  const outputRect = { x: 0, y: 0, width: 600, height: 900 };
  const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: '' });
  preset.generation = {
    ...preset.generation,
    referenceInset: true,
    img2imgStrength: 0.35,
    img2imgNoise: 0.1,
  };

  it('마스크가 있으면 이미지 크기의 캔버스로 인페인트하고 reference inset은 붙이지 않아', () => {
    const jobs = buildFreeJobs({
      preset,
      prompt: 'smile',
      count: 2,
      image: { image, mask, width: 640, height: 960, outputRect, sourceRecordId: 'rec-1' },
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      kind: 'inpaint',
      canvasWidth: 640,
      canvasHeight: 960,
      outputRect,
      keepDiagnosticCanvas: false,
      sourceRecordId: 'rec-1',
      projectId: 'free',
      ...image,
      ...mask,
    });
    expect(jobs[0].prompt).toBe('masterpiece, smile');
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
  });

  it('마스크가 없으면 생성 설정의 세기로 이미지 전체를 i2i하고 여백은 결과에서 잘라', () => {
    const [job] = buildFreeJobs({
      preset,
      prompt: 'smile',
      count: 1,
      image: { image, width: 640, height: 960, outputRect },
    });
    expect(job).toMatchObject({
      kind: 'img2img',
      canvasWidth: 640,
      canvasHeight: 960,
      strength: 0.35,
      noise: 0.1,
      outputRect,
      ...image,
    });
    expect(generationEnqueueRequestSchema.safeParse({ jobs: [job] }).success).toBe(true);
  });
});

describe('자유 생성 프롬프트 위치', () => {
  const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: '' });
  const build = (
    positive: string,
    promptPosition?: 'character-end' | 'common-end',
    negative?: string,
  ) =>
    buildFreeJobs({
      preset,
      characters: [{ name: 'C', promptSet: createPromptSet('기본', { positive }) }],
      prompt: 'sitting',
      negative,
      promptPosition,
      count: 1,
    })[0];

  it('고르지 않으면 공통 포지티브 끝에, 캐릭터 끝을 고르면 캐릭터 프롬프트 끝에 붙여', () => {
    expect(build('1girl').prompt).toContain('sitting');
    expect(build('1girl').characterPrompt).not.toContain('sitting');
    const character = build('1girl', 'character-end');
    expect(character.characterPrompt).toBe('1girl, sitting');
    expect(character.prompt).not.toContain('sitting');
  });

  it('캐릭터 프롬프트가 비어 있으면 캐릭터 끝을 골라도 공통 포지티브 끝에 붙여', () => {
    const job = build('', 'character-end');
    expect(job.prompt).toContain('sitting');
    expect(job.characterPrompt).toBe('');
  });

  it('네거티브는 프롬프트와 같은 쪽 네거티브 뒤에 붙이고 작업에 따로 남겨', () => {
    const common = build('1girl', 'common-end', 'standing');
    expect(common.negativePrompt).toContain('standing');
    expect(common.characterNegativePrompt).toBe('');
    expect(common.emotionNegative).toBe('standing');
    const character = build('1girl', 'character-end', 'standing');
    expect(character.negativePrompt).not.toContain('standing');
    expect(character.characterNegativePrompt).toBe('standing');
    expect(build('1girl').emotionNegative).toBeUndefined();
  });
});

describe('자유 인페인팅 입력', () => {
  it('이미지를 64의 배수로 흰 여백을 넣어 저장하고 원래 영역을 알려 줘', async () => {
    const { root, library } = await openLibrary();
    const image = await sharp({
      create: { width: 300, height: 100, channels: 4, background: '#ff000080' },
    })
      .png()
      .toBuffer();
    const stored = await library.addSourceImage({ kind: 'data', dataUrl: pngUrl(image) });
    expect(stored).toMatchObject({
      width: 320,
      height: 128,
      outputRect: { x: 0, y: 0, width: 300, height: 100 },
    });
    expect(stored.file).toMatch(/^[0-9a-f]{24}\.png$/);
    // 같은 이미지는 같은 파일이 된다.
    expect((await library.addSourceImage({ kind: 'data', dataUrl: pngUrl(image) })).file).toBe(
      stored.file,
    );
    const file = await readFile(path.join(root, 'sources', stored.file));
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return [...data.subarray(offset, offset + 3)];
    };
    // 반투명한 빨강은 흰 바탕에 합쳐지고, 여백은 흰색이다.
    expect(pixel(10, 10)).toEqual([255, 127, 127]);
    expect(pixel(310, 120)).toEqual([255, 255, 255]);
  });

  it('마스크와 이미지를 작업 입력으로 복사하고, 빈 마스크나 크기가 다른 마스크는 막아', async () => {
    const { library } = await openLibrary();
    const image = await sharp({
      create: { width: 128, height: 64, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const stored = await library.addSourceImage({ kind: 'data', dataUrl: pngUrl(image) });
    const maskFile = await library.addSourceMask(pngUrl(await maskPng(128, 64, true)));
    const input = await library.prepareSourceInput({
      projectId: 'free',
      file: stored.file,
      maskFile,
    });
    expect(input.imagePath).toBe(`inputs/${input.imageSha256}.png`);
    expect(input.mask?.maskPath).toBe(`inputs/${input.mask?.maskSha256}.png`);
    await expect(
      readFile(library.resolveProject('free', input.mask!.maskPath)),
    ).resolves.toBeTruthy();
    const plain = await library.prepareSourceInput({ projectId: 'free', file: stored.file });
    expect(plain).toEqual({ imagePath: input.imagePath, imageSha256: input.imageSha256 });

    const blank = await library.addSourceMask(pngUrl(await maskPng(128, 64, false)));
    await expect(
      library.prepareSourceInput({ projectId: 'free', file: stored.file, maskFile: blank }),
    ).rejects.toThrow('비어 있습니다');
    const small = await library.addSourceMask(pngUrl(await maskPng(64, 64, true)));
    await expect(
      library.prepareSourceInput({ projectId: 'free', file: stored.file, maskFile: small }),
    ).rejects.toThrow('크기');

    await library.deleteSource(blank);
    await expect(readFile(library.sourceFile(blank))).rejects.toThrow();
  });
});

describe('자유 생성 디렉터 툴', () => {
  it('여백을 뺀 원래 영역만 잘라 정한 크기로 입력을 만들어', async () => {
    const { root, library } = await openLibrary();
    const image = await sharp({
      create: { width: 300, height: 100, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const stored = await library.addSourceImage({ kind: 'data', dataUrl: pngUrl(image) });
    const input = await library.prepareSourceInput({
      projectId: 'free',
      file: stored.file,
      crop: { rect: stored.outputRect, width: 150, height: 50 },
    });
    const meta = await sharp(
      await readFile(path.join(root, 'projects', 'free', input.imagePath)),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([150, 50]);
  });

  it('고른 이미지에 툴을 장수만큼 적용하고 프롬프트·seed는 비워 둬', () => {
    const image = { imagePath: `inputs/${'a'.repeat(64)}.png`, imageSha256: 'a'.repeat(64) };
    const jobs = buildFreeAugmentJobs({
      image,
      width: 517,
      height: 771,
      settings: { tool: 'emotion', mood: 'sad', toolPrompt: 'tears', defry: 2, count: 2 },
      sourceRecordId: 'rec-1',
    });
    expect(jobs.map((job) => job.variantIndex)).toEqual([1, 2]);
    expect(jobs[0]).toMatchObject({
      kind: 'augment',
      projectId: 'free',
      emotionId: '',
      prompt: '',
      seed: 0,
      canvasWidth: 517,
      canvasHeight: 771,
      mood: 'sad',
      toolPrompt: 'tears',
      defry: 2,
      sourceRecordId: 'rec-1',
    });
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
    const lineart = buildFreeAugmentJobs({
      image,
      width: 64,
      height: 64,
      settings: { tool: 'lineart', mood: 'happy', toolPrompt: '', defry: 0, count: 1 },
    });
    expect(lineart[0].mood).toBeUndefined();
  });

  it('디렉터 툴 모드와 설정을 읽고, 잘못된 설정은 버려', () => {
    const library = createDefaultLibrary();
    const parsed = librarySchema.parse({
      ...library,
      freeGeneration: {
        ...library.freeGeneration,
        mode: 'augment',
        augment: { tool: 'colorize', mood: 'happy', toolPrompt: 'red', defry: 1, count: 3 },
      },
    });
    expect(parsed.freeGeneration.mode).toBe('augment');
    expect(parsed.freeGeneration.augment?.tool).toBe('colorize');
    const broken = librarySchema.parse({
      ...library,
      freeGeneration: { ...library.freeGeneration, augment: { tool: 'nope' } },
    });
    expect(broken.freeGeneration.augment).toBeUndefined();
  });
});

describe('i2i 입력 맞추기', () => {
  it('목표 크기로 위쪽을 남기고 자르거나, 가운데에 두고 흰 여백을 넣어', async () => {
    const source = await sharp({
      create: { width: 300, height: 100, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    for (const fit of ['crop', 'pad'] as const) {
      const meta = await sharp(await fitImage(source, 256, 256, fit)).metadata();
      expect([meta.width, meta.height]).toEqual([256, 256]);
    }
    const { data, info } = await sharp(await fitImage(source, 256, 256, 'pad'))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
    const center = (128 * info.width + 128) * info.channels;
    expect([...data.subarray(center, center + 3)]).toEqual([255, 0, 0]);
  });
});

describe('없어진 i2i 방식', () => {
  it('i2i 방식 작업은 인페인트로 읽고, 옛 i2i 원본을 고른 자유 생성 i2i는 이미지 없는 i2i가 돼', () => {
    const library = createDefaultLibrary();
    const character = createCharacter('아리아');
    const project = {
      ...createProject('작업', {
        presetId: library.presets[0].id,
        character,
        emotionSetId: library.emotionSets[0].id,
        referenceId: 'r',
      }),
      mode: 'img2img',
      img2imgSourceId: 'old',
    };
    const parsed = librarySchema.parse({
      ...library,
      characters: [character],
      projects: [project],
      img2imgSources: [],
      freeGeneration: { ...library.freeGeneration, mode: 'img2img', sourceId: 'old' },
    });
    expect(parsed.projects[0].mode).toBe('reference');
    expect(parsed.projects[0]).not.toHaveProperty('img2imgSourceId');
    expect(parsed).not.toHaveProperty('img2imgSources');
    expect(parsed.freeGeneration).toMatchObject({ mode: 'img2img', inpaint: false });
    expect(parsed.freeGeneration.image).toBeUndefined();
  });

  it('잠시 있던 자유 인페인팅 모드는 i2i의 인페인팅으로 읽어', () => {
    const library = createDefaultLibrary();
    const image = {
      name: '결과',
      file: `${'c'.repeat(24)}.png`,
      width: 640,
      height: 960,
      outputRect: { x: 0, y: 0, width: 600, height: 900 },
    };
    for (const mode of ['inpaint', 'txt2img']) {
      const parsed = librarySchema.parse({
        ...library,
        freeGeneration: { ...library.freeGeneration, mode, inpaint: image },
      });
      expect(parsed.freeGeneration).toMatchObject({
        mode: mode === 'inpaint' ? 'img2img' : 'txt2img',
        image,
        inpaint: true,
      });
    }
  });
});
