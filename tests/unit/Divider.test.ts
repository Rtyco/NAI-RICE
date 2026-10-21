import { describe, expect, it } from 'vitest';
import type { DividerLine } from '../../src/core/domain/types';
import { dividerPixels } from '../../src/core/imaging/Divider';

function maskOf(width: number, height: number, generate: (x: number, y: number) => boolean) {
  return Uint8Array.from({ length: width * height }, (_, pixel) =>
    generate(pixel % width, Math.floor(pixel / width)) ? 1 : 0,
  );
}

const outside = (widthPx: number, gapPx = 0) => ({
  widthPx,
  gapPx,
  placement: 'outside' as const,
});

/** 생성 영역(1) 또는 나머지(0) 쪽 픽셀 중 반대쪽까지 정사각 거리가 (gap, gap + reach]인 곳 */
function bruteForce(
  mask: Uint8Array,
  width: number,
  height: number,
  side: 0 | 1,
  gap: number,
  reach: number,
) {
  return Uint8Array.from(mask, (value, pixel) => {
    if (value !== side || !reach) return 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    let nearest = Infinity;
    for (let ny = 0; ny < height; ny += 1)
      for (let nx = 0; nx < width; nx += 1)
        if (mask[ny * width + nx] !== side)
          nearest = Math.min(nearest, Math.max(Math.abs(nx - x), Math.abs(ny - y)));
    return nearest > gap && nearest <= gap + reach ? 1 : 0;
  });
}

function columns(ring: Uint8Array, width: number): number[] {
  return [
    ...new Set(
      Array.from(ring.keys())
        .filter((pixel) => ring[pixel])
        .map((pixel) => pixel % width),
    ),
  ].sort((a, b) => a - b);
}

describe('dividerPixels', () => {
  const split = maskOf(32, 4, (x) => x >= 16);

  it('바깥은 생성 영역 바로 바깥에 두께만큼 그려', () => {
    expect(columns(dividerPixels(split, 32, 4, outside(8)), 32)).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('간격만큼 경계에서 띄워', () => {
    expect(columns(dividerPixels(split, 32, 4, outside(4, 4)), 32)).toEqual([8, 9, 10, 11]);
    const inside: DividerLine['placement'] = 'inside';
    expect(
      columns(dividerPixels(split, 32, 4, { widthPx: 4, gapPx: 2, placement: inside }), 32),
    ).toEqual([18, 19, 20, 21]);
  });

  it('걸침은 경계 양쪽에 반씩 그리고 간격은 쓰지 않아', () => {
    const center: DividerLine['placement'] = 'center';
    expect(
      columns(dividerPixels(split, 32, 4, { widthPx: 8, gapPx: 16, placement: center }), 32),
    ).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('캔버스 가장자리는 경계로 치지 않아', () => {
    const all = maskOf(10, 10, () => true);
    for (const placement of ['outside', 'center', 'inside'] as const)
      expect(dividerPixels(all, 10, 10, { widthPx: 8, gapPx: 0, placement }).some(Boolean)).toBe(
        false,
      );
    expect(
      dividerPixels(
        maskOf(10, 10, () => false),
        10,
        10,
        outside(8),
      ).some(Boolean),
    ).toBe(false);
  });

  it('두께 0이면 비어 있어', () => {
    expect(
      dividerPixels(
        maskOf(10, 10, (x) => x > 4),
        10,
        10,
        outside(0),
      ).some(Boolean),
    ).toBe(false);
  });

  it('경계 둘레만 계산해도 전체를 계산한 결과와 같아', () => {
    const width = 60;
    const height = 40;
    const island = maskOf(width, height, (x, y) => x >= 25 && x < 33 && y >= 15 && y < 21);
    for (const [reach, gap] of [
      [4, 0],
      [8, 8],
    ]) {
      expect(dividerPixels(island, width, height, outside(reach, gap))).toEqual(
        bruteForce(island, width, height, 0, gap, reach),
      );
      expect(
        dividerPixels(island, width, height, { widthPx: reach, gapPx: gap, placement: 'inside' }),
      ).toEqual(bruteForce(island, width, height, 1, gap, reach));
    }
  });

  it('구멍과 모서리를 포함해 정사각 거리로 계산한 결과와 같아', () => {
    const width = 41;
    const height = 29;
    const mask = maskOf(
      width,
      height,
      (x, y) => (x > 20 && !(x > 28 && x < 33 && y > 10 && y < 15)) || (x === 3 && y === 3),
    );
    for (const [reach, gap] of [
      [1, 0],
      [3, 2],
      [8, 0],
      [8, 8],
    ]) {
      expect(dividerPixels(mask, width, height, outside(reach, gap))).toEqual(
        bruteForce(mask, width, height, 0, gap, reach),
      );
      expect(
        dividerPixels(mask, width, height, { widthPx: reach, gapPx: gap, placement: 'inside' }),
      ).toEqual(bruteForce(mask, width, height, 1, gap, reach));
    }
  });
});
