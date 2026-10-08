import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type {
  GenerationRecord,
  InpaintJobSnapshot,
  QueueSnapshot,
  QueueView,
  QueuedInpaintJob,
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
  startAttempt,
} from '../../src/core/jobs/JobLifecycle';
import { toQueueView } from '../../src/core/jobs/QueueView';
import { NaiApiError } from '../../src/core/providers/NaiErrors';
import { atomicWrite, sha256 } from './fsUtils';
import { saveGenerationOutput } from './GenerationOutput';
import type { GenerationStore, ImageGenerator } from './ports';

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const REQUEST_TIMEOUT_MS = 180_000;
/** 큐 목록에 남겨 두는 완료·취소 기록 수. */
const MAX_FINISHED_KEPT = 300;

type QueueDependencies = {
  persistencePath: string;
  library: GenerationStore;
  provider: ImageGenerator;
  token: () => Promise<string>;
  emit: (view: QueueView) => void;
  onRecord: (record: GenerationRecord) => void;
  /** 생성 전후 Anlas를 비교해 실제 차감량을 기록한다. 조회 실패는 무시한다. */
  anlas?: (token: string) => Promise<number | undefined>;
  /** 연속 요청 사이에 둘 간격(ms). 설정에서 바꾸면 다음 요청부터 반영된다. */
  requestDelayMs?: () => number;
};

function isQueuedJob(value: unknown): value is QueuedInpaintJob {
  const job = value as Partial<QueuedInpaintJob>;
  return (
    typeof job?.id === 'string' &&
    typeof job.projectId === 'string' &&
    typeof job.imagePath === 'string' &&
    typeof job.status === 'string'
  );
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
  private lastRequestAt = 0;

  constructor(private readonly dependencies: QueueDependencies) {}

  async initialize(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.dependencies.persistencePath, 'utf8')) as {
        jobs?: unknown[];
      };
      const jobs = (parsed.jobs ?? []).filter(isQueuedJob);
      this.snapshot = {
        // 재시작 직후 의도치 않은 생성(Anlas 사용)을 막기 위해 일시 중지 상태로 복원한다.
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

  async enqueue(jobs: InpaintJobSnapshot[]): Promise<QueueSnapshot> {
    const existing = new Set(this.snapshot.jobs.map((job) => job.id));
    const queued = jobs.map((job) => {
      const id = existing.has(job.id) ? `${job.id}-${randomUUID()}` : job.id;
      existing.add(id);
      return createQueuedJob(job, id);
    });
    this.snapshot.jobs.push(...queued);
    this.snapshot.paused = false;
    await this.commit();
    void this.process();
    return this.getSnapshot();
  }

  async pause(): Promise<QueueSnapshot> {
    this.snapshot.paused = true;
    await this.commit();
    return this.getSnapshot();
  }

  async resume(): Promise<QueueSnapshot> {
    this.snapshot.paused = false;
    await this.commit();
    void this.process();
    return this.getSnapshot();
  }

  async cancel(jobId?: string): Promise<QueueSnapshot> {
    for (const job of this.snapshot.jobs) {
      if (!jobId || job.id === jobId) cancelJob(job);
    }
    if (!jobId || this.activeJobId === jobId) {
      this.activeController?.abort();
      this.wakeRetry?.();
    }
    await this.commit();
    return this.getSnapshot();
  }

  async retryFailed(): Promise<QueueSnapshot> {
    for (const job of this.snapshot.jobs) resetForRetry(job);
    this.snapshot.paused = false;
    await this.commit();
    void this.process();
    return this.getSnapshot();
  }

  async clearFinished(): Promise<QueueSnapshot> {
    this.snapshot.jobs = this.snapshot.jobs.filter((job) => !isFinished(job.status));
    await this.commit();
    return this.getSnapshot();
  }

  /**
   * 작업이 삭제되면 그 작업의 대기 작업을 취소하고, 끝난 기록도 목록에서 뺀다.
   * 작업마다 따로 저장하면 기록이 많을 때 큐 파일을 수천 번 다시 쓰게 되므로 한 번만 저장한다.
   */
  async cancelProject(projectId: string): Promise<void> {
    let touched = false;
    for (const job of this.snapshot.jobs) {
      if (job.projectId !== projectId) continue;
      touched = true;
      if (cancelJob(job) && this.activeJobId === job.id) {
        this.activeController?.abort();
        this.wakeRetry?.();
      }
    }
    if (!touched) return;
    // 진행 중이던 작업은 처리 루프가 마무리할 수 있게 남긴다.
    this.snapshot.jobs = this.snapshot.jobs.filter(
      (job) => job.projectId !== projectId || job.id === this.activeJobId,
    );
    await this.commit();
  }

  /**
   * 완료·취소된 기록은 최근 것만 남긴다. 큐 파일은 상태가 바뀔 때마다 통째로 저장되고 화면에도
   * 보내지므로, 기록이 쌓이면 생성할 때마다 수십 MB를 다시 쓰게 된다. 실패·중단은 다시 시도할 수
   * 있게 모두 남긴다.
   */
  private pruneFinished(): void {
    let kept = 0;
    const drop = new Set<QueuedInpaintJob>();
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
      const wake = () => done();
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wakeRetry = wake;
    }).finally(() => {
      this.wakeRetry = undefined;
    });
  }

  /** 이전 요청이 끝난 뒤 설정한 간격이 지나지 않았으면 남은 시간만큼 기다린다. 취소하면 바로 끝낸다. */
  private waitRequestDelay(signal: AbortSignal): Promise<void> {
    const delay = Math.max(0, Math.min(1000, this.dependencies.requestDelayMs?.() ?? 0));
    const remaining = this.lastRequestAt + delay - Date.now();
    if (remaining <= 0 || signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(finish, remaining);
      signal.addEventListener('abort', finish, { once: true });
      function finish() {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      }
    });
  }

  /** 작업 스냅샷의 입력 파일을 읽고, 등록 뒤에 바뀌지 않았는지 해시로 확인한다. */
  private async loadInputs(job: QueuedInpaintJob): Promise<{ image: Buffer; mask: Buffer }> {
    const { library } = this.dependencies;
    const [imagePath, maskPath] = await Promise.all([
      library.resolveProjectReal(job.projectId, job.imagePath),
      library.resolveProjectReal(job.projectId, job.maskPath),
    ]);
    const [image, mask] = await Promise.all([fs.readFile(imagePath), fs.readFile(maskPath)]);
    if (sha256(image) !== job.imageSha256 || sha256(mask) !== job.maskSha256) {
      throw new Error(
        '입력 이미지 또는 마스크가 작업 스냅샷과 일치하지 않습니다. 다시 생성하십시오.',
      );
    }
    return { image, mask };
  }

  /** 요청 간격을 지켜 이미지를 생성하고, 전후 Anlas를 비교해 실제 차감량을 구한다. */
  private async requestImage(
    job: QueuedInpaintJob,
    inputs: { image: Buffer; mask: Buffer },
    signal: AbortSignal,
  ): Promise<{ generated: Buffer; anlasSpent?: number }> {
    const token = await this.dependencies.token();
    const anlasBefore = await this.dependencies.anlas?.(token).catch(() => undefined);
    await this.waitRequestDelay(signal);
    this.lastRequestAt = Date.now();
    const generated = await this.dependencies.provider.generate({
      token,
      prompt: job.prompt,
      negativePrompt: job.negativePrompt,
      characterPrompt: job.characterPrompt,
      characterNegativePrompt: job.characterNegativePrompt,
      image: inputs.image,
      mask: inputs.mask,
      width: job.canvasWidth,
      height: job.canvasHeight,
      seed: job.seed,
      settings: job.settings,
      signal,
    });
    // 간격은 응답을 받은 시점부터 센다.
    this.lastRequestAt = Date.now();
    const anlasAfter = await this.dependencies.anlas?.(token).catch(() => undefined);
    const anlasSpent =
      anlasBefore !== undefined && anlasAfter !== undefined
        ? Math.max(0, anlasBefore - anlasAfter)
        : undefined;
    return { generated, anlasSpent };
  }

  private async generateOnce(
    job: QueuedInpaintJob,
    signal: AbortSignal,
  ): Promise<GenerationRecord> {
    const inputs = await this.loadInputs(job);
    const { generated, anlasSpent } = await this.requestImage(job, inputs, signal);
    return saveGenerationOutput(this.dependencies.library, job, generated, anlasSpent);
  }

  private async processJob(job: QueuedInpaintJob): Promise<void> {
    while (job.attempts < job.maxAttempts && job.status !== 'cancelled') {
      startAttempt(job);
      await this.commit();
      const controller = new AbortController();
      this.activeController = controller;
      this.activeJobId = job.id;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const record = await this.generateOnce(job, controller.signal);
        await this.dependencies.library.addGeneration(record);
        complete(job, { generationId: record.id, anlasSpent: record.anlasSpent });
        await this.commit();
        this.dependencies.onRecord(record);
        return;
      } catch (error) {
        if (String(job.status) === 'cancelled') {
          await this.commit();
          return;
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
        if (!retryAt) return;
        await this.waitForRetry(delay);
        if (String(job.status) === 'cancelled') return;
        if (this.snapshot.paused) {
          requeueAfterPause(job);
          await this.commit();
          return;
        }
        continue;
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
