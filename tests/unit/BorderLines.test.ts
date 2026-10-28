import { describe, expect, it } from 'vitest';
import type { PixelBuffer } from '../../src/core/imaging/BackgroundDetector';
import { borderLineMask, detectBorderLines } from '../../src/core/imaging/BorderLines';

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [10, 10, 10];

function image(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { width, height, data };
}

function fill(
  target: PixelBuffer,
  rect: { x: number; y: number; width: number; height: number },
  rgb: [number, number, number],
) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1)
    for (let x = rect.x; x < rect.x + rect.width; x += 1)
      target.data.set([...rgb, 255], (y * target.width + x) * 4);
}

const whole = (target: PixelBuffer) => ({ x: 0, y: 0, width: target.width, height: target.height });

describe('크롭된 결과의 구분선', () => {
  it('왼쪽 가장자리 근처의 세로선을 찾고, 캐릭터가 일부 가려도 잡아', () => {
    const result = image(160, 256);
    fill(result, { x: 2, y: 0, width: 8, height: 256 }, BLACK);
    fill(result, { x: 0, y: 40, width: 60, height: 60 }, WHITE);
    expect(detectBorderLines(result, whole(result))).toEqual([
      { axis: 'vertical', from: 2, to: 10 },
    ]);
  });

  it('아래 가장자리의 가로선도 찾아', () => {
    const result = image(160, 256);
    fill(result, { x: 0, y: 248, width: 160, height: 5 }, BLACK);
    expect(detectBorderLines(result, whole(result))).toEqual([
      { axis: 'horizontal', from: 248, to: 253 },
    ]);
  });

  it('가장자리를 넓게 덮은 굵은 선도 찾아', () => {
    const result = image(664, 832);
    fill(result, { x: 0, y: 0, width: 56, height: 832 }, BLACK);
    expect(detectBorderLines(result, whole(result))).toEqual([
      { axis: 'vertical', from: 0, to: 56 },
    ]);
  });

  it('윤곽선처럼 끊긴 선, 가운데의 선, 띠를 채운 어두운 배경은 선으로 보지 않아', () => {
    const outline = image(160, 256);
    fill(outline, { x: 4, y: 0, width: 2, height: 100 }, BLACK);
    expect(detectBorderLines(outline, whole(outline))).toEqual([]);

    const middle = image(400, 256);
    fill(middle, { x: 200, y: 0, width: 8, height: 256 }, BLACK);
    expect(detectBorderLines(middle, whole(middle))).toEqual([]);

    const dark = image(664, 832);
    fill(dark, { x: 0, y: 0, width: 200, height: 832 }, BLACK);
    expect(detectBorderLines(dark, whole(dark))).toEqual([]);

    const inner = image(664, 832);
    fill(inner, { x: 60, y: 0, width: 8, height: 832 }, BLACK);
    expect(detectBorderLines(inner, whole(inner))).toEqual([]);
  });

  it('64 배수 여백은 빼고 결과 영역의 가장자리에서 찾아', () => {
    const result = image(192, 256);
    const area = { x: 0, y: 0, width: 150, height: 256 };
    fill(result, { x: 140, y: 0, width: 6, height: 256 }, BLACK);
    expect(detectBorderLines(result, area)).toEqual([{ axis: 'vertical', from: 140, to: 146 }]);
  });

  it('마스크는 여유를 더해 8px 칸에 맞추고 결과 영역 길이만큼 칠해', () => {
    const area = { x: 0, y: 0, width: 150, height: 20 };
    const mask = borderLineMask(192, 24, area, [{ axis: 'vertical', from: 2, to: 10 }], 4);
    const row = (y: number) => [...mask.slice(y * 192, y * 192 + 24)].join('');
    expect(row(0)).toBe('1'.repeat(16) + '0'.repeat(8));
    expect(row(23)).toBe('1'.repeat(16) + '0'.repeat(8));
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(16 * 24);
  });
});
