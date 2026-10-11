import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { QueueSnapshot, QueueView, Txt2ImgJobSnapshot } from '../../src/core/domain/types';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/core/model/defaults';
import { NaiApiError } from '../../src/core/providers/NaiErrors';
import { GenerationQueue } from '../../electron/services/GenerationQueue';
import { Library } from '../../electron/services/Library';

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

  it('reads jobs saved before generation kinds as inpaint and drops jobs it cannot run', async () => {
    const { queue } = await queueWith([
      job('old', 'a', 'completed'),
      { id: 'text', projectId: 'a', kind: 'txt2img', status: 'completed' },
      { id: 'i2i-without-image', projectId: 'a', kind: 'img2img', status: 'completed' },
      { id: 'unknown', projectId: 'a', kind: 'video', imagePath: 'x.png', status: 'completed' },
    ]);
    const jobs = queue.getSnapshot().jobs;
    expect(jobs.map((item) => [item.id, item.kind])).toEqual([
      ['old', 'inpaint'],
      ['text', 'txt2img'],
    ]);
  });

  it('does not save when the project has no jobs', async () => {
    const { queue, emitted } = await queueWith([job('b-1', 'b', 'completed')]);
    emitted.length = 0;
    await queue.cancelProject('a');
    expect(emitted).toHaveLength(0);
  });
});

describe('GenerationQueue 실패 처리', () => {
  const textJob = (id: string): Txt2ImgJobSnapshot => ({
    kind: 'txt2img',
    id,
    createdAt: new Date().toISOString(),
    projectId: 'project-a',
    projectName: '작업',
    characterName: '아리아',
    emotionId: 'e1',
    emotionName: '기쁨',
    emotionPrompt: 'smile',
    presetName: 'P',
    promptSetName: '기본',
    emotionSetName: '감정',
    referenceName: '',
    prompt: '1girl',
    negativePrompt: '',
    characterPrompt: '',
    characterNegativePrompt: '',
    source: { commonPositive: '1girl', commonNegative: '', characterPositive: '' },
    seed: 1,
    variantIndex: 1,
    canvasWidth: 64,
    canvasHeight: 64,
    outputFilenameTemplate: '',
    settings: { ...DEFAULT_GENERATION_SETTINGS },
    warnings: [],
  });

  /** 실제 작업 폴더에 결과를 쓰는 큐. `outcomes`를 앞에서부터 하나씩 돌려준다(오류면 던진다). */
  async function runningQueue(outcomes: Array<Error | 'ok'>) {
    root = await mkdtemp(path.join(os.tmpdir(), 'queue-'));
    const library = new Library(root);
    await library.load();
    const png = await sharp({
      create: { width: 64, height: 64, channels: 4, background: '#00ff00' },
    })
      .png()
      .toBuffer();
    let calls = 0;
    const queue = new GenerationQueue({
      persistencePath: path.join(root, 'queue.json'),
      library,
      provider: {
        generate: async () => {
          const outcome = outcomes[Math.min(calls, outcomes.length - 1)];
          calls += 1;
          if (outcome instanceof Error) throw outcome;
          return [png];
        },
      },
      token: async () => 'token',
      emit: () => undefined,
      onRecord: () => undefined,
    });
    await queue.initialize();
    const job = () => queue.getSnapshot().jobs[0];
    return { queue, job, calls: () => calls };
  }

  async function until(condition: () => boolean, timeoutMs = 5_000) {
    const started = Date.now();
    while (!condition()) {
      if (Date.now() - started > timeoutMs) throw new Error('시간 안에 상태가 바뀌지 않았습니다.');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  const serverError = () => new NaiApiError('server', '잠시 오류');

  it('다시 시도할 수 있는 오류는 기다렸다가 다시 보내 완료해', async () => {
    const { queue, job, calls } = await runningQueue([serverError(), 'ok']);
    await queue.enqueue([textJob('a')]);
    await until(() => job().status === 'completed');
    expect(calls()).toBe(2);
    expect(job().attempts).toBe(2);
  }, 10_000);

  it('다시 시도할 수 없는 오류는 한 번에 실패로 끝내', async () => {
    const { queue, job, calls } = await runningQueue([
      new NaiApiError('unsupported-request', '잘못된 요청'),
    ]);
    await queue.enqueue([textJob('a')]);
    await until(() => job().status === 'failed');
    expect(calls()).toBe(1);
  });

  it('다시 시도를 기다리는 중에 취소하면 바로 멈추고 더 보내지 않아', async () => {
    const { queue, job, calls } = await runningQueue([serverError()]);
    await queue.enqueue([textJob('a')]);
    await until(() => job().status === 'retry_wait');
    await queue.cancel('a');
    expect(job().status).toBe('cancelled');
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(calls()).toBe(1);
  }, 10_000);

  it('다시 시도를 기다리는 중에 일시 중지하면 대기 상태로 돌려 두고 보내지 않아', async () => {
    const { queue, job, calls } = await runningQueue([serverError(), 'ok']);
    await queue.enqueue([textJob('a')]);
    await until(() => job().status === 'retry_wait');
    await queue.pause();
    await until(() => job().status === 'queued');
    expect(calls()).toBe(1);
    await queue.resume();
    await until(() => job().status === 'completed');
    expect(calls()).toBe(2);
  }, 10_000);
});
