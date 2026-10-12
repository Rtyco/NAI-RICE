import type { GenerationJobSnapshot, QueueSnapshot } from '../../src/core/domain/types';
import { toQueueView } from '../../src/core/jobs/QueueView';
import { estimateJobAnlas, generationCostWarnings } from '../../src/core/providers/NaiCost';
import { vibeCacheKey } from '../../src/core/providers/NovelAIRequestBuilder';
import { generationEnqueueRequestSchema } from '../../src/core/validation/schemas';
import type { GenerationEnqueueResult, TokenStatus } from '../../src/shared/ipc';

export type CostEstimate = { paidJobs: number; anlas: number };

/** Anlas가 쓰일 수 있을 때 사용자에게 묻는다. 계속하면 true. */
export type CostConfirmation = (
  jobCount: number,
  warnings: string[],
  estimate: CostEstimate,
) => Promise<boolean>;

type Queue = {
  enqueue(jobs: GenerationJobSnapshot[], anlasEstimates?: number[]): Promise<QueueSnapshot>;
  getSnapshot(): QueueSnapshot;
};

/** 바이브 인코딩 결과를 둔 곳. 없으면 인코딩 비용을 따지지 않는다. */
type VibeStore = { readVibe(key: string): Promise<Buffer | undefined> };

/** 0단계 실측: 바이브 인코딩 한 번에 2 Anlas. 같은 그림·모델이면 다시 쓰므로 처음 한 번만 든다. */
const VIBE_ENCODE_ANLAS = 2;

type Account = {
  readonly latest: TokenStatus | undefined;
  token(): Promise<string>;
};

/**
 * 렌더러의 생성 요청을 받아 검증하고 큐에 넣는다. 렌더러는 믿지 않는다:
 * 작업 형식을 스키마로 확인하고, Anlas 경고도 작업 내용과 마지막 계정 상태로 직접 계산한다.
 */
export class GenerationRequests {
  constructor(
    private readonly queue: Queue,
    private readonly account: Account,
    private readonly confirmCost: CostConfirmation,
    private readonly vibes?: VibeStore,
  ) {}

  /** 작업 순서별로, 아직 인코딩하지 않은 바이브를 처음 쓰는 수. 그 작업에 인코딩 비용을 더한다. */
  private async vibeEncodes(jobs: GenerationJobSnapshot[]): Promise<Map<number, number>> {
    const first = new Map<string, number>();
    jobs.forEach((job, index) => {
      if (job.aid?.kind !== 'vibe') return;
      for (const vibe of job.aid.vibes) {
        const key = vibeCacheKey(vibe.imageSha256, job.settings, vibe.informationExtracted);
        if (!first.has(key)) first.set(key, index);
      }
    });
    const encodes = new Map<number, number>();
    for (const [key, index] of first)
      if (this.vibes && !(await this.vibes.readVibe(key)))
        encodes.set(index, (encodes.get(index) ?? 0) + 1);
    return encodes;
  }

  async enqueue(request: unknown): Promise<GenerationEnqueueResult> {
    const parsed = generationEnqueueRequestSchema.safeParse(request);
    if (!parsed.success) throw new Error('생성 작업 형식이 올바르지 않습니다.');
    const jobs = parsed.data.jobs as GenerationJobSnapshot[];
    const account = this.account.latest;
    const warnings = generationCostWarnings(jobs, account);
    const encodes = await this.vibeEncodes(jobs);
    const encodeCount = [...encodes.values()].reduce((sum, count) => sum + count, 0);
    if (encodeCount)
      warnings.push(
        `바이브 ${encodeCount}개를 이 그림·모델로 처음 써서 인코딩에 바이브마다 2 Anlas가 듭니다(다음부터는 다시 씁니다).`,
      );
    const estimates = jobs.map(
      (job, index) =>
        estimateJobAnlas(job, account) + (encodes.get(index) ?? 0) * VIBE_ENCODE_ANLAS,
    );
    const estimate = {
      paidJobs: estimates.filter((anlas) => anlas > 0).length,
      anlas: estimates.reduce((sum, anlas) => sum + anlas, 0),
    };
    if (warnings.length && !(await this.confirmCost(jobs.length, warnings, estimate)))
      return { cancelled: true, snapshot: toQueueView(this.queue.getSnapshot()) };
    // 토큰이 없으면 큐에 넣기 전에 알린다.
    await this.account.token();
    return { cancelled: false, snapshot: toQueueView(await this.queue.enqueue(jobs, estimates)) };
  }
}
