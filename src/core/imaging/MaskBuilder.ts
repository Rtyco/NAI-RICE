import type { Rect } from '../domain/types';
import { contains, expandRect } from './rects';

export type MaskBuildInput = {
  width: number;
  height: number;
  backgroundMask: Uint8Array;
  referenceRect: Rect;
  expansionPx: number;
  overrides?: Int8Array;
};

export function buildGenerationMask(input: MaskBuildInput): Uint8Array {
  const { width, height, backgroundMask, overrides } = input;
  if (backgroundMask.length !== width * height)
    throw new Error('배경 마스크 크기가 캔버스와 달라.');
  if (overrides && overrides.length !== width * height)
    throw new Error('수동 마스크 크기가 캔버스와 달라.');
  const protectedRect = expandRect(input.referenceRect, input.expansionPx, width, height);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      mask[pixel] = backgroundMask[pixel] && !contains(protectedRect, x, y) ? 1 : 0;
      if (overrides && overrides[pixel] >= 0) mask[pixel] = overrides[pixel] as 0 | 1;
    }
  }
  return mask;
}

/**
 * 저장된 마스크에서 사용자가 붓으로 고친 픽셀만 골라낸다.
 * 자동 계산과 같은 픽셀은 -1(자동)로 두어, 이후 확장 값이나 영역을 바꾸면 그대로 반영되게 한다.
 * 자동 계산 결과는 여러 개를 받을 수 있다. 어느 하나와 같으면 손대지 않은 픽셀로 본다.
 */
export function manualOverrides(saved: Uint8Array, automatic: Uint8Array[]): Int8Array {
  const overrides = new Int8Array(saved.length).fill(-1);
  for (let pixel = 0; pixel < saved.length; pixel += 1) {
    const value = saved[pixel] ? 1 : 0;
    if (!automatic.some((mask) => (mask[pixel] ? 1 : 0) === value)) overrides[pixel] = value;
  }
  return overrides;
}

const MAX_EXPANSION_PX = 64;

/**
 * 저장된 마스크가 몇 px 확장으로 만들어졌는지 추정한다. 예전 버전은 캔버스 가장자리에서 확장이
 * 두 배로 들어갔으므로, 입력란 값만으로는 저장된 마스크를 다시 만들 수 없다.
 * 그 확장으로 보호되는 픽셀이 저장된 마스크에서도 모두 보호돼 있는 가장 큰 값을 이분 탐색으로 찾는다.
 */
export function inferSavedExpansion(
  saved: Uint8Array,
  input: Omit<MaskBuildInput, 'expansionPx' | 'overrides'>,
): number {
  const fits = (expansionPx: number) => {
    const automatic = buildGenerationMask({ ...input, expansionPx });
    return automatic.every((value, pixel) => value === 1 || !saved[pixel]);
  };
  if (!fits(0)) return 0;
  let low = 0;
  let high = MAX_EXPANSION_PX;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function invertMask(mask: Uint8Array): Uint8Array {
  return Uint8Array.from(mask, (value) => (value ? 0 : 1));
}

export function maskHasGeneratePixels(mask: Uint8Array): boolean {
  return mask.some((value) => value === 1);
}
