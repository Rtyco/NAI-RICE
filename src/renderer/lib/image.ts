import type { BackgroundDetection } from '../../core/imaging/BackgroundDetector';
import { detectBackground } from '../../core/imaging/BackgroundDetector';
import { normalizeCanvasSize } from '../../core/imaging/CanvasNormalizer';
import { computeLayout, imageBoxOf, layoutBackgroundMask } from '../../core/imaging/CanvasLayout';
import type { ImageBox } from '../../core/imaging/FreeTransform';
import type { CanvasLayout, Rect } from '../../core/domain/types';

export type PreparedImage = {
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  backgroundMask: Uint8Array;
  detection: BackgroundDetection;
};

/** 편집 중에는 PNG로 바꾸지 않는다. 인코딩(1216×832에서 약 30ms)·디코딩이 슬라이더를 움직일 때마다 끼면 끊긴다. */
export type CanvasImage = HTMLCanvasElement | HTMLImageElement;

export function canvasImageToDataUrl(image: CanvasImage): string {
  return image instanceof HTMLCanvasElement ? image.toDataURL('image/png') : image.src;
}

export function loadHtmlImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('이미지를 디코딩할 수 없습니다. PNG 또는 JPEG 파일인지 확인하십시오.'));
    image.src = source;
  });
}

/** willReadFrequently면 Chromium이 CPU로 그리고, 화면에 그릴 때마다 GPU로 다시 올려 끌기가 버벅인다. 픽셀을 읽을 캔버스에만 켠다. */
export function canvas2d(
  width: number,
  height: number,
  willReadFrequently = true,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently });
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
  const detection = detectBackground(originalPixels, threshold);
  const normalized = normalizeCanvasSize(image.naturalWidth, image.naturalHeight, 64);
  const work = canvas2d(normalized.width, normalized.height, false);
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
    canvas: work.canvas,
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
  canvas: HTMLCanvasElement;
  backgroundMask: Uint8Array;
  referenceRect: Rect;
  outputRect: Rect;
};

// 슬라이더를 움직이는 동안 같은 원본을 다시 디코딩하지 않는다.
let lastOriginal: { dataUrl: string; image: Promise<HTMLImageElement> } | undefined;

export function loadOriginal(originalDataUrl: string): Promise<HTMLImageElement> {
  if (lastOriginal?.dataUrl !== originalDataUrl) {
    lastOriginal = { dataUrl: originalDataUrl, image: loadHtmlImage(originalDataUrl) };
    lastOriginal.image.catch(() => (lastOriginal = undefined));
  }
  return lastOriginal.image;
}

function paintLayout(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  layout: CanvasLayout,
  composed: ReturnType<typeof computeLayout>,
): void {
  context.fillStyle = layout.background || '#ffffff';
  context.fillRect(0, 0, composed.width, composed.height);
  context.save();
  const area = composed.referenceArea;
  context.beginPath();
  context.rect(area.x, area.y, area.width, area.height);
  context.clip();
  context.imageSmoothingQuality = 'high';
  drawImageBox(context, image, imageBoxOf(composed));
  context.restore();
}

export function drawImageBox(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  box: ImageBox,
): void {
  context.save();
  context.translate(box.cx, box.cy);
  context.rotate((box.rotation * Math.PI) / 180);
  if (box.flipX) context.scale(-1, 1);
  context.drawImage(image, -box.width / 2, -box.height / 2, box.width, box.height);
  context.restore();
}

export async function composeCanvas(
  originalDataUrl: string,
  layout: CanvasLayout,
): Promise<ComposedCanvas> {
  const image = await loadOriginal(originalDataUrl);
  const composed = computeLayout(layout, image.naturalWidth, image.naturalHeight);
  const { canvas, context } = canvas2d(composed.width, composed.height, false);
  paintLayout(context, image, layout, composed);
  return {
    width: composed.width,
    height: composed.height,
    canvas,
    backgroundMask: layoutBackgroundMask(composed),
    referenceRect: composed.referenceArea,
    outputRect: composed.generationArea,
  };
}

/** 영역이 그대로인 변경(배경색)용. 새 캔버스를 만들면 편집기가 마스크를 다시 계산하고 수동 보정을 초기화해 버벅인다. */
export async function repaintComposed(
  canvas: HTMLCanvasElement,
  originalDataUrl: string,
  layout: CanvasLayout,
): Promise<void> {
  const image = await loadOriginal(originalDataUrl);
  const composed = computeLayout(layout, image.naturalWidth, image.naturalHeight);
  if (composed.width !== canvas.width || composed.height !== canvas.height)
    throw new Error('캔버스 크기가 구성과 다릅니다.');
  paintLayout(canvas.getContext('2d')!, image, layout, composed);
}

/** `repaintComposed`는 캔버스에만 다시 칠할 수 있다. */
export async function loadCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const image = await loadHtmlImage(dataUrl);
  const { canvas, context } = canvas2d(image.naturalWidth, image.naturalHeight, false);
  context.drawImage(image, 0, 0);
  return canvas;
}

/** 화면에 그리는 캔버스는 GPU에 있어 읽기용 사본에서 읽는다. */
export function isBlank(canvas: HTMLCanvasElement): boolean {
  const { context } = canvas2d(canvas.width, canvas.height);
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha]) return false;
  return true;
}

export type CanvasLayers = {
  paint?: CanvasImageSource;
  divider?: { pixels: Uint8Array; color: string };
};

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

/** `ImageData`를 `Uint32Array`로 쓸 때의 픽셀 값. 리틀 엔디언이라 ABGR 순서다. */
export function packedColor([red, green, blue]: [number, number, number], alpha = 255): number {
  return ((alpha << 24) | (blue << 16) | (green << 8) | red) >>> 0;
}

export function fillRegion(pixels: Uint32Array, region: Uint8Array, color: number): void {
  for (let pixel = 0; pixel < region.length; pixel += 1) if (region[pixel]) pixels[pixel] = color;
}

/** 안쪽에 둔 선도 보이게 생성 영역 색보다 위에 칠한다. */
export function paintMask(
  pixels: Uint32Array,
  mask: Uint8Array,
  color: number,
  divider?: { pixels: Uint8Array; color: number },
): void {
  if (!divider) {
    fillRegion(pixels, mask, color);
    return;
  }
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (divider.pixels[pixel]) pixels[pixel] = divider.color;
    else if (mask[pixel]) pixels[pixel] = color;
  }
}

/** NovelAI에 보내는 canvas.png. 편집기는 층을 합치지 않은 base를 따로 둔다. */
export function finalCanvasDataUrl(
  base: CanvasImage,
  width: number,
  height: number,
  layers: CanvasLayers,
): string {
  if (!layers.paint && !layers.divider) return canvasImageToDataUrl(base);
  const { canvas, context } = canvas2d(width, height, false);
  context.drawImage(base, 0, 0, width, height);
  if (layers.paint) context.drawImage(layers.paint, 0, 0, width, height);
  if (layers.divider) {
    const line = canvas2d(width, height, false);
    const image = line.context.createImageData(width, height);
    const pixels = new Uint32Array(image.data.buffer);
    const color = packedColor(hexToRgb(layers.divider.color));
    layers.divider.pixels.forEach((value, pixel) => {
      if (value) pixels[pixel] = color;
    });
    line.context.putImageData(image, 0, 0);
    context.drawImage(line.canvas, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

export function layoutMaskFor(layout: CanvasLayout): Uint8Array {
  return layoutBackgroundMask(computeLayout(layout, 1, 1));
}

export function imageSizeOf(dataUrl: string): Promise<{ width: number; height: number }> {
  return loadHtmlImage(dataUrl).then((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
}

/** stealth 메타데이터용 */
export async function decodePixels(
  blob: Blob,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
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
