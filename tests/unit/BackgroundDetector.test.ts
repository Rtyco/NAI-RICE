import { describe, expect, it } from 'vitest';
import { detectBackground, type PixelBuffer } from '../../src/core/imaging/BackgroundDetector';

function buffer(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) data.set(rgba, pixel * 4);
  return { width, height, data };
}

function setPixel(
  image: PixelBuffer,
  x: number,
  y: number,
  rgba: [number, number, number, number],
) {
  image.data.set(rgba, (y * image.width + x) * 4);
}

describe('detectBackground', () => {
  it('투명 배경 속 불투명 레퍼런스를 찾아', () => {
    const image = buffer(20, 20, [0, 0, 0, 0]);
    for (let y = 6; y < 14; y += 1) {
      for (let x = 7; x < 13; x += 1) setPixel(image, x, y, [30, 40, 50, 255]);
    }
    const result = detectBackground(image, 16, 1);
    expect(result.mode).toBe('transparent');
    expect(result.referenceRect).toEqual({ x: 6, y: 5, width: 8, height: 10 });
  });

  it('가장자리와 연결된 흰색만 배경으로 분류해', () => {
    const image = buffer(24, 24, [255, 255, 255, 255]);
    for (let y = 5; y < 19; y += 1) {
      for (let x = 7; x < 17; x += 1) setPixel(image, x, y, [20, 20, 20, 255]);
    }
    setPixel(image, 12, 12, [255, 255, 255, 255]);
    const result = detectBackground(image, 16, 0);
    expect(result.mode).toBe('solid');
    expect(result.backgroundMask[12 * 24 + 12]).toBe(0);
    expect(result.referenceRect).toEqual({ x: 7, y: 5, width: 10, height: 14 });
  });
});
