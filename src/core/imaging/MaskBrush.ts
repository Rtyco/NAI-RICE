/** NovelAI 웹은 마스크 레이어를 이미지의 1/8 크기로 두고 칸 단위로 칠한다(`addMaskLayer`). 같은 방식이어야 같은 영역이 다시 그려진다. */
export const MASK_CELL = 8;

export type BrushShape = 'circle' | 'square';

/** 칸 좌표 = 이미지 px / 8 */
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

/** 반지름의 절반 간격(웹과 같다)으로 채워 빠르게 그어도 점선이 되지 않는다. `from`은 이미 찍어 넣지 않는다. */
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

/** 이미지 밖은 자른다. */
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
  // fill은 음수 끝을 배열 끝에서 센다. 막지 않으면 맨 윗줄의 fill(v, 0, -8)이 마스크 거의 전체를 칠한다.
  if (right <= left || bottom <= top) return;
  for (let y = top; y < bottom; y += 1) buffer.fill(value, y * width + left, y * width + right);
}
