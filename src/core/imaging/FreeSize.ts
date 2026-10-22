import { FREE_MAX_PIXELS } from '../providers/NaiCost';
import { CUSTOM_MAX, CUSTOM_MIN } from './CanvasLayout';

export type Size = { width: number; height: number };

/** 크기 비율과 원본 비율의 차이(log). 0이면 같은 비율 */
export function ratioError(size: Size, width: number, height: number): number {
  return Math.abs(Math.log(size.width / size.height / (width / height)));
}

export function totalPixels(sizes: Size[]): number {
  return sizes.reduce((sum, size) => sum + size.width * size.height, 0);
}

/** 원본 비율에 가까운 Opus 무료 최대 크기. 비율 오차와 넓이 손실(둘 다 log)을 같은 무게로 잰다. */
export function closestRatioFreeSize(width: number, height: number): Size {
  const ratio = width / height;
  let best = { width: 1024, height: 1024 };
  let bestScore = Infinity;
  for (let w = CUSTOM_MIN; w <= CUSTOM_MAX; w += 64) {
    const h = Math.min(
      Math.floor(FREE_MAX_PIXELS / w / 64) * 64,
      Math.round(w / ratio / 64) * 64,
      CUSTOM_MAX,
    );
    if (h < CUSTOM_MIN) continue;
    const size = { width: w, height: h };
    const score = ratioError(size, width, height) + Math.log(FREE_MAX_PIXELS / (w * h));
    if (score < bestScore) {
      best = size;
      bestScore = score;
    }
  }
  return best;
}

/** 1216px 변에서 12px 남짓만 잘린다. */
const EXACT_RATIO_TOLERANCE = 0.01;

/** 비율 오차가 1% 이내인 크기 중 가장 넓은 것. 없으면 `closestRatioFreeSize` */
export function exactRatioFreeSize(width: number, height: number): Size {
  const ratio = width / height;
  const limit = Math.log(1 + EXACT_RATIO_TOLERANCE);
  let best: Size | undefined;
  let bestError = Infinity;
  for (let w = CUSTOM_MIN; w <= CUSTOM_MAX; w += 64) {
    const maxHeight = Math.min(Math.floor(FREE_MAX_PIXELS / w / 64) * 64, CUSTOM_MAX);
    const ideal = w / ratio / 64;
    for (const h of [Math.floor(ideal) * 64, Math.ceil(ideal) * 64]) {
      if (h < CUSTOM_MIN || h > maxHeight) continue;
      const size = { width: w, height: h };
      const error = ratioError(size, width, height);
      if (error > limit) continue;
      const area = w * h;
      const bestArea = best ? best.width * best.height : 0;
      if (area > bestArea || (area === bestArea && error < bestError)) {
        best = size;
        bestError = error;
      }
    }
  }
  return best ?? closestRatioFreeSize(width, height);
}

/** 다듬기에서 장마다 원본 크기로 정하는 목표 크기 */
export const RATIO_SIZES = {
  'exact-ratio': exactRatioFreeSize,
  'closest-ratio': closestRatioFreeSize,
};

export type RatioSizeMode = keyof typeof RATIO_SIZES;

export function isRatioSizeMode(value: string): value is RatioSizeMode {
  return value in RATIO_SIZES;
}
