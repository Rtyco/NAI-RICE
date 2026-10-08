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

/**
 * 사방으로 amount만큼 넓힌 뒤 캔버스 밖으로 나간 부분은 잘라 낸다.
 * clampRect처럼 밀어 넣으면 캔버스 가장자리에 붙은 레퍼런스의 여백이 반대쪽으로 두 배가 된다.
 */
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
