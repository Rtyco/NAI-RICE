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
import { vibeCacheKey } from '../../src/core/providers/NovelAIRequestBuilder';
import { atomicWrite, sha256 } from './fsUtils';
import { saveGenerationOutput } from './GenerationOutput';
import type { GenerationStore, ImageGenerator } from './ports';

/** 작업 입력 파일. `aid`는 캐릭터 레퍼런스 그림이거나 바이브로 인코딩할 원본 그림이다. */
type JobInputs = { image?: Buffer; mask?: Buffer; aid?: Buffer };

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
      const jobs = (parsed.jobs ?? [])
        .map(restoreQueuedJob)
        .filter((job): job is QueuedGenerationJob => Boolean(job));
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

  /** `anlasEstimates`는 작업마다 메인 프로세스가 계산한 예상 Anlas다(화면 표시용). */
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

  /**
   * 작업이 삭제되면 그 작업의 대기 작업을 취소하고, 끝난 기록도 목록에서 뺀다.
   * 작업마다 따로 저장하면 기록이 많을 때 큐 파일을 수천 번 다시 쓰게 되므로 한 번만 저장한다.
   */
  async cancelProject(projectId: string): Promise<void> {
    let touched = false;
    for (const job of this.snapshot.jobs) {
      if (job.projectId !== projectId) continue;
      touched = true;
      if (cancelJob(job) && this.activeJobId === job.id) this.stopActive();
    }
    if (!touched) return;
    // 진행 중이던 작업은 처리 루프가 마무리할 수 있게 남긴다.
    this.snapshot.jobs = this.snapshot.jobs.filter(
      (job) => job.projectId !== projectId || job.id === this.activeJobId,
    );
    await this.commit();
  }

  /** 일시 중지를 풀고 저장한 뒤, 처리 루프가 돌고 있지 않으면 시작한다. */
  private async run(): Promise<QueueSnapshot> {
    this.snapshot.paused = false;
    await this.commit();
    void this.process();
    return this.getSnapshot();
  }

  /** 진행 중인 요청을 끊고, 다시 시도를 기다리는 중이면 바로 깨운다. */
  private stopActive(): void {
    this.activeController?.abort();
    this.wakeRetry?.();
  }

  /**
   * 완료·취소된 기록은 최근 것만 남긴다. 큐 파일은 상태가 바뀔 때마다 통째로 저장되고 화면에도
   * 보내지므로, 기록이 쌓이면 생성할 때마다 수십 MB를 다시 쓰게 된다. 실패·중단은 다시 시도할 수
   * 있게 모두 남긴다.
   */
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

  /** 입력 파일 하나를 읽고, 등록 뒤에 바뀌지 않았는지 해시로 확인한다. */
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
    const aid = job.aid
      ? await this.loadInput(job.projectId, job.aid.imagePath, job.aid.imageSha256)
      : undefined;
    if (job.kind === 'txt2img') return { aid };
    const image = () => this.loadInput(job.projectId, job.imagePath, job.imageSha256);
    if (job.kind !== 'inpaint') return { image: await image(), aid };
    const [loaded, mask] = await Promise.all([
      image(),
      this.loadInput(job.projectId, job.maskPath, job.maskSha256),
    ]);
    return { image: loaded, mask, aid };
  }

  /**
   * 바이브 인코딩 결과. 같은 그림·모델·추출량으로 인코딩한 적이 있으면 그것을 쓰고, 없으면 인코딩해(2 Anlas)
   * 저장해 둔다. 인코딩도 생성처럼 요청 간격을 지킨다.
   */
  private async vibeFor(
    job: QueuedGenerationJob,
    source: Buffer,
    token: string,
    signal: AbortSignal,
  ): Promise<Buffer> {
    const aid = job.aid;
    if (aid?.kind !== 'vibe') return source;
    const key = vibeCacheKey(aid.imageSha256, job.settings, aid.informationExtracted);
    const cached = await this.dependencies.library.readVibe(key);
    if (cached) return cached;
    const encode = this.dependencies.provider.encodeVibe;
    if (!encode) throw new Error('바이브를 인코딩할 수 없습니다.');
    await this.waitRequestDelay(signal);
    this.lastRequestAt = Date.now();
    const encoded = await encode.call(this.dependencies.provider, {
      token,
      image: source,
      settings: job.settings,
      informationExtracted: aid.informationExtracted,
      signal,
    });
    this.lastRequestAt = Date.now();
    await this.dependencies.library.writeVibe(key, encoded);
    return encoded;
  }

  /** 지금 Anlas. 조회하지 않거나 실패하면 undefined다. */
  private anlasNow(token: string): Promise<number | undefined> {
    return this.dependencies.anlas?.(token).catch(() => undefined) ?? Promise.resolve(undefined);
  }

  /** 요청 간격을 지켜 이미지를 생성하고, 전후 Anlas를 비교해 실제 차감량을 구한다. */
  private async requestImage(
    job: QueuedGenerationJob,
    inputs: JobInputs,
    signal: AbortSignal,
  ): Promise<{ generated: Buffer[]; anlasSpent?: number }> {
    const token = await this.dependencies.token();
    const anlasBefore = await this.anlasNow(token);
    // 바이브 인코딩 비용도 이 결과의 사용 Anlas에 들어가도록 전후 조회 사이에서 인코딩한다.
    const aid = inputs.aid && (await this.vibeFor(job, inputs.aid, token, signal));
    await this.waitRequestDelay(signal);
    this.lastRequestAt = Date.now();
    const generated = await this.dependencies.provider.generate({
      token,
      job,
      ...inputs,
      aid,
      signal,
    });
    // 간격은 응답을 받은 시점부터 센다.
    this.lastRequestAt = Date.now();
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
    for (const [index, image] of generated.entries()) {
      records.push(
        await saveGenerationOutput(this.dependencies.library, job, image, anlasSpent, {
          index,
          count: generated.length,
        }),
      );
    }
    return records;
  }

  /**
   * 실패를 기록한다. 다시 시도할 수 있는 오류면 정해진 시간만큼 기다린 뒤, 그사이 취소나 일시 중지가
   * 없었으면 true를 돌려준다.
   */
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
        // 다시 시도를 기다리는 동안에도 취소할 수 있게, 진행 중 표시를 풀기 전에 기다린다.
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
