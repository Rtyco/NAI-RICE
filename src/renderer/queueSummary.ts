import type { QueueView } from '../core/domain/types';
import { isActive, isFinished } from '../core/jobs/JobLifecycle';
import { queueApi } from './desktop';
import { run, useStore } from './store';

export const STATUS: Record<string, string> = {
  queued: '대기',
  generating: '생성 중',
  retry_wait: '재시도 대기',
  completed: '완료',
  failed: '실패',
  cancelled: '취소',
  interrupted: '중단',
};

const update = (label: string, action: () => Promise<QueueView>) =>
  run(label, async () => useStore.setState({ queue: await action() }));

/** 생성 큐 막대와 떠 있는 창이 함께 쓴다. */
export const queueCommands = {
  resume: () => update('큐를 재개하는 중', () => queueApi().resumeQueue()),
  pause: () => update('큐를 일시 중지하는 중', () => queueApi().pauseQueue()),
  retryFailed: () => update('재시도를 등록하는 중', () => queueApi().retryFailed()),
  cancel: (jobId: string) => update('작업을 취소하는 중', () => queueApi().cancelQueue(jobId)),
  cancelAll: () => update('모두 취소하는 중', () => queueApi().cancelQueue()),
  clearFinished: () => update('정리하는 중', () => queueApi().clearFinished()),
};

export function summarizeQueue(queue: QueueView) {
  const active = queue.jobs.filter((job) => isActive(job.status));
  const current = queue.jobs.find(
    (job) => job.status === 'generating' || job.status === 'retry_wait',
  );
  const failed = queue.jobs.filter(
    (job) => job.status === 'failed' || job.status === 'interrupted',
  ).length;
  const finished = queue.jobs.filter((job) => isFinished(job.status)).length;
  const status = current
    ? `${STATUS[current.status]}: ${current.projectName} · ${current.emotionName}`
    : queue.paused && active.length
      ? '일시 중지됨'
      : active.length
        ? '대기 중'
        : '대기 없음';
  return { active, current, failed, finished, status };
}
