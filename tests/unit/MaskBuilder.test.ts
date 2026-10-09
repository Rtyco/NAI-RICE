import { describe, expect, it } from 'vitest';
import { contains, expandRect } from '../../src/core/imaging/rects';
import { buildGenerationMask, invertMask } from '../../src/core/imaging/MaskBuilder';

describe('buildGenerationMask', () => {
  it('보호 영역을 KEEP으로 남기고 수동 보정을 우선해', () => {
    const background = new Uint8Array(25).fill(1);
    const overrides = new Int8Array(25).fill(-1);
    overrides[0] = 0;
    overrides[12] = 1;
    const mask = buildGenerationMask({
      width: 5,
      height: 5,
      backgroundMask: background,
      referenceRect: { x: 1, y: 1, width: 3, height: 3 },
      expansionPx: 0,
      overrides,
    });
    expect(mask[0]).toBe(0);
    expect(mask[6]).toBe(0);
    expect(mask[12]).toBe(1);
    expect(mask[24]).toBe(1);
    expect(invertMask(mask)[24]).toBe(0);
  });
});

describe('buildGenerationMask 줄 단위 계산', () => {
  it('픽셀마다 영역 안인지 따지던 방식과 결과가 같아', () => {
    const width = 37;
    const height = 23;
    const backgroundMask = Uint8Array.from({ length: width * height }, (_, pixel) =>
      pixel % 7 === 0 ? 0 : pixel % 5 === 0 ? 2 : 1,
    );
    const rects = [
      { x: 3.4, y: 2.6, width: 10.3, height: 8.7 },
      { x: -5, y: -5, width: 12, height: 40 },
      { x: 30, y: 15, width: 20, height: 20 },
      { x: 0, y: 0, width: width, height: height },
    ];
    for (const referenceRect of rects) {
      for (const expansionPx of [0, 3, 50]) {
        const protectedRect = expandRect(referenceRect, expansionPx, width, height);
        const expected = new Uint8Array(width * height);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const pixel = y * width + x;
            expected[pixel] = backgroundMask[pixel] && !contains(protectedRect, x, y) ? 1 : 0;
          }
        }
        const mask = buildGenerationMask({
          width,
          height,
          backgroundMask,
          referenceRect,
          expansionPx,
        });
        expect(Array.from(mask)).toEqual(Array.from(expected));
      }
    }
  });
});
