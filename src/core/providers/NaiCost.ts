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

/** NovelAI `user/data`의 `subscription.tier`에서 Opus. 무료 생성은 Opus에만 있다. */
export const OPUS_TIER = 3;

/** 비용 판단에 쓰는 계정 상태. 아직 조회하지 않았으면 비워 두고, 그때는 Opus로 본다. */
export type CostAccount = { tier?: number; v5Quota?: V5QuotaState };

/**
 * 한 장(n_samples 1)의 Anlas를 NovelAI 웹의 계산식으로 추정한다. 무료 조건은 따지지 않는다.
 * 식은 커뮤니티 구현(NekoAI-JS `calculateCost`)을 따랐고, 0단계 실측(512×512·29스텝 6 Anlas)과 맞췄다.
 * i2i는 `strength`를 곱한다. 인페인트와 일반 생성은 1이다.
 */
export function imageAnlasCost(input: {
  width: number;
  height: number;
  steps: number;
  strength?: number;
}): number {
  let pixels = Math.max(input.width * input.height, 65_536);
  // 832×1216보다 크고 1024×1024 이하인 해상도는 832×1216과 같은 값을 받는다.
  if (pixels > 832 * 1216 && pixels <= FREE_MAX_PIXELS) pixels = 832 * 1216;
  const base = Math.ceil(
    2.951823174884865e-6 * pixels + 5.753298233447344e-7 * pixels * input.steps,
  );
  return Math.max(Math.ceil(base * (input.strength ?? 1)), 2);
}

type CostJob = Pick<InpaintJobSnapshot, 'settings' | 'canvasWidth' | 'canvasHeight'>;

function v5QuotaExhausted(job: CostJob, account?: CostAccount): boolean {
  const quota = account?.v5Quota;
  return (
    modelInfo(job.settings.model)?.generation === 'v5' &&
    Boolean(quota) &&
    (quota!.isNegative || quota!.percent <= 0)
  );
}

/** 작업 한 개(한 장)의 예상 Anlas. 무료 기준 안이면 0이다. */
export function estimateJobAnlas(job: CostJob, account?: CostAccount): number {
  const opus = account?.tier === undefined || account.tier >= OPUS_TIER;
  const free =
    opus &&
    checkFreeGeneration(job.settings, job.canvasWidth, job.canvasHeight).free &&
    !v5QuotaExhausted(job, account);
  return free
    ? 0
    : imageAnlasCost({
        width: job.canvasWidth,
        height: job.canvasHeight,
        steps: job.settings.steps,
      });
}

/**
 * 작업들을 생성하면 Anlas가 쓰일 수 있는 이유. 비어 있으면 모두 무료 기준 안이다.
 * 메인 프로세스가 큐에 넣기 전에 직접 계산하므로, 렌더러가 경고를 빼고 보내도 확인 창이 뜬다.
 */
export function generationCostWarnings(jobs: CostJob[], account?: CostAccount): string[] {
  const warnings = new Set<string>();
  if (jobs.length && account?.tier !== undefined && account.tier < OPUS_TIER)
    warnings.add('Opus 구독이 아니어서 모든 생성에 Anlas가 듭니다.');
  for (const job of jobs) {
    for (const reason of checkFreeGeneration(job.settings, job.canvasWidth, job.canvasHeight)
      .reasons)
      warnings.add(reason);
    if (v5QuotaExhausted(job, account))
      warnings.add('V5 무료 생성 할당량이 소진되어 Anlas가 사용될 수 있습니다.');
  }
  return [...warnings];
}
