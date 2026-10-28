import type {
  AugmentTool,
  JobAid,
  GenerationJobSnapshot,
  GenerationKind,
  GenerationSettings,
  SmeaMode,
} from '../domain/types';
import { modelInfo, supportsV3Sampling } from './NaiModels';

/** Opus 무료 생성 조건: 1024×1024 이하, 28 steps 이하, 1장. */
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

/** NovelAI `user/data`의 `subscription.tier` */
export const OPUS_TIER = 3;

/** 조회 전이면 비워 두고 Opus로 본다. */
export type CostAccount = {
  tier?: number;
  v5Quota?: V5QuotaState;
  /** 다른 계정에 V5 사용량이 남아 그 계정으로 바꿔 생성한다. */
  v5Spare?: boolean;
};

/** 한 장(n_samples 1) 비용. 무료 조건은 따지지 않는다. 식은 NekoAI-JS `calculateCost`, 0단계 실측(512×512·29스텝 6 Anlas)과 맞췄다. */
export function imageAnlasCost(input: {
  width: number;
  height: number;
  steps: number;
  strength?: number;
  smea?: SmeaMode;
}): number {
  let pixels = Math.max(input.width * input.height, 65_536);
  // NovelAI 웹: 832×1216 초과 1024×1024 이하는 832×1216 값.
  if (pixels > 832 * 1216 && pixels <= FREE_MAX_PIXELS) pixels = 832 * 1216;
  const base = Math.ceil(
    2.951823174884865e-6 * pixels + 5.753298233447344e-7 * pixels * input.steps,
  );
  // NovelAI 웹 값
  const smea = input.smea === 'dyn' ? 1.4 : input.smea === 'smea' ? 1.2 : 1;
  return Math.max(Math.ceil(base * smea * (input.strength ?? 1)), 2);
}

/** 종류가 없으면 인페인트(작업 화면의 미리 계산). */
type CostJob = Pick<GenerationJobSnapshot, 'settings' | 'canvasWidth' | 'canvasHeight'> & {
  kind?: GenerationKind;
  strength?: number;
  tool?: AugmentTool;
  aid?: { kind: JobAid['kind'] | 'none'; vibes?: unknown[]; references?: unknown[] };
};

/** 0단계 실측: 무료 조건 안에서도 장당 5 Anlas. NovelAI 문서상 레퍼런스 수만큼 늘어난다(여러 장은 미실측). */
const CHARACTER_REFERENCE_ANLAS = 5;

function characterReferences(job: CostJob): number {
  return job.aid?.kind === 'character' ? (job.aid.references?.length ?? 1) : 0;
}

/** NovelAI 문서: V4 이상에서 4개를 넘는 바이브마다 장당 2 Anlas(미실측). */
const FREE_VIBES = 4;
const EXTRA_VIBE_ANLAS = 2;

function extraVibes(job: CostJob): number {
  return job.aid?.kind === 'vibe' ? Math.max(0, (job.aid.vibes?.length ?? 0) - FREE_VIBES) : 0;
}

/** 배경 제거 실측 832×1216 65 Anlas, 608×832 35 Anlas를 잇는 직선(5 + 면적 비례). 다른 툴은 1024×1024까지 무료였고 넘으면 같은 식으로 어림한다. */
function augmentAnlas(job: CostJob): number {
  const pixels = job.canvasWidth * job.canvasHeight;
  if (job.tool !== 'bg-removal' && pixels <= FREE_MAX_PIXELS) return 0;
  return Math.ceil(5 + (60 * pixels) / (832 * 1216));
}

function isOpus(account?: CostAccount): boolean {
  return account?.tier === undefined || account.tier >= OPUS_TIER;
}

function v5QuotaExhausted(job: CostJob, account?: CostAccount): boolean {
  const quota = account?.v5Quota;
  if (!quota || account.v5Spare || modelInfo(job.settings.model)?.generation !== 'v5') return false;
  return quota.isNegative || quota.percent <= 0;
}

/** V5 무료 생성 할당량이 남은 Opus 계정. 조회 전이면 아니다. */
export function hasV5Quota(account: CostAccount & { valid?: boolean }): boolean {
  const quota = account.v5Quota;
  if (!quota || account.valid === false || !isOpus(account)) return false;
  return !quota.isNegative && quota.percent > 0;
}

/** 이 계정은 V5 할당량이 없어 Anlas가 들지만, 할당량이 남은 Opus 계정이면 무료인 작업. */
export function needsSpareV5Quota(job: CostJob, account?: CostAccount): boolean {
  if (job.kind === 'augment' || !account?.v5Quota || !isOpus(account)) return false;
  return (
    v5QuotaExhausted(job, { ...account, v5Spare: false }) &&
    checkFreeGeneration(job.settings, job.canvasWidth, job.canvasHeight).free
  );
}

/** 무료 조건 안이면 0. */
export function estimateJobAnlas(job: CostJob, account?: CostAccount): number {
  if (job.kind === 'augment') return augmentAnlas(job);
  return (
    diffusionAnlas(job, account) +
    characterReferences(job) * CHARACTER_REFERENCE_ANLAS +
    extraVibes(job) * EXTRA_VIBE_ANLAS
  );
}

function diffusionAnlas(job: CostJob, account?: CostAccount): number {
  const free =
    isOpus(account) &&
    checkFreeGeneration(job.settings, job.canvasWidth, job.canvasHeight).free &&
    !v5QuotaExhausted(job, account);
  return free
    ? 0
    : imageAnlasCost({
        width: job.canvasWidth,
        height: job.canvasHeight,
        steps: job.settings.steps,
        strength: job.kind === 'img2img' ? job.strength : 1,
        smea:
          job.kind === 'txt2img' && supportsV3Sampling(job.settings.model)
            ? job.settings.smea
            : 'off',
      });
}

/** 비어 있으면 모두 무료. */
export function generationCostWarnings(jobs: CostJob[], account?: CostAccount): string[] {
  const warnings = new Set<string>();
  if (jobs.length && !isOpus(account))
    warnings.add('Opus 구독이 아니어서 모든 생성에 Anlas가 듭니다.');
  for (const job of jobs) {
    if (job.kind === 'augment') {
      if (job.tool === 'bg-removal') warnings.add('배경 제거는 Opus여도 Anlas가 듭니다.');
      else if (augmentAnlas(job))
        warnings.add('디렉터 툴 입력이 무료 기준 면적을 넘어 Anlas가 들 수 있습니다.');
      continue;
    }
    if (job.aid?.kind === 'character')
      warnings.add('캐릭터 레퍼런스는 Opus여도 한 장에 레퍼런스마다 5 Anlas가 듭니다.');
    if (extraVibes(job))
      warnings.add('바이브가 4개를 넘으면 넘는 바이브마다 Opus여도 한 장에 2 Anlas가 듭니다.');
    for (const reason of checkFreeGeneration(job.settings, job.canvasWidth, job.canvasHeight)
      .reasons)
      warnings.add(reason);
    if (v5QuotaExhausted(job, account))
      warnings.add('V5 무료 생성 할당량이 소진되어 Anlas가 사용될 수 있습니다.');
  }
  return [...warnings];
}
