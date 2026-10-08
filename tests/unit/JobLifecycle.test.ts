import { describe, expect, it } from 'vitest';
import type { InpaintJobSnapshot, QueuedInpaintJob } from '../../src/core/domain/types';
import {
  cancel,
  complete,
  createQueuedJob,
  fail,
  interruptIfRunning,
  isFinished,
  requeueAfterPause,
  resetForRetry,
  startAttempt,
} from '../../src/core/jobs/JobLifecycle';

const queued = (): QueuedInpaintJob => createQueuedJob({ id: 'job' } as InpaintJobSnapshot, 'job');

const retryable = { message: '서버 오류', kind: 'server', retryable: true };

describe('JobLifecycle', () => {
  it('대기 → 생성 → 완료로 가며 시도 횟수와 오류를 정리해', () => {
    const job = queued();
    startAttempt(job);
    expect(job).toMatchObject({ status: 'generating', attempts: 1 });
    complete(job, { generationId: 'g1', anlasSpent: 2 });
    expect(job).toMatchObject({ status: 'completed', generationId: 'g1', error: undefined });
    expect(isFinished(job.status)).toBe(true);
  });

  it('재시도할 수 있는 실패는 대기 시각을 정하고, 횟수를 다 쓰면 실패로 끝내', () => {
    const job = queued();
    for (let attempt = 1; attempt < job.maxAttempts; attempt += 1) {
      startAttempt(job);
      expect(fail(job, retryable, 1_000, 0)?.getTime()).toBe(1_000);
      expect(job.status).toBe('retry_wait');
    }
    startAttempt(job);
    expect(fail(job, retryable, 1_000)).toBeUndefined();
    expect(job).toMatchObject({ status: 'failed', error: '서버 오류' });
  });

  it('취소는 진행 중인 작업에만 적용하고 다시 시도로 되살려', () => {
    const job = queued();
    expect(cancel(job)).toBe(true);
    expect(cancel(job)).toBe(false);
    expect(resetForRetry(job)).toBe(true);
    expect(job).toMatchObject({ status: 'queued', attempts: 0, error: undefined });
  });

  it('일시 중지와 앱 종료를 처리해', () => {
    const job = queued();
    startAttempt(job);
    fail(job, retryable, 1_000);
    requeueAfterPause(job);
    expect(job.status).toBe('queued');
    startAttempt(job);
    const restored = interruptIfRunning(job);
    expect(restored.status).toBe('interrupted');
    expect(job.status).toBe('generating');
  });

  it('허용하지 않은 상태 변화는 막아', () => {
    const job = queued();
    expect(() => complete(job, { generationId: 'g' })).toThrow();
    startAttempt(job);
    complete(job, { generationId: 'g' });
    expect(() => startAttempt(job)).toThrow();
    expect(resetForRetry(job)).toBe(false);
  });
});
