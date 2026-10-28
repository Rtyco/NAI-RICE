import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  QueueSnapshot,
  QueueView,
  RefineSettings,
  Txt2ImgJobSnapshot,
} from '../../src/core/domain/types';
import { DEFAULT_GENERATION_SETTINGS, DEFAULT_LINE_FIX } from '../../src/core/model/defaults';
import { NaiApiError } from '../../src/core/providers/NaiErrors';
import { GenerationQueue } from '../../electron/services/GenerationQueue';
import { Library } from '../../electron/services/Library';
import { buildFollowUpJobs } from '../../src/core/model/lineFix';
import { AccountService } from '../../electron/services/AccountService';
import type { TokenStore } from '../../electron/services/ports';

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
  async function runningQueue(
    outcomes: Array<Error | 'ok'>,
    followUps?: 'refine' | 'broken',
    result?: Buffer,
  ) {
    root = await mkdtemp(path.join(os.tmpdir(), 'queue-'));
    const library = new Library(root);
    await library.load();
    const png =
      result ??
      (await sharp({
        create: { width: 64, height: 64, channels: 4, background: '#00ff00' },
      })
        .png()
        .toBuffer());
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
      ...(followUps && {
        followUps: async (job, records) => {
          if (followUps === 'broken') throw new Error('입력을 만들지 못함');
          const jobs = await buildFollowUpJobs(job, records, {
            prepareImageInput: (request) => library.prepareImageInput(request),
            prepareBorderLineInput: (request) => library.prepareBorderLineInput(request),
          });
          return { jobs, estimates: [] };
        },
      }),
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

  const refine: RefineSettings = {
    model: 'nai-diffusion-4-5-full-inpainting',
    prompt: 'empty',
    size: { width: 128, height: 128 },
    fit: 'crop',
    strength: 0.3,
    noise: 0,
    count: 1,
    seedMode: 'source',
  };

  it('다듬기 설정이 있는 작업은 끝난 결과를 다음 작업보다 먼저 다듬어', async () => {
    const { queue } = await runningQueue(['ok'], 'refine');
    await queue.enqueue([{ ...textJob('a'), refine }, textJob('b')]);
    await until(() => queue.getSnapshot().jobs.every((item) => item.status === 'completed'));
    // 마지막 저장이 끝나기 전에 임시 폴더를 지우지 않게 한다.
    await queue.pause();
    const jobs = queue.getSnapshot().jobs;
    expect(jobs.map((item) => item.kind)).toEqual(['txt2img', 'img2img', 'txt2img']);
    expect(jobs[1]).toMatchObject({
      sourceRecordId: jobs[0].generationId,
      prompt: '',
      strength: 0.3,
      canvasWidth: 128,
      settings: { model: 'nai-diffusion-4-5-full-inpainting' },
    });
    expect(jobs[1]).not.toHaveProperty('refine');
  });

  it('구분선 지우기가 있으면 선을 찾은 결과를 먼저 지우고, 지운 결과를 다듬어', async () => {
    const lined = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: { create: { width: 4, height: 64, channels: 3, background: '#000000' } },
          left: 2,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const { queue } = await runningQueue(['ok'], 'refine', lined);
    const lineFix = { ...DEFAULT_LINE_FIX, count: 1 };
    await queue.enqueue([{ ...textJob('a'), lineFix, refine }, textJob('b')]);
    await until(
      () => queue.getSnapshot().jobs.every((item) => item.status === 'completed'),
      15_000,
    );
    await queue.pause();
    const jobs = queue.getSnapshot().jobs;
    expect(jobs.map((item) => item.kind)).toEqual(['txt2img', 'inpaint', 'img2img', 'txt2img']);
    expect(jobs[1]).toMatchObject({
      sourceRecordId: jobs[0].generationId,
      outputRect: { x: 0, y: 0, width: 64, height: 64 },
      refine,
    });
    expect(jobs[1]).not.toHaveProperty('lineFix');
    expect(jobs[2]).toMatchObject({ sourceRecordId: jobs[1].generationId });
  }, 20_000);

  it('구분선이 없으면 원본을 바로 다듬어', async () => {
    const { queue } = await runningQueue(['ok'], 'refine');
    await queue.enqueue([{ ...textJob('a'), lineFix: DEFAULT_LINE_FIX, refine }]);
    // 원본이 끝난 뒤 다듬기가 붙기 전에도 모두 완료로 보인다.
    await until(() => {
      const jobs = queue.getSnapshot().jobs;
      return jobs.length === 2 && jobs.every((item) => item.status === 'completed');
    }, 15_000);
    await queue.pause();
    const jobs = queue.getSnapshot().jobs;
    expect(jobs.map((item) => item.kind)).toEqual(['txt2img', 'img2img']);
    expect(jobs[1]).toMatchObject({ sourceRecordId: jobs[0].generationId });
  }, 20_000);

  it('다듬기 작업을 만들지 못해도 원본은 완료로 두고 다음 작업으로 넘어가', async () => {
    const { queue } = await runningQueue(['ok'], 'broken');
    await queue.enqueue([{ ...textJob('a'), refine }, textJob('b')]);
    await until(() => queue.getSnapshot().jobs.every((item) => item.status === 'completed'));
    // 마지막 저장이 끝나기 전에 임시 폴더를 지우지 않게 한다.
    await queue.pause();
    expect(queue.getSnapshot().jobs.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('첫 계정의 V5 할당량이 바닥나면 다음 요청부터 다음 계정으로 하나씩 생성해', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'queue-'));
    const library = new Library(root);
    await library.load();
    const png = await sharp({
      create: { width: 64, height: 64, channels: 4, background: '#00ff00' },
    })
      .png()
      .toBuffer();
    // 토큰마다 남은 V5 할당량(%). 생성할 때마다 1씩 쓴다.
    const quota = new Map([
      ['first', 1],
      ['second', 50],
    ]);
    let activeId = 'a0';
    const items = [
      { id: 'a0', name: '본계정', token: 'first' },
      { id: 'a1', name: '부계정', token: 'second' },
    ];
    const vault: TokenStore = {
      getStatus: async () => ({ stored: true, secureStorageAvailable: true }),
      accounts: async () => ({ activeId, accounts: items.map(({ id, name }) => ({ id, name })) }),
      read: async (id) => items.find((item) => item.id === (id ?? activeId))!.token,
      add: async () => '',
      rename: async () => undefined,
      setActive: async (id) => void (activeId = id),
      remove: async () => undefined,
    };
    const account = new AccountService(
      vault,
      {
        validateToken: async (token) => ({
          valid: true,
          tier: 3,
          anlas: 100,
          v5Quota: { percent: quota.get(token)!, isNegative: false, timeUntilNextPercent: 0 },
        }),
      },
      () => undefined,
      () => true,
    );
    await account.validateStored();
    const used: string[] = [];
    let running = 0;
    let overlapped = false;
    const queue = new GenerationQueue({
      persistencePath: path.join(root, 'queue.json'),
      library,
      provider: {
        generate: async (request) => {
          overlapped ||= running > 0;
          running += 1;
          used.push(request.token);
          quota.set(request.token, quota.get(request.token)! - 1);
          await new Promise((resolve) => setTimeout(resolve, 10));
          running -= 1;
          return [png];
        },
      },
      token: (job) => account.tokenFor(job),
      anlas: async (token) => (await account.refresh(token))?.anlas,
      emit: () => undefined,
      onRecord: () => undefined,
    });
    await queue.initialize();
    const v5 = (id: string): Txt2ImgJobSnapshot => ({
      ...textJob(id),
      settings: { ...DEFAULT_GENERATION_SETTINGS, model: 'nai-diffusion-5-curated', steps: 28 },
    });
    await queue.enqueue([v5('a'), v5('b'), v5('c')]);
    await until(
      () => queue.getSnapshot().jobs.every((item) => item.status === 'completed'),
      15_000,
    );
    await queue.pause();
    expect(used).toEqual(['first', 'second', 'second']);
    expect(overlapped).toBe(false);
    expect(activeId).toBe('a1');
  }, 20_000);
});
