import type { Rect } from '../domain/types';

export function clampRect(rect: Rect, width: number, height: number, minSize = 1): Rect {
  const x = Math.max(0, Math.min(width - minSize, Math.round(rect.x)));
  const y = Math.max(0, Math.min(height - minSize, Math.round(rect.y)));
  return {
    x,
    y,
    width: Math.max(minSize, Math.min(width - x, Math.round(rect.width))),
    height: Math.max(minSize, Math.min(height - y, Math.round(rect.height))),
  };
}

/** 캔버스 밖은 잘라 낸다. clampRect처럼 밀어 넣으면 가장자리에 붙은 레퍼런스의 여백이 반대쪽으로 두 배가 된다. */
export function expandRect(rect: Rect, amount: number, width: number, height: number): Rect {
  const left = Math.max(0, Math.round(rect.x - amount));
  const top = Math.max(0, Math.round(rect.y - amount));
  const right = Math.min(width, Math.round(rect.x + rect.width + amount));
  const bottom = Math.min(height, Math.round(rect.y + rect.height + amount));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

export function isValidRect(rect: Rect, width: number, height: number): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= width &&
    rect.y + rect.height <= height
  );
}

export type RectHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/** 모서리가 안쪽 이동보다 먼저다. */
export function rectHandleAt(rect: Rect, x: number, y: number, radius: number): RectHandle | null {
  const corners: Array<[RectHandle, number, number]> = [
    ['nw', rect.x, rect.y],
    ['ne', rect.x + rect.width, rect.y],
    ['sw', rect.x, rect.y + rect.height],
    ['se', rect.x + rect.width, rect.y + rect.height],
  ];
  for (const [handle, cornerX, cornerY] of corners) {
    if (Math.hypot(x - cornerX, y - cornerY) <= radius) return handle;
  }
  return contains(rect, x, y) ? 'move' : null;
}

export function resizeRect(original: Rect, handle: RectHandle, dx: number, dy: number): Rect {
  if (handle === 'move') return { ...original, x: original.x + dx, y: original.y + dy };
  let left = original.x;
  let top = original.y;
  let right = original.x + original.width;
  let bottom = original.y + original.height;
  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;
  if (right < left) [left, right] = [right, left];
  if (bottom < top) [top, bottom] = [bottom, top];
  return { x: left, y: top, width: right - left, height: bottom - top };
}
