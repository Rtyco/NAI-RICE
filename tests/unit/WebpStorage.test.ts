import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { convertImage, encodeForStorage, toPngWithText } from '../../electron/services/Images';
import { readImageMetadata } from '../../src/core/metadata/NaiMetadata';
import {
  insertPngChunks,
  makeITextChunk,
  makeTextChunk,
  readPngText,
} from '../../src/core/metadata/PngChunks';
import { isWebp, readImageText } from '../../src/core/metadata/WebpMetadata';

async function sourcePng(): Promise<Buffer> {
  // NovelAI 결과처럼 알파가 254·255로 섞인 이미지. 알파의 최하위 비트에 stealth 메타데이터가 들어간다.
  const raw = Buffer.alloc(16 * 16 * 4);
  for (let index = 0; index < 16 * 16; index += 1) {
    raw.set([index % 256, (index * 7) % 256, (index * 13) % 256, index % 3 ? 255 : 254], index * 4);
  }
  const png = await sharp(raw, { raw: { width: 16, height: 16, channels: 4 } })
    .png()
    .toBuffer();
  const comment = JSON.stringify({ prompt: '1girl, 웃음', seed: 42, uc: 'lowres' });
  return Buffer.from(
    insertPngChunks(png, [
      makeTextChunk('Software', 'NovelAI'),
      makeTextChunk('Comment', comment),
      makeITextChunk('reference-inpaint-desk', '{"app":"reference-inpaint-desk"}'),
    ]),
  );
}

describe('WebP 무손실 저장', () => {
  it('픽셀(알파 포함)은 똑같고 텍스트 메타데이터는 XMP로 옮겨져', async () => {
    const png = await sourcePng();
    const { buffer, extension } = await encodeForStorage(png, 'webp-lossless');
    expect(extension).toBe('.webp');
    expect(isWebp(buffer)).toBe(true);
    const pixels = async (image: Buffer) => sharp(image).ensureAlpha().raw().toBuffer();
    expect((await pixels(buffer)).equals(await pixels(png))).toBe(true);
    expect(readImageText(buffer)).toEqual(readPngText(png));
  });

  it('PNG로 되돌리면 텍스트 청크가 다시 생기고, 앱의 불러오기도 WebP를 읽어', async () => {
    const png = await sourcePng();
    const { buffer } = await encodeForStorage(png, 'webp-lossless');
    const restored = await toPngWithText(buffer);
    expect(readPngText(restored)).toEqual(readPngText(png));
    expect(await convertImage(buffer, 'png', 90)).toEqual(restored);
    expect(await toPngWithText(png)).toBe(png);
    expect(await readImageMetadata(buffer)).toEqual(await readImageMetadata(png));
  });

  it('PNG 형식을 고르면 그대로 저장해', async () => {
    const png = await sourcePng();
    expect(await encodeForStorage(png, 'png')).toEqual({ buffer: png, extension: '.png' });
  });
});
