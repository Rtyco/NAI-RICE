import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { fitImage } from '../../electron/services/Images';
import { Library } from '../../electron/services/Library';
import { buildFreeJobs } from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createDefaultLibrary,
  createPreset,
  createProject,
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

describe('자유 인페인팅 작업', () => {
  it('이미지 크기의 캔버스로 인페인트하고 reference inset은 붙이지 않아', () => {
    const preset = createPreset('P', { commonPositive: 'masterpiece', commonNegative: '' });
    preset.generation = { ...preset.generation, referenceInset: true };
    const input = {
      imagePath: `inputs/${'a'.repeat(64)}.png`,
      maskPath: `inputs/${'b'.repeat(64)}.png`,
      imageSha256: 'a'.repeat(64),
      maskSha256: 'b'.repeat(64),
    };
    const outputRect = { x: 0, y: 0, width: 600, height: 900 };
    const jobs = buildFreeJobs({
      preset,
      prompt: 'smile',
      count: 2,
      inpaint: { input, width: 640, height: 960, outputRect, sourceRecordId: 'rec-1' },
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
      ...input,
    });
    expect(jobs[0].prompt).toBe('masterpiece, smile');
    expect(generationEnqueueRequestSchema.safeParse({ jobs }).success).toBe(true);
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
    const input = await library.prepareSourceInpaint({
      projectId: 'free',
      file: stored.file,
      maskFile,
    });
    expect(input.imagePath).toBe(`inputs/${input.imageSha256}.png`);
    expect(input.maskPath).toBe(`inputs/${input.maskSha256}.png`);
    await expect(readFile(library.resolveProject('free', input.maskPath))).resolves.toBeTruthy();

    const blank = await library.addSourceMask(pngUrl(await maskPng(128, 64, false)));
    await expect(
      library.prepareSourceInpaint({ projectId: 'free', file: stored.file, maskFile: blank }),
    ).rejects.toThrow('비어 있습니다');
    const small = await library.addSourceMask(pngUrl(await maskPng(64, 64, true)));
    await expect(
      library.prepareSourceInpaint({ projectId: 'free', file: stored.file, maskFile: small }),
    ).rejects.toThrow('크기');

    await library.deleteSource(blank);
    await expect(readFile(library.sourceFile(blank))).rejects.toThrow();
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
  it('i2i 방식 작업은 인페인트로, 자유 생성 i2i는 일반 생성으로 읽어', () => {
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
    expect(parsed.freeGeneration.mode).toBe('txt2img');
  });
});
