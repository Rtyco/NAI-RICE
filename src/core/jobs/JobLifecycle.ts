import type { InpaintJobSnapshot, JobStatus, QueuedInpaintJob } from '../domain/types';

/**
 * 생성 작업의 상태 변화를 한곳에 모은다. 큐는 상태 문자열을 직접 바꾸지 않고 여기의 함수만 부른다.
 * 허용하지 않은 변화는 오류로 막아, 상태가 꼬이는 버그가 조용히 넘어가지 않게 한다.
 */

const MAX_ATTEMPTS = 4;

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['generating', 'cancelled'],
  generating: ['completed', 'failed', 'retry_wait', 'cancelled', 'interrupted'],
  retry_wait: ['generating', 'queued', 'cancelled', 'interrupted'],
  // 취소 직후 이미 받은 응답이 저장되면 완료로 남긴다(Anlas는 이미 쓰였다).
  cancelled: ['queued', 'completed'],
  failed: ['queued'],
  interrupted: ['queued'],
  completed: [],
};

/** 아직 끝나지 않아 취소할 수 있는 상태. */
export function isActive(status: JobStatus): boolean {
  return status === 'queued' || status === 'generating' || status === 'retry_wait';
}

/** 큐 목록에서 정리해도 되는 상태. */
export function isFinished(status: JobStatus): boolean {
  return !isActive(status);
}

/** "실패 다시 시도"로 되살릴 수 있는 상태. */
export function canRetry(status: JobStatus): boolean {
  return TRANSITIONS[status].includes('queued') && status !== 'retry_wait';
}

function move(job: QueuedInpaintJob, to: JobStatus, patch: Partial<QueuedInpaintJob> = {}): void {
  if (!TRANSITIONS[job.status].includes(to)) {
    throw new Error(`작업 상태를 ${job.status}에서 ${to}(으)로 바꿀 수 없습니다.`);
  }
  Object.assign(job, patch, { status: to });
}

const CLEARED_ERROR = { error: undefined, errorKind: undefined, retryable: undefined };

/** 렌더러가 만든 작업을 큐에 넣을 모양으로 만든다. */
export function createQueuedJob(snapshot: InpaintJobSnapshot, id: string): QueuedInpaintJob {
  return {
    ...structuredClone(snapshot),
    id,
    status: 'queued',
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
  };
}

export function startAttempt(job: QueuedInpaintJob, now = new Date()): void {
  move(job, 'generating', {
    attempts: job.attempts + 1,
    startedAt: now.toISOString(),
    nextAttemptAt: undefined,
  });
}

export function complete(
  job: QueuedInpaintJob,
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

/** 실패를 기록한다. 다시 시도할 수 있고 횟수가 남았으면 대기 시각을 돌려준다. */
export function fail(
  job: QueuedInpaintJob,
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

export function cancel(job: QueuedInpaintJob): boolean {
  if (!isActive(job.status)) return false;
  move(job, 'cancelled', { error: '사용자가 작업을 취소했습니다.' });
  return true;
}

/** 재시도 대기 중에 큐가 일시 중지되면 대기열로 되돌린다. */
export function requeueAfterPause(job: QueuedInpaintJob): void {
  move(job, 'queued');
}

/** 앱이 꺼져 끝나지 못한 작업. 재시작하면 이렇게 표시한다. */
export function interruptIfRunning(job: QueuedInpaintJob): QueuedInpaintJob {
  if (job.status !== 'generating' && job.status !== 'retry_wait') return job;
  const copy = { ...job };
  move(copy, 'interrupted', { error: '앱 종료로 작업이 중단되었습니다.', retryable: true });
  return copy;
}

/** 실패·취소·중단된 작업을 처음부터 다시 대기열에 넣는다. */
export function resetForRetry(job: QueuedInpaintJob): boolean {
  if (!canRetry(job.status)) return false;
  move(job, 'queued', { ...CLEARED_ERROR, attempts: 0, nextAttemptAt: undefined });
  return true;
}
