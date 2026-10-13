import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type {
  GenerationRecord,
  GenerationJobSnapshot,
  QueueSnapshot,
  QueueView,
  QueuedGenerationJob,
} from '../../src/core/domain/types';
import {
  cancel as cancelJob,
  complete,
  createQueuedJob,
  fail,
  interruptIfRunning,
  isFinished,
  requeueAfterPause,
  resetForRetry,
  restoreQueuedJob,
  startAttempt,
} from '../../src/core/jobs/JobLifecycle';
import { toQueueView } from '../../src/core/jobs/QueueView';
import { NaiApiError } from '../../src/core/providers/NaiErrors';
import { atomicWrite, sha256 } from './fsUtils';
import { saveGenerationOutput } from './GenerationOutput';
import type { GenerationPreview } from '../../src/shared/ipc';
import { ensurePng } from './Images';
import type { GenerationStore, ImageGenerator } from './ports';
import { RequestPacer } from './RequestPacer';
import { VibeEncoder } from './VibeEncoder';

/** `aid`는 캐릭터 레퍼런스 그림들 또는 인코딩할 바이브 원본들. */
type JobInputs = { image?: Buffer; mask?: Buffer; aid?: Buffer[] };

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_FINISHED_KEPT = 300;

type QueueDependencies = {
  persistencePath: string;
  library: GenerationStore;
  provider: ImageGenerator;
  token: () => Promise<string>;
  emit: (view: QueueView) => void;
  onRecord: (record: GenerationRecord) => void;
  /** 조회 실패는 무시한다. */
  anlas?: (token: string) => Promise<number | undefined>;
  /** ms. 요청마다 읽는다. */
  requestDelayMs?: () => number;
  /** 요청마다 읽는다. */
  streaming?: () => boolean;
  onPreview?: (preview: GenerationPreview) => void;
};

/** NovelAI 웹처럼 i2i·인페인트는 세기만큼만 돈다고 본다. 넘치면 화면이 100%로 자른다. */
function previewSteps(job: QueuedGenerationJob): number {
  const strength =
    job.kind === 'img2img'
      ? job.strength
      : job.kind === 'inpaint'
        ? job.settings.inpaintStrength
        : 1;
  return Math.max(1, Math.ceil(job.settings.steps * strength));
}

export class GenerationQueue {
  private snapshot: QueueSnapshot = {
    paused: false,
    updatedAt: new Date(0).toISOString(),
    jobs: [],
  };
  private processing = false;
  private activeController?: AbortController;
  private activeJobId?: string;
  private wakeRetry?: () => void;
  private readonly pacer: RequestPacer;
  private readonly vibes: VibeEncoder;

  constructor(private readonly dependencies: QueueDependencies) {
    this.pacer = new RequestPacer(() => dependencies.requestDelayMs?.() ?? 0);
    this.vibes = new VibeEncoder(dependencies.library, dependencies.provider, this.pacer);
  }

  async initialize(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.dependencies.persistencePath, 'utf8')) as {
        jobs?: unknown[];
      };
      const jobs = (parsed.jobs ?? [])
        .map(restoreQueuedJob)
        .filter((job): job is QueuedGenerationJob => Boolean(job));
      this.snapshot = {
        // 재시작 직후 의도치 않은 생성(Anlas 사용)을 막는다.
        paused: jobs.some((job) => job.status === 'queued'),
        updatedAt: new Date().toISOString(),
        jobs: jobs.map(interruptIfRunning),
      };
    } catch {
      this.snapshot = { paused: false, updatedAt: new Date().toISOString(), jobs: [] };
    }
    await this.commit();
  }

  getSnapshot(): QueueSnapshot {
    return structuredClone(this.snapshot);
  }

  /** `anlasEstimates`는 표시용. */
  async enqueue(jobs: GenerationJobSnapshot[], anlasEstimates?: number[]): Promise<QueueSnapshot> {
    const existing = new Set(this.snapshot.jobs.map((job) => job.id));
    const queued = jobs.map((job, index) => {
      const id = existing.has(job.id) ? `${job.id}-${randomUUID()}` : job.id;
      existing.add(id);
      const item = createQueuedJob(job, id);
      if (anlasEstimates?.[index] !== undefined) item.anlasEstimate = anlasEstimates[index];
      return item;
    });
    this.snapshot.jobs.push(...queued);
    return this.run();
  }

  async pause(): Promise<QueueSnapshot> {
    this.snapshot.paused = true;
    await this.commit();
    return this.getSnapshot();
  }

  resume(): Promise<QueueSnapshot> {
    return this.run();
  }

  async cancel(jobId?: string): Promise<QueueSnapshot> {
    for (const job of this.snapshot.jobs) {
      if (!jobId || job.id === jobId) cancelJob(job);
    }
    if (!jobId || this.activeJobId === jobId) this.stopActive();
    await this.commit();
    return this.getSnapshot();
  }

  retryFailed(): Promise<QueueSnapshot> {
    for (const job of this.snapshot.jobs) resetForRetry(job);
    return this.run();
  }

  async clearFinished(): Promise<QueueSnapshot> {
    this.snapshot.jobs = this.snapshot.jobs.filter((job) => !isFinished(job.status));
    await this.commit();
    return this.getSnapshot();
  }

  /** 작업마다 저장하면 큐 파일을 수천 번 다시 쓰게 되어 한 번만 저장한다. */
  async cancelProject(projectId: string): Promise<void> {
    let touched = false;
    for (const job of this.snapshot.jobs) {
      if (job.projectId !== projectId) continue;
      touched = true;
      if (cancelJob(job) && this.activeJobId === job.id) this.stopActive();
    }
    if (!touched) return;
    // 진행 중인 작업은 처리 루프가 마무리한다.
    this.snapshot.jobs = this.snapshot.jobs.filter(
      (job) => job.projectId !== projectId || job.id === this.activeJobId,
    );
    await this.commit();
  }

  private async run(): Promise<QueueSnapshot> {
    this.snapshot.paused = false;
    await this.commit();
    void this.process();
    return this.getSnapshot();
  }

  private stopActive(): void {
    this.activeController?.abort();
    this.wakeRetry?.();
  }

  /** 큐 파일은 바뀔 때마다 통째로 저장·전송되어 기록이 쌓이면 수십 MB가 된다. 실패·중단은 다시 시도하도록 남긴다. */
  private pruneFinished(): void {
    let kept = 0;
    const drop = new Set<QueuedGenerationJob>();
    for (let i = this.snapshot.jobs.length - 1; i >= 0; i--) {
      const job = this.snapshot.jobs[i];
      if (job.status !== 'completed' && job.status !== 'cancelled') continue;
      if (job.id === this.activeJobId || ++kept <= MAX_FINISHED_KEPT) continue;
      drop.add(job);
    }
    if (drop.size) this.snapshot.jobs = this.snapshot.jobs.filter((job) => !drop.has(job));
  }

  private async commit(): Promise<void> {
    this.pruneFinished();
    this.snapshot.updatedAt = new Date().toISOString();
    await atomicWrite(
      this.dependencies.persistencePath,
      `${JSON.stringify(this.snapshot, null, 2)}\n`,
    );
    this.dependencies.emit(toQueueView(this.snapshot));
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (!this.snapshot.paused) {
        const job = this.snapshot.jobs.find((candidate) => candidate.status === 'queued');
        if (!job) break;
        await this.processJob(job);
      }
    } finally {
      this.processing = false;
    }
  }

  private waitForRetry(delay: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, delay);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wakeRetry = done;
    }).finally(() => {
      this.wakeRetry = undefined;
    });
  }

  /** 등록 뒤 바뀌지 않았는지 해시로 확인한다. */
  private async loadInput(projectId: string, relative: string, hash: string): Promise<Buffer> {
    const file = await fs.readFile(
      await this.dependencies.library.resolveProjectReal(projectId, relative),
    );
    if (sha256(file) !== hash) {
      throw new Error(
        '입력 이미지 또는 마스크가 작업 스냅샷과 일치하지 않습니다. 다시 생성하십시오.',
      );
    }
    return file;
  }

  private async loadInputs(job: QueuedGenerationJob): Promise<JobInputs> {
    const aid =
      job.aid &&
      (await Promise.all(
        (job.aid.kind === 'character' ? job.aid.references : job.aid.vibes).map((file) =>
          this.loadInput(job.projectId, file.imagePath, file.imageSha256),
        ),
      ));
    if (job.kind === 'txt2img') return { aid };
    const image = () => this.loadInput(job.projectId, job.imagePath, job.imageSha256);
    if (job.kind !== 'inpaint') return { image: await image(), aid };
    const [loaded, mask] = await Promise.all([
      image(),
      this.loadInput(job.projectId, job.maskPath, job.maskSha256),
    ]);
    return { image: loaded, mask, aid };
  }

  private anlasNow(token: string): Promise<number | undefined> {
    return this.dependencies.anlas?.(token).catch(() => undefined) ?? Promise.resolve(undefined);
  }

  private async requestImage(
    job: QueuedGenerationJob,
    inputs: JobInputs,
    signal: AbortSignal,
  ): Promise<{ generated: Buffer[]; anlasSpent?: number }> {
    const token = await this.dependencies.token();
    const anlasBefore = await this.anlasNow(token);
    // 인코딩 비용도 이 결과의 Anlas에 들어가도록 전후 조회 사이에서 인코딩한다.
    const aid =
      inputs.aid && job.aid?.kind === 'vibe'
        ? await this.vibes.encodeAll(job.settings, job.aid.vibes, inputs.aid, token, signal)
        : inputs.aid;
    const { onPreview } = this.dependencies;
    const steps = previewSteps(job);
    const generated = await this.pacer.send(signal, () =>
      this.dependencies.provider.generate({
        token,
        job,
        ...inputs,
        aid,
        signal,
        ...(onPreview && this.dependencies.streaming?.()
          ? {
              onPreview: ({ image, step }: { image: Buffer; step: number }) =>
                onPreview({
                  jobId: job.id,
                  dataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
                  step,
                  steps,
                }),
            }
          : {}),
      }),
    );
    const anlasAfter = await this.anlasNow(token);
    const anlasSpent =
      anlasBefore !== undefined && anlasAfter !== undefined
        ? Math.max(0, anlasBefore - anlasAfter)
        : undefined;
    return { generated, anlasSpent };
  }

  private async generateOnce(
    job: QueuedGenerationJob,
    signal: AbortSignal,
  ): Promise<GenerationRecord[]> {
    const inputs = await this.loadInputs(job);
    const { generated, anlasSpent } = await this.requestImage(job, inputs, signal);
    const records: GenerationRecord[] = [];
    for (const [index, received] of generated.entries()) {
      const image = await ensurePng(received);
      records.push(
        await saveGenerationOutput(this.dependencies.library, job, image, anlasSpent, {
          index,
          count: generated.length,
        }),
      );
    }
    return records;
  }

  /** 다시 시도할 수 있고 기다리는 사이 취소·일시 중지가 없었으면 true. */
  private async retryAfterFailure(job: QueuedGenerationJob, error: unknown): Promise<boolean> {
    if (String(job.status) === 'cancelled') {
      await this.commit();
      return false;
    }
    const typed = error instanceof NaiApiError ? error : undefined;
    const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)];
    const retryAt = fail(
      job,
      {
        message: error instanceof Error ? error.message : String(error),
        kind: typed?.kind ?? 'local',
        retryable: typed?.retryable ?? false,
      },
      delay,
    );
    await this.commit();
    if (!retryAt) return false;
    await this.waitForRetry(delay);
    if (String(job.status) === 'cancelled') return false;
    if (!this.snapshot.paused) return true;
    requeueAfterPause(job);
    await this.commit();
    return false;
  }

  private async processJob(job: QueuedGenerationJob): Promise<void> {
    while (job.attempts < job.maxAttempts && job.status !== 'cancelled') {
      startAttempt(job);
      await this.commit();
      const controller = new AbortController();
      this.activeController = controller;
      this.activeJobId = job.id;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const records = await this.generateOnce(job, controller.signal);
        for (const record of records) await this.dependencies.library.addGeneration(record);
        complete(job, { generationId: records[0].id, anlasSpent: records[0].anlasSpent });
        await this.commit();
        for (const record of records) this.dependencies.onRecord(record);
        return;
      } catch (error) {
        // 진행 중 표시를 풀기 전에 기다려야 기다리는 동안에도 취소할 수 있다.
        if (await this.retryAfterFailure(job, error)) continue;
        return;
      } finally {
        clearTimeout(timeout);
        if (this.activeController === controller) {
          this.activeController = undefined;
          this.activeJobId = undefined;
        }
      }
    }
  }
}
