import type { QueueJobView, QueueSnapshot, QueueView } from '../domain/types';

/**
 * 화면에 보낼 큐. 큐는 상태가 바뀔 때마다 화면에 전체를 보내는데, 작업마다 들어 있는 프롬프트·설정·입력
 * 경로는 화면이 쓰지 않아 빼고 보낸다(작업 300개 기준 약 1.6MB → 160KB).
 */
export function toQueueView(snapshot: QueueSnapshot): QueueView {
  return {
    paused: snapshot.paused,
    updatedAt: snapshot.updatedAt,
    jobs: snapshot.jobs.map((job): QueueJobView => ({
      id: job.id,
      createdAt: job.createdAt,
      projectId: job.projectId,
      projectName: job.projectName,
      characterName: job.characterName,
      emotionId: job.emotionId,
      emotionName: job.emotionName,
      seed: job.seed,
      variantIndex: job.variantIndex,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      errorKind: job.errorKind,
      retryable: job.retryable,
      generationId: job.generationId,
      anlasSpent: job.anlasSpent,
    })),
  };
}
