import type { GenerationJobSnapshot, QueueSnapshot } from '../../src/core/domain/types';
import { toQueueView } from '../../src/core/jobs/QueueView';
import { estimateJobAnlas } from '../../src/core/providers/NaiCost';
import { encodedOnlyMessage, vibeCacheKey } from '../../src/core/providers/NovelAIRequestBuilder';
import { generationEnqueueRequestSchema } from '../../src/core/validation/schemas';
import type { GenerationEnqueueResult, TokenStatus } from '../../src/shared/ipc';

type Queue = {
  enqueue(jobs: GenerationJobSnapshot[], anlasEstimates?: number[]): Promise<QueueSnapshot>;
};

/** 없으면 인코딩 비용을 따지지 않는다. */
type VibeStore = { readVibe(key: string): Promise<Buffer | undefined> };

/** 0단계 실측. 같은 그림·모델이면 캐시해 처음 한 번만 든다. */
const VIBE_ENCODE_ANLAS = 2;

type Account = {
  readonly latest: TokenStatus | undefined;
  token(): Promise<string>;
};

/** 렌더러를 믿지 않아 작업을 스키마로 확인하고 예상 Anlas도 직접 계산한다. */
export class GenerationRequests {
  constructor(
    private readonly queue: Queue,
    private readonly account: Account,
    private readonly vibes?: VibeStore,
  ) {}

  /** 작업 순서 → 처음 인코딩하는 바이브 수 */
  private async vibeEncodes(jobs: GenerationJobSnapshot[]): Promise<Map<number, number>> {
    const first = new Map<string, { index: number; encodedOnly?: string }>();
    jobs.forEach((job, index) => {
      if (job.aid?.kind !== 'vibe') return;
      for (const vibe of job.aid.vibes) {
        const key = vibeCacheKey(
          vibe.encodingId ?? vibe.imageSha256,
          job.settings,
          vibe.informationExtracted,
        );
        if (!first.has(key))
          first.set(key, { index, ...(vibe.encodingId ? { encodedOnly: vibe.name } : {}) });
      }
    });
    const encodes = new Map<number, number>();
    for (const [key, { index, encodedOnly }] of first) {
      if (!this.vibes || (await this.vibes.readVibe(key))) continue;
      // 인코딩만 있는 바이브는 원본이 없어 다시 인코딩할 수 없다.
      if (encodedOnly) throw new Error(encodedOnlyMessage(encodedOnly));
      encodes.set(index, (encodes.get(index) ?? 0) + 1);
    }
    return encodes;
  }

  async enqueue(request: unknown): Promise<GenerationEnqueueResult> {
    const parsed = generationEnqueueRequestSchema.safeParse(request);
    if (!parsed.success) throw new Error('생성 작업 형식이 올바르지 않습니다.');
    const jobs = parsed.data.jobs as GenerationJobSnapshot[];
    const account = this.account.latest;
    const encodes = await this.vibeEncodes(jobs);
    const estimates = jobs.map(
      (job, index) =>
        estimateJobAnlas(job, account) + (encodes.get(index) ?? 0) * VIBE_ENCODE_ANLAS,
    );
    await this.account.token();
    return { snapshot: toQueueView(await this.queue.enqueue(jobs, estimates)) };
  }
}
