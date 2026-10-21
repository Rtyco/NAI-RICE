import type { CanvasLayout, FreePlacement, Rect, ResolutionPresetId } from '../domain/types';
import { FREE_MAX_PIXELS } from '../providers/NaiCost';
import type { ImageBox } from './FreeTransform';

export const RESOLUTION_PRESETS: Array<{
  id: Exclude<ResolutionPresetId, 'custom'>;
  label: string;
  width: number;
  height: number;
}> = [
  { id: '1216x832', label: '가로 1216×832', width: 1216, height: 832 },
  { id: '832x1216', label: '세로 832×1216', width: 832, height: 1216 },
  { id: '1024x1024', label: '정사각 1024×1024', width: 1024, height: 1024 },
];

export const CUSTOM_MIN = 256;
export const CUSTOM_MAX = 2048;

/** NovelAI는 64 배수만 받는다. */
export function snapDimension(value: number): number {
  const snapped = Math.round(value / 64) * 64;
  return Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, snapped || CUSTOM_MIN));
}

/** 원본 비율을 지키는 Opus 무료 최대 크기. 비율 오차와 넓이 손실(둘 다 log)을 같은 무게로 잰다. */
export function freeSizeForRatio(width: number, height: number): { width: number; height: number } {
  const ratio = width / height;
  let best = { width: 1024, height: 1024 };
  let bestScore = Infinity;
  for (let w = CUSTOM_MIN; w <= CUSTOM_MAX; w += 64) {
    const h = Math.min(
      Math.floor(FREE_MAX_PIXELS / w / 64) * 64,
      Math.round(w / ratio / 64) * 64,
      CUSTOM_MAX,
    );
    if (h < CUSTOM_MIN) continue;
    const score = Math.abs(Math.log(w / h / ratio)) + Math.log(FREE_MAX_PIXELS / (w * h));
    if (score < bestScore) {
      best = { width: w, height: h };
      bestScore = score;
    }
  }
  return best;
}

export function resolveResolution(layout: CanvasLayout): { width: number; height: number } {
  const preset = RESOLUTION_PRESETS.find((item) => item.id === layout.resolution);
  if (preset) return { width: preset.width, height: preset.height };
  return { width: snapDimension(layout.width), height: snapDimension(layout.height) };
}

export type ComposedLayout = {
  width: number;
  height: number;
  referenceArea: Rect;
  generationArea: Rect;
  /** 회전 전. 레퍼런스 영역 밖으로 넘친 부분은 잘라서 그린다. */
  imagePlacement: Rect;
  /** 도, 시계 방향 */
  rotation: number;
  flipX: boolean;
};

function containScale(area: Rect, imageWidth: number, imageHeight: number): number {
  return Math.min(area.width / imageWidth, area.height / imageHeight);
}

function roundTo8(value: number): number {
  return Math.round(value / 8) * 8;
}

export function computeLayout(
  layout: CanvasLayout,
  imageWidth: number,
  imageHeight: number,
): ComposedLayout {
  const { width, height } = resolveResolution(layout);
  const ratio = Math.max(0.1, Math.min(0.9, layout.referenceRatio));
  const horizontal = layout.referenceSide === 'left' || layout.referenceSide === 'right';
  const span = horizontal ? width : height;
  const referenceSpan = Math.max(64, Math.min(span - 64, roundTo8(span * ratio)));
  const generationSpan = span - referenceSpan;

  let referenceArea: Rect;
  let generationArea: Rect;
  switch (layout.referenceSide) {
    case 'left':
      referenceArea = { x: 0, y: 0, width: referenceSpan, height };
      generationArea = { x: referenceSpan, y: 0, width: generationSpan, height };
      break;
    case 'right':
      generationArea = { x: 0, y: 0, width: generationSpan, height };
      referenceArea = { x: generationSpan, y: 0, width: referenceSpan, height };
      break;
    case 'top':
      referenceArea = { x: 0, y: 0, width, height: referenceSpan };
      generationArea = { x: 0, y: referenceSpan, width, height: generationSpan };
      break;
    case 'bottom':
      generationArea = { x: 0, y: 0, width, height: generationSpan };
      referenceArea = { x: 0, y: generationSpan, width, height: referenceSpan };
      break;
  }

  if (layout.fit === 'free' && layout.free) {
    const free = layout.free;
    const base = containScale(referenceArea, imageWidth, imageHeight);
    const drawWidth = imageWidth * base * free.scaleX;
    const drawHeight = imageHeight * base * free.scaleY;
    const imagePlacement: Rect = {
      x: referenceArea.x + referenceArea.width * free.x - drawWidth / 2,
      y: referenceArea.y + referenceArea.height * free.y - drawHeight / 2,
      width: drawWidth,
      height: drawHeight,
    };
    return {
      width,
      height,
      referenceArea,
      generationArea,
      imagePlacement,
      rotation: free.rotation,
      flipX: free.flipX,
    };
  }

  const scale =
    layout.fit === 'cover'
      ? Math.max(referenceArea.width / imageWidth, referenceArea.height / imageHeight)
      : Math.min(referenceArea.width / imageWidth, referenceArea.height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const align = layout.anchor === 'top' ? 0 : layout.anchor === 'bottom' ? 1 : 0.5;
  const imagePlacement: Rect = {
    x: referenceArea.x + (referenceArea.width - drawWidth) / 2,
    y: referenceArea.y + (referenceArea.height - drawHeight) * align,
    width: drawWidth,
    height: drawHeight,
  };

  return {
    width,
    height,
    referenceArea,
    generationArea,
    imagePlacement,
    rotation: 0,
    flipX: false,
  };
}

export function imageBoxOf(composed: ComposedLayout): ImageBox {
  const place = composed.imagePlacement;
  return {
    cx: place.x + place.width / 2,
    cy: place.y + place.height / 2,
    width: place.width,
    height: place.height,
    rotation: composed.rotation,
    flipX: composed.flipX,
  };
}

export function freePlacementOf(
  box: ImageBox,
  referenceArea: Rect,
  imageWidth: number,
  imageHeight: number,
): FreePlacement {
  const base = containScale(referenceArea, imageWidth, imageHeight);
  return {
    x: (box.cx - referenceArea.x) / referenceArea.width,
    y: (box.cy - referenceArea.y) / referenceArea.height,
    scaleX: box.width / (imageWidth * base),
    scaleY: box.height / (imageHeight * base),
    rotation: box.rotation,
    flipX: box.flipX,
  };
}

/** 보호 영역 확장은 MaskBuilder가 한다. */
export function layoutBackgroundMask(composed: ComposedLayout): Uint8Array {
  const { width, height, referenceArea } = composed;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside =
        x >= referenceArea.x &&
        x < referenceArea.x + referenceArea.width &&
        y >= referenceArea.y &&
        y < referenceArea.y + referenceArea.height;
      mask[y * width + x] = inside ? 0 : 1;
    }
  }
  return mask;
}
