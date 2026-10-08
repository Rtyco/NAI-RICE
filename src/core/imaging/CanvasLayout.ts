import type { CanvasLayout, Rect, ResolutionPresetId } from '../domain/types';

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

/** NovelAI는 64의 배수 해상도만 받는다. */
export function snapDimension(value: number): number {
  const snapped = Math.round(value / 64) * 64;
  return Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, snapped || CUSTOM_MIN));
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
  /** 원본 이미지를 그릴 위치. cover 모드에서는 레퍼런스 영역 밖으로 넘칠 수 있으며 잘라서 그린다. */
  imagePlacement: Rect;
};

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

  const scale =
    layout.fit === 'cover'
      ? Math.max(referenceArea.width / imageWidth, referenceArea.height / imageHeight)
      : Math.min(referenceArea.width / imageWidth, referenceArea.height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  // 세로 맞춤은 레퍼런스 영역 안에서만 움직인다. 남는 공간(cover면 잘리는 부분)을 위·아래로 나눈다.
  const align = layout.anchor === 'top' ? 0 : layout.anchor === 'bottom' ? 1 : 0.5;
  const imagePlacement: Rect = {
    x: referenceArea.x + (referenceArea.width - drawWidth) / 2,
    y: referenceArea.y + (referenceArea.height - drawHeight) * align,
    width: drawWidth,
    height: drawHeight,
  };

  return { width, height, referenceArea, generationArea, imagePlacement };
}

/** 자동 구성에서는 레퍼런스 영역 밖 전체를 생성 후보로 둔다. 보호 영역 확장은 MaskBuilder가 처리한다. */
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
