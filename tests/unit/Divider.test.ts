import { describe, expect, it } from 'vitest';
import { dividerPixels } from '../../src/core/imaging/Divider';

function maskOf(width: number, height: number, generate: (x: number, y: number) => boolean) {
  return Uint8Array.from({ length: width * height }, (_, pixel) =>
    generate(pixel % width, Math.floor(pixel / width)) ? 1 : 0,
  );
}

function bruteForce(mask: Uint8Array, width: number, height: number, reach: number) {
  return Uint8Array.from(mask, (value, pixel) => {
    if (value || !reach) return 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (let dy = -reach; dy <= reach; dy += 1)
      for (let dx = -reach; dx <= reach; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) return 1;
      }
    return 0;
  });
}

describe('dividerPixels', () => {
  it('좌우로 나뉜 캔버스에서 생성 영역 바로 바깥에 두께만큼 세로 띠를 만들어', () => {
    const mask = maskOf(32, 4, (x) => x >= 16);
    const ring = dividerPixels(mask, 32, 4, 8);
    for (let y = 0; y < 4; y += 1)
      for (let x = 0; x < 32; x += 1) expect(ring[y * 32 + x]).toBe(x >= 8 && x < 16 ? 1 : 0);
  });

  it('생성 영역 안과 캔버스 밖에는 그리지 않아', () => {
    const mask = maskOf(10, 10, () => true);
    expect(dividerPixels(mask, 10, 10, 8).some(Boolean)).toBe(false);
    expect(
      dividerPixels(
        maskOf(10, 10, () => false),
        10,
        10,
        8,
      ).some(Boolean),
    ).toBe(false);
  });

  it('두께 0이면 비어 있어', () => {
    const mask = maskOf(10, 10, (x) => x > 4);
    expect(dividerPixels(mask, 10, 10, 0).some(Boolean)).toBe(false);
  });

  it('구멍과 모서리를 포함해 정사각 이웃으로 계산한 결과와 같아', () => {
    const width = 41;
    const height = 29;
    const mask = maskOf(
      width,
      height,
      (x, y) => (x > 20 && !(x > 28 && x < 33 && y > 10 && y < 15)) || (x === 3 && y === 3),
    );
    for (const reach of [1, 3, 8, 32])
      expect(dividerPixels(mask, width, height, reach)).toEqual(
        bruteForce(mask, width, height, reach),
      );
  });
});
