import { describe, expect, it } from 'vitest';
import { QueueNotifier, type QueueDone } from '../../electron/services/QueueNotifier';
import type { JobStatus, QueueView } from '../../src/core/domain/types';

const view = (statuses: Array<[string, JobStatus]>, paused = false) =>
  ({ paused, jobs: statuses.map(([id, status]) => ({ id, status })) }) as unknown as QueueView;

function setup() {
  const progress: Array<number | null> = [];
  const done: QueueDone[] = [];
  const notifier = new QueueNotifier({
    progress: (value) => progress.push(value),
    finished: (value) => done.push(value),
  });
  return { notifier, progress, done };
}

describe('큐 완료 알림', () => {
  it('묶음 진행률을 보내고, 다 끝나면 지우고 완료·실패 수를 알린다', () => {
    const { notifier, progress, done } = setup();
    notifier.update(view([['old', 'completed']]));
    expect(progress).toEqual([]);
    notifier.update(
      view([
        ['old', 'completed'],
        ['a', 'generating'],
        ['b', 'queued'],
      ]),
    );
    notifier.update(
      view([
        ['a', 'completed'],
        ['b', 'generating'],
        ['c', 'queued'],
      ]),
    );
    notifier.update(
      view([
        ['a', 'completed'],
        ['b', 'failed'],
        ['c', 'completed'],
      ]),
    );
    expect(progress).toEqual([0, 1 / 3, null]);
    expect(done).toEqual([{ completed: 2, failed: 1 }]);
  });

  it('모두 취소하면 알리지 않는다', () => {
    const { notifier, done } = setup();
    notifier.update(view([['a', 'queued']]));
    notifier.update(view([['a', 'cancelled']]));
    expect(done).toEqual([]);
  });
});
