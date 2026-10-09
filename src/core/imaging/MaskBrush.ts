/**
 * 마스크 붓. NovelAI 웹은 마스크 레이어를 이미지의 1/8 크기로 두고 그 칸 단위로 칠한다(웹 코드
 * `addMaskLayer`: canvasWidth/8, scaleFactor 8). 그래서 칠한 영역은 8px 칸으로 각지고, 붓 크기도 칸 수로
 * 센다(기본 4칸 = 32px). 같은 방식으로 칠해야 웹에서 칠한 것과 같은 영역이 다시 그려진다.
 */
export const MASK_CELL = 8;

export type BrushShape = 'circle' | 'square';

/** 칸 좌표(이미지 px / 8)를 중심으로 `size`칸 붓이 덮는 칸마다 `visit`을 부른다. */
export function forEachStampCell(
  cx: number,
  cy: number,
  size: number,
  shape: BrushShape,
  visit: (cellX: number, cellY: number) => void,
): void {
  const startX = Math.round(cx - size / 2);
  const startY = Math.round(cy - size / 2);
  const center = size / 2;
  const radiusSquared = center * center;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      if (shape === 'circle') {
        const dx = i + 0.5 - center;
        const dy = j + 0.5 - center;
        if (dx * dx + dy * dy > radiusSquared) continue;
      }
      visit(startX + i, startY + j);
    }
  }
}

/**
 * 붓이 지나간 길에 찍을 위치(칸 좌표). 포인터 이벤트 사이를 반지름의 절반 간격으로 채워, 빠르게 그어도
 * 점선이 되지 않게 한다(웹과 같은 간격). `from` 자리는 이미 찍었으므로 넣지 않는다.
 */
export function strokeStamps(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
): Array<{ x: number; y: number }> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, size / 4)));
  return Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / steps;
    return { x: from.x + dx * t, y: from.y + dy * t };
  });
}

/** 칸 하나(8×8px)를 이미지 크기의 마스크 버퍼에 칠한다. 이미지 밖은 자른다. */
export function fillCell(
  buffer: Int8Array | Uint8Array,
  width: number,
  height: number,
  cellX: number,
  cellY: number,
  value: number,
): void {
  const left = Math.max(0, cellX * MASK_CELL);
  const top = Math.max(0, cellY * MASK_CELL);
  const right = Math.min(width, (cellX + 1) * MASK_CELL);
  const bottom = Math.min(height, (cellY + 1) * MASK_CELL);
  for (let y = top; y < bottom; y += 1) buffer.fill(value, y * width + left, y * width + right);
}
