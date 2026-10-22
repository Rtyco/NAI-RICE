import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  layoutBackgroundMask,
  resolveResolution,
  snapDimension,
} from '../../src/core/imaging/CanvasLayout';
import { DEFAULT_LAYOUT } from '../../src/core/model/defaults';

describe('computeLayout', () => {
  it('가로 1216×832에서 왼쪽 레퍼런스, 오른쪽 생성 영역으로 나눠', () => {
    const result = computeLayout(DEFAULT_LAYOUT, 1000, 2000);
    expect(result.width).toBe(1216);
    expect(result.height).toBe(832);
    expect(result.referenceArea).toEqual({ x: 0, y: 0, width: 608, height: 832 });
    expect(result.generationArea).toEqual({ x: 608, y: 0, width: 608, height: 832 });
    // contain: 세로가 832에 맞고 가운데 정렬
    expect(result.imagePlacement.height).toBeCloseTo(832);
    expect(result.imagePlacement.width).toBeCloseTo(416);
    expect(result.imagePlacement.x).toBeCloseTo(96);
  });

  it('오른쪽·위쪽 배치와 비율을 반영해', () => {
    const right = computeLayout(
      { ...DEFAULT_LAYOUT, referenceSide: 'right', referenceRatio: 0.4 },
      100,
      100,
    );
    expect(right.generationArea).toEqual({ x: 0, y: 0, width: 728, height: 832 });
    expect(right.referenceArea).toEqual({ x: 728, y: 0, width: 488, height: 832 });

    const top = computeLayout(
      { ...DEFAULT_LAYOUT, resolution: '832x1216', referenceSide: 'top' },
      100,
      100,
    );
    expect(top.referenceArea).toEqual({ x: 0, y: 0, width: 832, height: 608 });
    expect(top.generationArea).toEqual({ x: 0, y: 608, width: 832, height: 608 });
  });

  it('cover는 레퍼런스 영역을 꽉 채워', () => {
    const result = computeLayout({ ...DEFAULT_LAYOUT, fit: 'cover' }, 1000, 1000);
    expect(result.imagePlacement.width).toBeCloseTo(832);
    expect(result.imagePlacement.x).toBeCloseTo(-112);
  });

  it('세로 맞춤은 레퍼런스 영역 안에서 위·아래로 붙여', () => {
    // 세로로 긴 이미지를 cover로 넣으면 위아래가 잘린다. 상단이면 머리 쪽이 남는다.
    const cover = { ...DEFAULT_LAYOUT, fit: 'cover' as const };
    expect(computeLayout({ ...cover, anchor: 'top' }, 1000, 2000).imagePlacement.y).toBeCloseTo(0);
    expect(computeLayout({ ...cover, anchor: 'center' }, 1000, 2000).imagePlacement.y).toBeCloseTo(
      (832 - 1216) / 2,
    );
    expect(computeLayout({ ...cover, anchor: 'bottom' }, 1000, 2000).imagePlacement.y).toBeCloseTo(
      832 - 1216,
    );
    // contain에서 가로로 긴 이미지는 남는 세로 공간 안에서 움직인다.
    const wide = computeLayout({ ...DEFAULT_LAYOUT, anchor: 'bottom' }, 2000, 1000);
    expect(wide.imagePlacement.y + wide.imagePlacement.height).toBeCloseTo(832);
  });

  it('커스텀 해상도는 64 배수로 맞추고 범위를 제한해', () => {
    expect(snapDimension(1000)).toBe(1024);
    expect(snapDimension(10)).toBe(256);
    expect(snapDimension(9000)).toBe(2048);
    expect(
      resolveResolution({ ...DEFAULT_LAYOUT, resolution: 'custom', width: 1300, height: 700 }),
    ).toEqual({ width: 1280, height: 704 });
  });

  it('레퍼런스 영역 밖만 생성 후보로 표시해', () => {
    const composed = computeLayout(
      { ...DEFAULT_LAYOUT, resolution: 'custom', width: 256, height: 256 },
      10,
      10,
    );
    const mask = layoutBackgroundMask(composed);
    expect(mask[0]).toBe(0);
    expect(mask[255]).toBe(1);
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(128 * 256);
  });
});
