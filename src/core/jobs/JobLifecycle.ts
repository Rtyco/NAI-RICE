import type { GenerationJobSnapshot, JobStatus, QueuedGenerationJob } from '../domain/types';

/** 허용하지 않은 상태 변화는 오류로 막는다. 큐는 상태를 직접 바꾸지 않는다. */

const MAX_ATTEMPTS = 4;

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['generating', 'cancelled'],
  generating: ['completed', 'failed', 'retry_wait', 'cancelled', 'interrupted'],
  retry_wait: ['generating', 'queued', 'cancelled', 'interrupted'],
  // 취소 직후 이미 받은 응답이 저장되면 완료로 남긴다(Anlas는 이미 쓰였다).
  cancelled: ['completed'],
  failed: ['queued'],
  interrupted: ['queued'],
  completed: [],
};

export function isActive(status: JobStatus): boolean {
  return status === 'queued' || status === 'generating' || status === 'retry_wait';
}

export function isFinished(status: JobStatus): boolean {
  return !isActive(status);
}

/** 취소한 작업은 되살리지 않는다(지난 일괄 생성이 통째로 다시 돈다). */
export function canRetry(status: JobStatus): boolean {
  return status === 'failed' || status === 'interrupted';
}

function move(
  job: QueuedGenerationJob,
  to: JobStatus,
  patch: Partial<QueuedGenerationJob> = {},
): void {
  if (!TRANSITIONS[job.status].includes(to)) {
    throw new Error(`작업 상태를 ${job.status}에서 ${to}(으)로 바꿀 수 없습니다.`);
  }
  Object.assign(job, patch, { status: to });
}

const CLEARED_ERROR = { error: undefined, errorKind: undefined, retryable: undefined };

/** kind가 없는 예전 작업은 인페인트로 읽고, 필요한 입력 경로가 없으면 버린다. */
export function restoreQueuedJob(value: unknown): QueuedGenerationJob | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const job = { ...raw, kind: raw.kind ?? 'inpaint' } as QueuedGenerationJob;
  const text = (key: string) => typeof raw[key] === 'string';
  if (!text('id') || !text('projectId') || !text('status')) return undefined;
  switch (job.kind) {
    case 'txt2img':
      return job;
    // 마스크가 없는 인페인트도 남겨 두고 생성할 때 입력 확인에서 실패시킨다.
    case 'inpaint':
    case 'img2img':
    case 'augment':
      return text('imagePath') ? job : undefined;
    default:
      return undefined;
  }
}

export function createQueuedJob(snapshot: GenerationJobSnapshot, id: string): QueuedGenerationJob {
  return {
    ...structuredClone(snapshot),
    id,
    status: 'queued',
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
  };
}

export function startAttempt(job: QueuedGenerationJob, now = new Date()): void {
  move(job, 'generating', {
    attempts: job.attempts + 1,
    startedAt: now.toISOString(),
    nextAttemptAt: undefined,
  });
}

export function complete(
  job: QueuedGenerationJob,
  result: { generationId: string; anlasSpent?: number },
  now = new Date(),
): void {
  move(job, 'completed', {
    ...CLEARED_ERROR,
    completedAt: now.toISOString(),
    generationId: result.generationId,
    anlasSpent: result.anlasSpent,
  });
}

export type JobFailure = { message: string; kind: string; retryable: boolean };

/** 다시 시도할 수 있으면 대기 시각을 돌려준다. */
export function fail(
  job: QueuedGenerationJob,
  failure: JobFailure,
  retryDelayMs: number,
  now = Date.now(),
): Date | undefined {
  const patch = { error: failure.message, errorKind: failure.kind, retryable: failure.retryable };
  if (failure.retryable && job.attempts < job.maxAttempts) {
    const nextAttempt = new Date(now + retryDelayMs);
    move(job, 'retry_wait', { ...patch, nextAttemptAt: nextAttempt.toISOString() });
    return nextAttempt;
  }
  move(job, failure.kind === 'cancelled' ? 'cancelled' : 'failed', patch);
  return undefined;
}

export function cancel(job: QueuedGenerationJob): boolean {
  if (!isActive(job.status)) return false;
  move(job, 'cancelled', { error: '사용자가 작업을 취소했습니다.' });
  return true;
}

export function requeueAfterPause(job: QueuedGenerationJob): void {
  move(job, 'queued');
}

export function interruptIfRunning(job: QueuedGenerationJob): QueuedGenerationJob {
  if (job.status !== 'generating' && job.status !== 'retry_wait') return job;
  const copy = { ...job };
  move(copy, 'interrupted', { error: '앱 종료로 작업이 중단되었습니다.', retryable: true });
  return copy;
}

export function resetForRetry(job: QueuedGenerationJob): boolean {
  if (!canRetry(job.status)) return false;
  move(job, 'queued', { ...CLEARED_ERROR, attempts: 0, nextAttemptAt: undefined });
  return true;
}
