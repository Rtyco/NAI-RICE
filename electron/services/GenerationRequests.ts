import type { InpaintJobSnapshot, QueueSnapshot } from '../../src/core/domain/types';
import { toQueueView } from '../../src/core/jobs/QueueView';
import { generationCostWarnings } from '../../src/core/providers/NaiCost';
import { generationEnqueueRequestSchema } from '../../src/core/validation/schemas';
import type { GenerationEnqueueResult, TokenStatus } from '../../src/shared/ipc';

/** Anlas가 쓰일 수 있을 때 사용자에게 묻는다. 계속하면 true. */
export type CostConfirmation = (jobCount: number, warnings: string[]) => Promise<boolean>;

type Queue = {
  enqueue(jobs: InpaintJobSnapshot[]): Promise<QueueSnapshot>;
  getSnapshot(): QueueSnapshot;
};

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
  ) {}

  async enqueue(request: unknown): Promise<GenerationEnqueueResult> {
    const parsed = generationEnqueueRequestSchema.safeParse(request);
    if (!parsed.success) throw new Error('생성 작업 형식이 올바르지 않습니다.');
    const jobs = parsed.data.jobs as InpaintJobSnapshot[];
    const warnings = generationCostWarnings(jobs, this.account.latest?.v5Quota);
    if (warnings.length && !(await this.confirmCost(jobs.length, warnings)))
      return { cancelled: true, snapshot: toQueueView(this.queue.getSnapshot()) };
    // 토큰이 없으면 큐에 넣기 전에 알린다.
    await this.account.token();
    return { cancelled: false, snapshot: toQueueView(await this.queue.enqueue(jobs)) };
  }
}
