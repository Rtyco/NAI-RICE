import { describe, expect, it } from 'vitest';
import {
  fillCell,
  forEachStampCell,
  MASK_CELL,
  strokeStamps,
} from '../../src/core/imaging/MaskBrush';

function cells(cx: number, cy: number, size: number, shape: 'circle' | 'square') {
  const found: string[] = [];
  forEachStampCell(cx, cy, size, shape, (x, y) => found.push(`${x},${y}`));
  return found;
}

describe('마스크 붓 (NovelAI 웹과 같은 8px 칸)', () => {
  it('네모 붓은 크기만큼의 칸을, 둥근 붓은 모서리를 뺀 칸을 칠해', () => {
    expect(cells(10, 10, 4, 'square')).toHaveLength(16);
    const circle = cells(10, 10, 4, 'circle');
    expect(circle).toHaveLength(12);
    expect(circle).not.toContain('8,8');
    expect(circle).toContain('9,9');
    expect(cells(10.2, 10.2, 1, 'circle')).toEqual(['10,10']);
  });

  it('빠르게 그어도 반지름의 절반 간격으로 사이를 채워', () => {
    const stamps = strokeStamps({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(stamps).toHaveLength(10);
    expect(stamps.at(-1)).toEqual({ x: 10, y: 0 });
    expect(Math.max(...stamps.map((s, i) => s.x - (stamps[i - 1]?.x ?? 0)))).toBeLessThanOrEqual(1);
  });

  it('칸 하나를 8×8px로 칠하고 이미지 밖은 잘라', () => {
    const width = 20;
    const height = 12;
    const buffer = new Uint8Array(width * height);
    fillCell(buffer, width, height, 2, 1, 1);
    expect(buffer.reduce((sum, value) => sum + value, 0)).toBe(4 * 4);
    expect(buffer[MASK_CELL * width + 2 * MASK_CELL]).toBe(1);
    fillCell(buffer, width, height, -1, 0, 1);
    expect(buffer[0]).toBe(0);
  });
});
