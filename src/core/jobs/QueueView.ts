import type { QueuedGenerationJob, QueueJobView, QueueSnapshot, QueueView } from '../domain/types';
import { isActive } from './JobLifecycle';

/** 모델이나 크기를 바꾸면 걸리는 시간도 바뀌어 최근 작업만 센다. */
const RECENT_JOBS = 10;

type TimedJob = Pick<
  QueuedGenerationJob,
  'status' | 'startedAt' | 'completedAt' | 'lineFix' | 'refine'
>;

/** 최대치: 구분선 지우기는 선을 찾은 결과만 하고, 지운 결과마다 다듬기가 붙는다. */
function followUpCount(job: TimedJob): number {
  const refine = job.refine?.count ?? 0;
  return job.lineFix ? job.lineFix.count * (1 + refine) : refine;
}

/** ms. 원본이 끝나야 큐에 붙는 다듬기·구분선 지우기도 센다. */
export function estimateRemainingMs(jobs: TimedJob[], now: number): number | undefined {
  const recent = jobs
    .flatMap((job) =>
      job.status === 'completed' && job.startedAt && job.completedAt
        ? [{ start: Date.parse(job.startedAt), end: Date.parse(job.completedAt) }]
        : [],
    )
    .sort((a, b) => a.end - b.end)
    .slice(-RECENT_JOBS);
  if (!recent.length) return undefined;
  const average =
    recent.reduce((sum, { start, end }) => sum + Math.max(0, end - start), 0) / recent.length;
  return jobs.reduce((total, job) => {
    if (!isActive(job.status)) return total;
    const elapsed =
      job.status === 'generating' && job.startedAt
        ? Math.max(0, now - Date.parse(job.startedAt))
        : 0;
    return total + (1 + followUpCount(job)) * average - Math.min(elapsed, average);
  }, 0);
}

/** 큐는 바뀔 때마다 전체를 보내 화면이 쓰지 않는 프롬프트·설정·입력 경로를 뺀다(300개 기준 약 1.6MB → 160KB). */
export function toQueueView(snapshot: QueueSnapshot, now = Date.now()): QueueView {
  return {
    paused: snapshot.paused,
    updatedAt: snapshot.updatedAt,
    remainingMs: estimateRemainingMs(snapshot.jobs, now),
    jobs: snapshot.jobs.map((job): QueueJobView => ({
      id: job.id,
      kind: job.kind,
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
      anlasEstimate: job.anlasEstimate,
    })),
  };
}
