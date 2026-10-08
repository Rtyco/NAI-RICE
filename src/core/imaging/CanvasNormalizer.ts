export type ImageTransform = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
};

export type NormalizedCanvas = {
  width: number;
  height: number;
  paddingRight: number;
  paddingBottom: number;
  transform: ImageTransform;
};

export function roundUpToMultiple(value: number, multiple: number): number {
  if (multiple <= 0) throw new Error('정렬 단위는 0보다 커야 합니다.');
  return Math.ceil(value / multiple) * multiple;
}

export function normalizeCanvasSize(
  originalWidth: number,
  originalHeight: number,
  alignment = 64,
): NormalizedCanvas {
  const width = roundUpToMultiple(originalWidth, alignment);
  const height = roundUpToMultiple(originalHeight, alignment);
  return {
    width,
    height,
    paddingRight: width - originalWidth,
    paddingBottom: height - originalHeight,
    transform: {
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      originalWidth,
      originalHeight,
    },
  };
}
