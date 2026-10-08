import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { QueueSnapshot, QueueView } from '../../src/core/domain/types';
import { GenerationQueue } from '../../electron/services/GenerationQueue';

let root: string;
afterEach(() => rm(root, { recursive: true, force: true }));

const job = (id: string, projectId: string, status: string) => ({
  id,
  projectId,
  imagePath: 'inputs/image.png',
  status,
  attempts: 1,
  maxAttempts: 4,
});

async function queueWith(jobs: unknown[]) {
  root = await mkdtemp(path.join(os.tmpdir(), 'queue-'));
  const persistencePath = path.join(root, 'queue.json');
  await writeFile(persistencePath, JSON.stringify({ paused: false, jobs }));
  const emitted: QueueView[] = [];
  const queue = new GenerationQueue({
    persistencePath,
    library: {} as never,
    provider: {} as never,
    token: async () => 'token',
    emit: (snapshot) => emitted.push(snapshot),
    onRecord: () => undefined,
  });
  await queue.initialize();
  return { queue, emitted, persistencePath };
}

describe('GenerationQueue', () => {
  it('keeps only the newest 300 completed or cancelled jobs, and every failed one', async () => {
    const jobs = [
      job('failed-old', 'a', 'failed'),
      ...Array.from({ length: 400 }, (_, i) =>
        job(`done-${i}`, 'a', i % 2 ? 'completed' : 'cancelled'),
      ),
    ];
    const { queue } = await queueWith(jobs);
    const ids = queue.getSnapshot().jobs.map((item) => item.id);
    expect(ids).toHaveLength(301);
    expect(ids[0]).toBe('failed-old');
    expect(ids[1]).toBe('done-100');
    expect(ids.at(-1)).toBe('done-399');
  });

  it('removes a deleted project in one save and cancels its waiting jobs', async () => {
    const jobs = [
      ...Array.from({ length: 50 }, (_, i) => job(`a-${i}`, 'a', 'completed')),
      job('a-waiting', 'a', 'queued'),
      job('b-1', 'b', 'completed'),
    ];
    const { queue, emitted, persistencePath } = await queueWith(jobs);
    emitted.length = 0;
    await queue.cancelProject('a');
    expect(emitted).toHaveLength(1);
    expect(queue.getSnapshot().jobs.map((item) => item.id)).toEqual(['b-1']);
    const saved = JSON.parse(await readFile(persistencePath, 'utf8')) as QueueSnapshot;
    expect(saved.jobs.map((item) => item.id)).toEqual(['b-1']);
  });

  it('sends the screen jobs without prompts or settings', async () => {
    const heavy = {
      ...job('b-1', 'b', 'queued'),
      prompt: 'x'.repeat(5000),
      negativePrompt: 'lowres',
      settings: { model: 'nai-diffusion-4-5-full' },
      imagePath: 'inputs/a.png',
    };
    const { emitted } = await queueWith([heavy]);
    const [sent] = emitted.at(-1)!.jobs;
    expect(sent).toMatchObject({ id: 'b-1', projectId: 'b', status: 'queued', attempts: 1 });
    expect(sent).not.toHaveProperty('prompt');
    expect(sent).not.toHaveProperty('settings');
    expect(sent).not.toHaveProperty('imagePath');
  });

  it('does not save when the project has no jobs', async () => {
    const { queue, emitted } = await queueWith([job('b-1', 'b', 'completed')]);
    emitted.length = 0;
    await queue.cancelProject('a');
    expect(emitted).toHaveLength(0);
  });
});
