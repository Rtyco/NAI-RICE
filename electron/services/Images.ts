import sharp from 'sharp';
import type { ExportFormat, Rect } from '../../src/core/domain/types';
import { copyTextChunks, makeITextChunk } from '../../src/core/metadata/PngChunks';

export function integerCrop(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(rect.y)));
  const right = Math.max(x + 1, Math.min(width, Math.round(rect.x + rect.width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.round(rect.y + rect.height)));
  return { x, y, width: right - x, height: bottom - y };
}

export async function imageSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('이미지 크기를 읽을 수 없습니다.');
  return { width: meta.width, height: meta.height };
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
  const extra = Object.entries(extraText).map(([key, value]) => makeITextChunk(key, value));
  let png: Buffer;
  try {
    png = Buffer.from(copyTextChunks(generated, cropped, extra));
  } catch {
    png = cropped;
  }
  return { png, crop, canvas };
}

export async function makeThumbnail(buffer: Buffer, size = 384): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

export async function convertImage(
  buffer: Buffer,
  format: ExportFormat,
  quality: number,
): Promise<Buffer> {
  // PNG는 메타데이터 보존을 위해 원본 바이트를 그대로 쓴다.
  if (format === 'png') return buffer;
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
