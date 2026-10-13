import sharp from 'sharp';
import type { ExportFormat, Rect, StorageFormat } from '../../src/core/domain/types';
import { DESK_METADATA_KEY } from '../../src/core/metadata/NaiMetadata';
import {
  copyTextChunks,
  insertPngChunks,
  isPng,
  makeITextChunk,
  makeTextChunk,
  readPngText,
} from '../../src/core/metadata/PngChunks';
import { isWebp, readImageText, textToXmp } from '../../src/core/metadata/WebpMetadata';

export function integerCrop(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(rect.y)));
  const right = Math.max(x + 1, Math.min(width, Math.round(rect.x + rect.width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.round(rect.y + rect.height)));
  return { x, y, width: right - x, height: bottom - y };
}

/** 웹 스트리밍은 `image_format: "webp"`로 받아 최종 그림이 PNG가 아닐 수 있다. 바꾸면 원본 NovelAI 메타데이터는 남지 않는다. */
export async function ensurePng(buffer: Buffer): Promise<Buffer> {
  return isPng(buffer) ? buffer : sharp(buffer).png().toBuffer();
}

export async function imageSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('이미지 크기를 읽을 수 없습니다.');
  return { width: meta.width, height: meta.height };
}

/** 128 이상(화면의 마스크 해석과 같다) */
export async function maskHasGeneratePixels(png: Buffer): Promise<boolean> {
  const red = await sharp(png).extractChannel(0).raw().toBuffer();
  return red.some((value) => value >= 128);
}

function textChunks(extraText: Record<string, string>): Uint8Array[] {
  return Object.entries(extraText).map(([key, value]) => makeITextChunk(key, value));
}

/** NovelAI 텍스트 청크와 앱 메타데이터를 남겨 결과를 다시 끌어 놓으면 설정을 불러올 수 있다. */
export async function cropWithMetadata(
  generated: Buffer,
  rect: Rect,
  extraText: Record<string, string>,
): Promise<{ png: Buffer; crop: Rect; canvas: { width: number; height: number } }> {
  const canvas = await imageSize(generated);
  const crop = integerCrop(rect, canvas.width, canvas.height);
  const cropped = await sharp(generated)
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .png()
    .toBuffer();
  const extra = textChunks(extraText);
  let png: Buffer;
  try {
    png = Buffer.from(copyTextChunks(generated, cropped, extra));
  } catch {
    png = cropped;
  }
  return { png, crop, canvas };
}

/** 다시 인코딩하지 않는다. */
export async function withMetadata(
  generated: Buffer,
  extraText: Record<string, string>,
): Promise<{ png: Buffer; width: number; height: number }> {
  const size = await imageSize(generated);
  return { png: Buffer.from(insertPngChunks(generated, textChunks(extraText))), ...size };
}

/** 투명한 곳은 흰색으로 채운다. 0단계는 불투명 입력만 확인했다. */
export async function fitImage(
  buffer: Buffer,
  width: number,
  height: number,
  fit: 'crop' | 'pad',
): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width,
      height,
      fit: fit === 'crop' ? 'cover' : 'contain',
      position: fit === 'crop' ? 'north' : 'centre',
      background: '#ffffff',
    })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
}

/** NovelAI 웹의 캔버스(1024×1536, 1536×1024, 1472×1472) 중 비율이 가장 가까운 것에 검은 여백으로 맞춘다(0단계 확인). */
export async function fitCharacterReference(buffer: Buffer): Promise<Buffer> {
  const rotated = await sharp(buffer).rotate().png().toBuffer();
  const { width, height } = await imageSize(rotated);
  const canvases: Array<[number, number]> = [
    [1024, 1536],
    [1536, 1024],
    [1472, 1472],
  ];
  const ratio = width / height;
  const [canvasWidth, canvasHeight] = canvases.reduce((best, canvas) =>
    Math.abs(Math.log(canvas[0] / canvas[1] / ratio)) <
    Math.abs(Math.log(best[0] / best[1] / ratio))
      ? canvas
      : best,
  );
  return sharp(rotated)
    .resize(canvasWidth, canvasHeight, { fit: 'contain', background: '#000000' })
    .flatten({ background: '#000000' })
    .png()
    .toBuffer();
}

/** NovelAI는 64 배수 크기만 받는다. 원래 이미지는 왼쪽 위에 그대로 남는다. */
export async function padToMultiple(
  buffer: Buffer,
  unit = 64,
): Promise<{ png: Buffer; width: number; height: number; content: Rect }> {
  const rotated = await sharp(buffer).rotate().png().toBuffer();
  const { width, height } = await imageSize(rotated);
  const padded = (side: number) => Math.ceil(side / unit) * unit;
  const png = await sharp(rotated)
    .extend({
      right: padded(width) - width,
      bottom: padded(height) - height,
      background: '#ffffff',
    })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  return {
    png,
    width: padded(width),
    height: padded(height),
    content: { x: 0, y: 0, width, height },
  };
}

export async function makeThumbnail(buffer: Buffer, size = 384): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

/** WebP는 무손실(투명 픽셀의 색까지)이고 텍스트는 XMP로 옮긴다. */
export async function encodeForStorage(
  png: Buffer,
  format: StorageFormat,
): Promise<{ buffer: Buffer; extension: '.png' | '.webp' }> {
  if (format === 'png') return { buffer: png, extension: '.png' };
  const buffer = await sharp(png)
    .webp({ lossless: true, exact: true, effort: 4 })
    .withXmp(textToXmp(readPngText(png)))
    .toBuffer();
  return { buffer, extension: '.webp' };
}

export async function toPngWithText(buffer: Buffer): Promise<Buffer> {
  if (isPng(buffer) || !isWebp(buffer)) return buffer;
  const png = await sharp(buffer).png().toBuffer();
  const chunks = Object.entries(readImageText(buffer)).map(([key, text]) =>
    key === DESK_METADATA_KEY ? makeITextChunk(key, text) : makeTextChunk(key, text),
  );
  return Buffer.from(insertPngChunks(png, chunks));
}

export async function convertImage(
  buffer: Buffer,
  format: ExportFormat,
  quality: number,
): Promise<Buffer> {
  // 메타데이터 보존을 위해 원본 바이트를 쓴다.
  if (format === 'png') return toPngWithText(buffer);
  const pipeline = sharp(buffer);
  if (format === 'webp') return pipeline.webp({ quality }).toBuffer();
  return pipeline.avif({ quality }).toBuffer();
}

export function formatFromExtension(filePath: string): ExportFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.avif')) return 'avif';
  return 'png';
}
