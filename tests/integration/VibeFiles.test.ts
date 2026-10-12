import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { Library } from '../../electron/services/Library';
import { VibeFiles } from '../../electron/services/VibeFiles';
import type { FileDialogs } from '../../electron/services/ports';
import { embeddedVibeFile, interpretMetadata } from '../../src/core/metadata/NaiMetadata';
import {
  parseVibeCacheName,
  vibeCacheKey,
  vibeCacheName,
} from '../../src/core/providers/NovelAIRequestBuilder';
import {
  buildVibeBundle,
  documentEncodings,
  metadataVibes,
  parseVibeFile,
} from '../../src/core/vibes/VibeFile';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const ENCODING = Buffer.from('ENCODED-VIBE').toString('base64');

async function png(): Promise<string> {
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 120, b: 90 } },
  })
    .png()
    .toBuffer();
  return buffer.toString('base64');
}

async function setup(savePath?: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desk-vibe-'));
  temporary.push(root);
  const library = new Library(root);
  await library.load();
  const dialog = {
    showSaveDialog: async () => ({
      canceled: !savePath,
      filePath: savePath && path.join(root, savePath),
    }),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  } as unknown as FileDialogs;
  return { root, library, vibes: new VibeFiles(library, dialog) };
}

/** NovelAI 웹이 내려받는 `.naiv4vibe`(그림 + V4.5 Full 인코딩). */
function webVibe(image: string) {
  return {
    identifier: 'novelai-vibe-transfer',
    version: 1,
    type: 'image',
    image,
    id: sha(image),
    encodings: {
      'v4-5full': {
        [sha('information_extracted:0.7')]: {
          encoding: ENCODING,
          params: { information_extracted: 0.7 },
        },
      },
      v5full: { unknown: { encoding: 'IGNORED' } },
    },
    name: '노을',
    thumbnail: 'data:image/jpeg;base64,AAAA',
    createdAt: 1_760_000_000_000,
    importInfo: { model: 'nai-diffusion-4-5-full', information_extracted: 0.7, strength: 0.45 },
  };
}

describe('NovelAI 바이브 파일', () => {
  it('파일·묶음을 읽고 아는 모델의 인코딩만 꺼내', async () => {
    const image = await png();
    const [single] = parseVibeFile(JSON.stringify(webVibe(image)));
    expect(documentEncodings(single)).toEqual([
      { model: 'nai-diffusion-4-5-full', informationExtracted: 0.7, encoding: ENCODING },
    ]);
    const bundle = buildVibeBundle([single, { ...single, name: '비' }]);
    expect(parseVibeFile(JSON.stringify(bundle)).map((item) => item.name)).toEqual(['노을', '비']);
    expect(() => parseVibeFile('{"identifier":"other"}')).toThrow('바이브');
    expect(() => parseVibeFile('not json')).toThrow('바이브');
  });

  it('인코딩 이름을 다시 풀어', () => {
    const name = vibeCacheName('a'.repeat(64), 'nai-diffusion-4-5-full', 0.7);
    expect(name).toBe(
      vibeCacheKey('a'.repeat(64), { model: 'nai-diffusion-4-5-full-inpainting' }, 0.7),
    );
    expect(parseVibeCacheName(name, 'a'.repeat(64))).toEqual({
      model: 'nai-diffusion-4-5-full',
      informationExtracted: 0.7,
    });
    expect(parseVibeCacheName(name, 'b'.repeat(64))).toBeUndefined();
  });

  it('그림 바이브는 그림을 저장하고, 큐가 찾는 이름으로 인코딩을 넣어 둬', async () => {
    const { library, vibes } = await setup();
    const image = await png();
    const [imported] = await vibes.importText(JSON.stringify(webVibe(image)), 'file');
    expect(imported).toMatchObject({ name: '노을', strength: 0.45, informationExtracted: 0.7 });
    expect(imported.encodingId).toBeUndefined();
    const owner = createHash('sha256')
      .update(await library.readPicture(imported.picture.file))
      .digest('hex');
    const key = vibeCacheKey(owner, { model: 'nai-diffusion-4-5-full-inpainting' }, 0.7);
    expect((await library.readVibe(key))?.toString()).toBe('ENCODED-VIBE');
    expect(await vibes.encodings({ image: { ...imported.picture, name: 'x' } })).toEqual([
      { model: 'nai-diffusion-4-5-full', informationExtracted: 0.7 },
    ]);
  });

  it('인코딩만 있는 바이브는 encodingId로 저장하고 보기용 그림을 만들어', async () => {
    const { library, vibes } = await setup();
    const document = {
      identifier: 'novelai-vibe-transfer',
      version: 1,
      type: 'encoding',
      id: sha(ENCODING),
      encodings: { 'v4-5curated': { unknown: { encoding: ENCODING } } },
      createdAt: 1,
      importInfo: { model: 'nai-diffusion-4-5-curated', information_extracted: 0.5, strength: 0.3 },
    };
    const [imported] = await vibes.importText(
      JSON.stringify({ identifier: 'novelai-vibe-transfer-bundle', version: 1, vibes: [document] }),
      '묶음',
    );
    expect(imported).toMatchObject({
      name: '묶음',
      encodingId: sha(ENCODING),
      informationExtracted: 0.5,
      strength: 0.3,
    });
    expect(imported.picture.width).toBe(256);
    const key = vibeCacheKey(sha(ENCODING), { model: 'nai-diffusion-4-5-curated-inpainting' }, 0.5);
    expect(await library.readVibe(key)).toBeDefined();
  });

  it('내보낸 파일을 다시 가져오면 같은 인코딩을 써', async () => {
    const { root, vibes } = await setup('out.naiv4vibe');
    const image = await png();
    const [imported] = await vibes.importText(JSON.stringify(webVibe(image)), 'file');
    const vibe = {
      id: 'v',
      name: '노을',
      image: { ...imported.picture, name: 'a.png' },
      strength: 0.45,
      informationExtracted: 0.7,
      updatedAt: '',
    };
    const saved = await vibes.export([vibe]);
    expect(saved).toBe(path.join(root, 'out.naiv4vibe'));
    const text = await readFile(saved!, 'utf8');
    const [document] = parseVibeFile(text);
    expect(document).toMatchObject({ type: 'image', name: '노을', id: sha(document.image!) });
    expect(document.thumbnail).toMatch(/^data:image\/jpeg;base64,/);
    expect(document.encodings['v4-5full'][sha('information_extracted:0.7')]).toEqual({
      encoding: ENCODING,
      params: { information_extracted: 0.7 },
    });
    expect(document.importInfo).toMatchObject({ strength: 0.45, information_extracted: 0.7 });
  });

  it('NovelAI 이미지의 생성 정보와 naidata 청크에서 바이브를 찾아', async () => {
    const image = await png();
    const comment = {
      prompt: 'a',
      reference_image_multiple: [ENCODING, image],
      reference_strength_multiple: [0.4, 0.2],
      reference_information_extracted_multiple: [0.9, 1],
    };
    expect(metadataVibes(comment)).toEqual([
      { encoding: ENCODING, strength: 0.4, informationExtracted: 0.9 },
      { image, strength: 0.2, informationExtracted: 1 },
    ]);
    const file = JSON.stringify(webVibe(image));
    const naidata = Buffer.from(file).toString('base64');
    expect(embeddedVibeFile({ naidata })).toBe(file);
    expect(embeddedVibeFile({ naidata: Buffer.from('{}').toString('base64') })).toBeUndefined();
    const data = interpretMetadata({ Comment: JSON.stringify(comment), naidata });
    expect(data?.vibes).toHaveLength(2);
    expect(data?.vibeFile).toBe(file);

    const { vibes } = await setup();
    const imported = await vibes.importMetadata({
      model: 'nai-diffusion-4-5-full',
      name: '그림 바이브',
      vibes: metadataVibes(comment),
    });
    expect(imported.map((item) => [item.name, Boolean(item.encodingId)])).toEqual([
      ['그림 바이브 1', true],
      ['그림 바이브 2', false],
    ]);
  });
});
