import type { Emotion, LineFixSettings } from '../domain/types';
import type { Size } from '../imaging/FreeSize';
import { sceneSize } from '../jobs/JobBuilder';
import { estimateJobAnlas, generationCostWarnings, type CostAccount } from '../providers/NaiCost';
import { effectiveGenerationSettings, type projectAid, type ResolvedProject } from './defaults';
import { autoLineFixOn, lineFixCostJob } from './lineFix';
import { projectRefineSettings, refineCostJob } from './refine';
import { comboCount } from './sceneCombos';

type CostItem = { job: Parameters<typeof estimateJobAnlas>[0]; images: number };

/** 메인 프로세스가 큐에 넣을 때와 같은 식. 일반 생성은 씬 크기가 씬마다 다를 수 있다. */
export function batchCost(
  resolved: ResolvedProject,
  scenes: Emotion[],
  aid: ReturnType<typeof projectAid>,
  account: CostAccount,
  lineFixSettings: LineFixSettings,
): { estimate?: number; reasons: string[] } {
  const { project, preset, reference } = resolved;
  const variants = preset?.generation.variantsPerEmotion ?? 1;
  const generation = preset && effectiveGenerationSettings(preset.generation);
  const costJob =
    project.mode !== 'reference'
      ? generation && {
          kind: project.mode,
          settings: generation,
          canvasWidth: generation.width,
          canvasHeight: generation.height,
          aid,
        }
      : generation && reference?.image
        ? {
            settings: generation,
            canvasWidth: reference.image.canvasWidth,
            canvasHeight: reference.image.canvasHeight,
            aid,
          }
        : undefined;
  if (!costJob) return { reasons: [] };
  const sceneCosts: CostItem[] = scenes.map((emotion) => {
    const size = project.mode === 'txt2img' && sceneSize(emotion, costJob.settings);
    return {
      job: size ? { ...costJob, canvasWidth: size.width, canvasHeight: size.height } : costJob,
      images: comboCount(emotion) * variants,
    };
  });
  const images = sceneCosts.reduce((total, item) => total + item.images, 0);
  const area = project.mode === 'reference' ? reference?.image?.outputRect : undefined;
  /** 결과마다 이어 붙는 작업. 인페인트 결과는 잘라 낸 결과 영역 크기다. */
  const followUps = (count: number, job: (source: Size) => CostItem['job']): CostItem[] =>
    sceneCosts.map((item) => ({
      job: job({
        width: area?.width ?? item.job.canvasWidth,
        height: area?.height ?? item.job.canvasHeight,
      }),
      images: item.images * count,
    }));
  const refine = project.autoRefine && projectRefineSettings(project, preset, reference);
  // 구분선을 찾은 결과만 지우니 최대치로 더한다.
  const lineFix = autoLineFixOn(project) && lineFixSettings;
  const costs = [
    ...sceneCosts,
    ...(lineFix
      ? followUps(lineFix.count, (source) => lineFixCostJob(lineFix, costJob.settings, source))
      : []),
    ...(refine
      ? followUps(refine.count, (source) => refineCostJob(refine, costJob.settings, source))
      : []),
  ];
  return {
    estimate: images
      ? costs.reduce((total, item) => total + estimateJobAnlas(item.job, account) * item.images, 0)
      : undefined,
    reasons: generationCostWarnings(
      costs.length ? costs.map((item) => item.job) : [costJob],
      account,
    ),
  };
}
