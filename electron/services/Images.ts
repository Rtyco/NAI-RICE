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

/**
 * 결과 저장은 PNG 텍스트 청크를 쓴다. 스트리밍의 최종 그림이 PNG가 아니면(웹은 `image_format: "webp"`로 받는다)
 * PNG로 바꾼다. 이때 원본의 NovelAI 메타데이터는 남지 않는다.
 */
export async function ensurePng(buffer: Buffer): Promise<Buffer> {
  return isPng(buffer) ? buffer : sharp(buffer).png().toBuffer();
}

export async function imageSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('이미지 크기를 읽을 수 없습니다.');
  return { width: meta.width, height: meta.height };
}

/** 마스크 PNG에 생성할 픽셀(흰색, 화면의 마스크 해석과 같은 128 이상)이 하나라도 있는지. */
export async function maskHasGeneratePixels(png: Buffer): Promise<boolean> {
  const red = await sharp(png).extractChannel(0).raw().toBuffer();
  return red.some((value) => value >= 128);
}

function textChunks(extraText: Record<string, string>): Uint8Array[] {
  return Object.entries(extraText).map(([key, value]) => makeITextChunk(key, value));
}

/**
 * 생성 캔버스에서 결과 영역만 잘라 PNG로 만든다. 원본 응답의 NovelAI 텍스트 청크와
 * 이 앱의 보조 메타데이터를 함께 기록해, 결과물을 다시 드래그해 설정을 불러올 수 있게 한다.
 */
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

/** 받은 PNG는 다시 인코딩하지 않고 이 앱의 보조 메타데이터만 더한다. 자르지 않는 결과에 쓴다. */
export async function withMetadata(
  generated: Buffer,
  extraText: Record<string, string>,
): Promise<{ png: Buffer; width: number; height: number }> {
  const size = await imageSize(generated);
  return { png: Buffer.from(insertPngChunks(generated, textChunks(extraText))), ...size };
}

/**
 * i2i 입력을 목표 크기로 맞춘다. 투명한 부분은 흰색으로 채운다. 불투명 입력만 보내 본 0단계 결과와 같게 하고,
 * 투명 입력에서 NovelAI가 어떻게 동작할지 모르는 경우를 피한다.
 */
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

/**
 * NovelAI는 64의 배수 크기만 받으므로 오른쪽·아래에 흰 여백을 넣어 맞춘다. 늘이거나 자르지 않아 원래 이미지는
 * 왼쪽 위에 그대로 남는다. 투명한 부분은 fitImage처럼 흰색으로 채운다.
 */
/**
 * 캐릭터 레퍼런스 그림을 NovelAI 웹이 쓰는 캔버스(세로 1024×1536, 가로 1536×1024, 정사각 1472×1472) 중 비율이
 * 가장 가까운 것에 검은 여백으로 맞춘다. 0단계에서 1024×1536에 검은 여백을 넣은 그림이 받아들여졌다.
 */
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

/** 저장 형식에 맞춰 바꾼다. WebP는 픽셀을 그대로 두고(무손실, 투명 픽셀의 색까지) 텍스트를 XMP로 옮긴다. */
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

/** WebP로 저장한 결과를 텍스트 청크가 있는 PNG로 되돌린다. PNG면 그대로 돌려준다. */
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
  // PNG는 메타데이터 보존을 위해 원본 바이트를 그대로 쓴다.
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
