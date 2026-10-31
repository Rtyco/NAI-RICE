import type { GenerationJobSnapshot } from '../domain/types';
import { estimateJobAnlas, type CostAccount } from '../providers/NaiCost';
import { lineFixCostJob } from './lineFix';
import { refineCostJob } from './refine';

/** `batchCost`처럼 구분선 지우기는 찾은 결과만 하니 최대치로 더한다. 인페인트 결과는 결과 영역 크기다. */
export function followUpAnlas(job: GenerationJobSnapshot, account?: CostAccount): number {
  const rect = 'outputRect' in job ? job.outputRect : undefined;
  const source = rect ?? { width: job.canvasWidth, height: job.canvasHeight };
  const lineFix = job.lineFix
    ? estimateJobAnlas(lineFixCostJob(job.lineFix, job.settings, source), account) *
      job.lineFix.count
    : 0;
  const refine = job.refine
    ? estimateJobAnlas(refineCostJob(job.refine, job.settings, source), account) * job.refine.count
    : 0;
  return lineFix + refine;
}
