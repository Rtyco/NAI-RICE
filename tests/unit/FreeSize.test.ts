import { describe, expect, it } from 'vitest';
import { closestRatioFreeSize, exactRatioFreeSize } from '../../src/core/imaging/FreeSize';

describe('closestRatioFreeSize', () => {
  it('원본 비율에 가까운 64 배수 무료 최대 크기를 고른다', () => {
    expect(closestRatioFreeSize(1000, 1500)).toEqual({ width: 832, height: 1216 });
    expect(closestRatioFreeSize(1500, 1000)).toEqual({ width: 1216, height: 832 });
    expect(closestRatioFreeSize(1080, 1920)).toEqual({ width: 768, height: 1344 });
    expect(closestRatioFreeSize(500, 500)).toEqual({ width: 1024, height: 1024 });
  });
});

describe('exactRatioFreeSize', () => {
  it('비율 오차 1% 이내에서 가장 넓은 64 배수 크기를 고른다', () => {
    expect(exactRatioFreeSize(1000, 1500)).toEqual({ width: 768, height: 1152 });
    expect(exactRatioFreeSize(1500, 1000)).toEqual({ width: 1152, height: 768 });
    expect(exactRatioFreeSize(1080, 1920)).toEqual({ width: 576, height: 1024 });
    expect(exactRatioFreeSize(832, 1216)).toEqual({ width: 832, height: 1216 });
    expect(exactRatioFreeSize(500, 500)).toEqual({ width: 1024, height: 1024 });
  });
});
