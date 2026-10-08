import type { BackgroundDetection, PixelBuffer } from '../../core/imaging/BackgroundDetector';
import { detectBackground } from '../../core/imaging/BackgroundDetector';
import { normalizeCanvasSize } from '../../core/imaging/CanvasNormalizer';
import { computeLayout, layoutBackgroundMask } from '../../core/imaging/CanvasLayout';
import type { CanvasLayout, Rect } from '../../core/domain/types';

export type PreparedImage = {
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  canvasDataUrl: string;
  backgroundMask: Uint8Array;
  detection: BackgroundDetection;
};

export function loadHtmlImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('이미지를 디코딩할 수 없습니다. PNG 또는 JPEG 파일인지 확인하십시오.'));
    image.src = source;
  });
}

function canvas2d(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D 캔버스를 만들 수 없습니다.');
  return { canvas, context };
}

export async function prepareImage(dataUrl: string, threshold = 16): Promise<PreparedImage> {
  const image = await loadHtmlImage(dataUrl);
  const original = canvas2d(image.naturalWidth, image.naturalHeight);
  original.context.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
  original.context.drawImage(image, 0, 0);
  const originalPixels = original.context.getImageData(
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
  );
  const detection = detectBackground(originalPixels as PixelBuffer, threshold);
  const normalized = normalizeCanvasSize(image.naturalWidth, image.naturalHeight, 64);
  const work = canvas2d(normalized.width, normalized.height);
  work.context.fillStyle = '#ffffff';
  work.context.fillRect(0, 0, normalized.width, normalized.height);
  work.context.drawImage(image, 0, 0);
  const backgroundMask = new Uint8Array(normalized.width * normalized.height);
  for (let y = 0; y < normalized.height; y += 1) {
    for (let x = 0; x < normalized.width; x += 1) {
      const target = y * normalized.width + x;
      backgroundMask[target] =
        x < image.naturalWidth && y < image.naturalHeight
          ? detection.backgroundMask[y * image.naturalWidth + x]
          : 1;
    }
  }
  return {
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
    width: normalized.width,
    height: normalized.height,
    canvasDataUrl: work.canvas.toDataURL('image/png'),
    backgroundMask,
    detection,
  };
}

export async function decodeMask(
  dataUrl: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const image = await loadHtmlImage(dataUrl);
  if (image.naturalWidth !== width || image.naturalHeight !== height) {
    throw new Error(
      `마스크 크기가 이미지와 다릅니다. 이미지 ${width}×${height}, 마스크 ${image.naturalWidth}×${image.naturalHeight}`,
    );
  }
  const { context } = canvas2d(width, height);
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    mask[pixel] = pixels[pixel * 4] >= 128 ? 1 : 0;
  }
  return mask;
}

export function maskToDataUrl(mask: Uint8Array, width: number, height: number): string {
  if (mask.length !== width * height) throw new Error('마스크 크기가 캔버스와 다릅니다.');
  const { canvas, context } = canvas2d(width, height);
  const image = context.createImageData(width, height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const value = mask[pixel] ? 255 : 0;
    image.data[pixel * 4] = value;
    image.data[pixel * 4 + 1] = value;
    image.data[pixel * 4 + 2] = value;
    image.data[pixel * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export type ComposedCanvas = {
  width: number;
  height: number;
  canvasDataUrl: string;
  backgroundMask: Uint8Array;
  referenceRect: Rect;
  outputRect: Rect;
};

/** 캐릭터 이미지 한 장으로 레퍼런스 + 생성 여백 캔버스를 만든다. */
export async function composeCanvas(originalDataUrl: string, layout: CanvasLayout): Promise<ComposedCanvas> {
  const image = await loadHtmlImage(originalDataUrl);
  const composed = computeLayout(layout, image.naturalWidth, image.naturalHeight);
  const { canvas, context } = canvas2d(composed.width, composed.height);
  context.fillStyle = layout.background || '#ffffff';
  context.fillRect(0, 0, composed.width, composed.height);
  context.save();
  const area = composed.referenceArea;
  context.beginPath();
  context.rect(area.x, area.y, area.width, area.height);
  context.clip();
  context.imageSmoothingQuality = 'high';
  const place = composed.imagePlacement;
  context.drawImage(image, place.x, place.y, place.width, place.height);
  context.restore();
  return {
    width: composed.width,
    height: composed.height,
    canvasDataUrl: canvas.toDataURL('image/png'),
    backgroundMask: layoutBackgroundMask(composed),
    referenceRect: composed.referenceArea,
    outputRect: composed.generationArea,
  };
}

/** 저장된 자동 구성 캔버스를 다시 열 때 배경 마스크만 복원한다. */
export function layoutMaskFor(layout: CanvasLayout): Uint8Array {
  return layoutBackgroundMask(computeLayout(layout, 1, 1));
}

export function imageSizeOf(dataUrl: string): Promise<{ width: number; height: number }> {
  return loadHtmlImage(dataUrl).then((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
}

/** 드롭한 이미지의 픽셀을 읽는다(stealth 메타데이터용). */
export async function decodePixels(blob: Blob): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const { context } = canvas2d(bitmap.width, bitmap.height);
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();
  return { data, width: bitmap.width, height: bitmap.height };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(blob);
  });
}

export function masksEqual(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}
