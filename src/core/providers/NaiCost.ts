import type { GenerationSettings, InpaintJobSnapshot } from '../domain/types';
import { modelInfo } from './NaiModels';

/** Opus 구독의 무제한(Anlas 미사용) 생성 기준: 1024×1024 이하 면적, 28 steps 이하, 1장. */
export const FREE_MAX_PIXELS = 1024 * 1024;
export const FREE_MAX_STEPS = 28;

export type FreeGenerationCheck = {
  free: boolean;
  reasons: string[];
};

export function checkFreeGeneration(
  settings: Pick<GenerationSettings, 'steps'>,
  width: number,
  height: number,
): FreeGenerationCheck {
  const reasons: string[] = [];
  if (width * height > FREE_MAX_PIXELS) {
    reasons.push(
      `캔버스 ${width}×${height}(${(width * height).toLocaleString()}px)가 무료 기준 ${FREE_MAX_PIXELS.toLocaleString()}px을 넘습니다.`,
    );
  }
  if (settings.steps > FREE_MAX_STEPS) {
    reasons.push(`Steps ${settings.steps}가 무료 기준 ${FREE_MAX_STEPS}을 넘습니다.`);
  }
  return { free: reasons.length === 0, reasons };
}

export type V5QuotaState = { percent: number; isNegative: boolean };

/**
 * 작업들을 생성하면 Anlas가 쓰일 수 있는 이유. 비어 있으면 모두 무료 기준 안이다.
 * 메인 프로세스가 큐에 넣기 전에 직접 계산하므로, 렌더러가 경고를 빼고 보내도 확인 창이 뜬다.
 */
export function generationCostWarnings(
  jobs: Pick<InpaintJobSnapshot, 'settings' | 'canvasWidth' | 'canvasHeight'>[],
  v5Quota?: V5QuotaState,
): string[] {
  const warnings = new Set<string>();
  for (const job of jobs) {
    for (const reason of checkFreeGeneration(job.settings, job.canvasWidth, job.canvasHeight)
      .reasons)
      warnings.add(reason);
    if (
      modelInfo(job.settings.model)?.generation === 'v5' &&
      v5Quota &&
      (v5Quota.isNegative || v5Quota.percent <= 0)
    )
      warnings.add('V5 무료 생성 할당량이 소진되어 Anlas가 사용될 수 있습니다.');
  }
  return [...warnings];
}
