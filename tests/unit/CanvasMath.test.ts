import { describe, expect, it } from 'vitest';
import { floodRegion } from '../../src/core/imaging/FloodFill';
import { buildGenerationMask, savedOverrides } from '../../src/core/imaging/MaskBuilder';
import { rectHandleAt, resizeRect } from '../../src/core/imaging/rects';
import {
  fillRegion,
  hexToRgb,
  packedColor,
  paintMask,
  rgbToHex,
} from '../../src/renderer/lib/image';

describe('rectHandleAt', () => {
  const rect = { x: 10, y: 10, width: 100, height: 50 };

  it('모서리 반경 안이면 그 모서리, 안쪽이면 이동', () => {
    expect(rectHandleAt(rect, 12, 12, 8)).toBe('nw');
    expect(rectHandleAt(rect, 108, 58, 8)).toBe('se');
    expect(rectHandleAt(rect, 60, 30, 8)).toBe('move');
    expect(rectHandleAt(rect, 200, 200, 8)).toBeNull();
  });
});

describe('resizeRect', () => {
  const rect = { x: 10, y: 10, width: 100, height: 50 };

  it('잡은 모서리만 움직인다', () => {
    expect(resizeRect(rect, 'se', 20, 10)).toEqual({ x: 10, y: 10, width: 120, height: 60 });
    expect(resizeRect(rect, 'nw', 5, 5)).toEqual({ x: 15, y: 15, width: 95, height: 45 });
    expect(resizeRect(rect, 'move', -5, 3)).toEqual({ x: 5, y: 13, width: 100, height: 50 });
  });

  it('반대쪽 변을 넘으면 뒤집는다', () => {
    expect(resizeRect(rect, 'ne', -130, 0)).toEqual({ x: -20, y: 10, width: 30, height: 50 });
  });
});

describe('floodRegion', () => {
  // 3×3: 가운데 세로줄만 다른 색
  const a = packedColor([0, 0, 0]);
  const b = packedColor([200, 200, 200]);
  const pixels = Uint32Array.from([a, b, a, a, b, a, a, b, a]);

  it('4방향으로 이어진 비슷한 색만 고른다', () => {
    expect([...floodRegion(pixels, 3, 3, 0, 0, 10)]).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0]);
  });

  it('허용 오차가 크면 넘어간다', () => {
    expect([...floodRegion(pixels, 3, 3, 0, 0, 255)]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('colors and masks', () => {
  it('hex와 RGB를 오간다', () => {
    expect(rgbToHex(...hexToRgb('#1a2b3c'))).toBe('#1a2b3c');
  });

  it('선은 생성 영역 색보다 위에 칠한다', () => {
    const pixels = new Uint32Array(3);
    paintMask(pixels, Uint8Array.from([1, 1, 0]), 5, {
      pixels: Uint8Array.from([0, 1, 1]),
      color: 9,
    });
    expect([...pixels]).toEqual([5, 9, 9]);
    const plain = new Uint32Array(3);
    fillRegion(plain, Uint8Array.from([0, 1, 0]), 7);
    expect([...plain]).toEqual([0, 7, 0]);
  });
});

describe('savedOverrides', () => {
  const area = {
    width: 4,
    height: 1,
    backgroundMask: Uint8Array.from([1, 1, 1, 1]),
    referenceRect: { x: 0, y: 0, width: 1, height: 1 },
    expansionPx: 0,
  };

  it('저장된 마스크가 없거나 크기가 다르면 모두 자동', () => {
    expect([...savedOverrides(area, undefined)]).toEqual([-1, -1, -1, -1]);
    expect([...savedOverrides(area, new Uint8Array(2))]).toEqual([-1, -1, -1, -1]);
  });

  it('붓으로 바꾼 픽셀만 남긴다', () => {
    const saved = buildGenerationMask(area);
    saved[3] = 0;
    expect([...savedOverrides(area, saved)]).toEqual([-1, -1, -1, 0]);
  });
});
