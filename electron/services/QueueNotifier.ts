import type { QueueView } from '../../src/core/domain/types';
import { isActive } from '../../src/core/jobs/JobLifecycle';

export type QueueDone = { completed: number; failed: number };

type Effects = {
  /** 0~1, null이면 지운다. */
  progress(value: number | null, paused: boolean): void;
  finished(done: QueueDone): void;
};

/** 큐가 빈 뒤 처음 들어온 작업부터 다시 빌 때까지(이어 붙은 다듬기 포함)를 한 묶음으로 센다. */
export class QueueNotifier {
  private readonly batch = new Set<string>();

  constructor(private readonly effects: Effects) {}

  update(view: Pick<QueueView, 'paused' | 'jobs'>): void {
    const active = view.jobs.filter((job) => isActive(job.status));
    for (const job of active) this.batch.add(job.id);
    if (!this.batch.size) return;
    if (active.length) {
      this.effects.progress((this.batch.size - active.length) / this.batch.size, view.paused);
      return;
    }
    const finished = view.jobs.filter((job) => this.batch.has(job.id));
    this.batch.clear();
    this.effects.progress(null, false);
    const completed = finished.filter((job) => job.status === 'completed').length;
    const failed = finished.filter((job) => job.status === 'failed').length;
    if (completed || failed) this.effects.finished({ completed, failed });
  }
}
