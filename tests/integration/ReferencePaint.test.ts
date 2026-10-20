import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { Library } from '../../electron/services/Library';
import type { Reference } from '../../src/core/domain/types';
import { createReference } from '../../src/core/model/defaults';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function pngUrl(color: string): Promise<string> {
  const buffer = await sharp({ create: { width: 64, height: 64, channels: 4, background: color } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function withImage(reference: Reference, paintFile?: string): Reference {
  return {
    ...reference,
    image: {
      originalFile: 'original.png',
      canvasFile: 'canvas.png',
      maskFile: 'mask.png',
      originalName: 'a.png',
      canvasWidth: 64,
      canvasHeight: 64,
      referenceRect: { x: 0, y: 0, width: 32, height: 64 },
      outputRect: { x: 32, y: 0, width: 32, height: 64 },
      paintFile,
    },
  };
}

describe('인페인트 그리기 층', () => {
  it('저장하고 읽고, null이면 지우고, 파일이 없어도 나머지는 읽어', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'desk-'));
    temporary.push(root);
    const library = new Library(root);
    await library.load();
    const reference = createReference('그림');
    const paint = await pngUrl('#ff000080');
    const base = {
      originalDataUrl: await pngUrl('#ffffff'),
      canvasDataUrl: await pngUrl('#ffffff'),
      maskDataUrl: await pngUrl('#000000'),
    };
    await library.saveReferenceImages(reference.id, { ...base, paintDataUrl: paint });
    const saved = await library.readReferenceImages(withImage(reference, 'paint.png'));
    expect(saved?.paintDataUrl).toBe(paint);

    // undefined는 그대로 둔다.
    await library.saveReferenceImages(reference.id, base);
    expect(
      (await library.readReferenceImages(withImage(reference, 'paint.png')))?.paintDataUrl,
    ).toBe(paint);

    await library.saveReferenceImages(reference.id, { ...base, paintDataUrl: null });
    const paintPath = path.join(root, 'references', reference.id, 'paint.png');
    await expect(stat(paintPath)).rejects.toThrow();
    const missing = await library.readReferenceImages(withImage(reference, 'paint.png'));
    expect(missing?.canvasDataUrl).toBe(base.canvasDataUrl);
    expect(missing?.paintDataUrl).toBeUndefined();
  });
});
