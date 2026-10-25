import type {
  GenerationRecord,
  Img2ImgJobSnapshot,
  JobSnapshotCommon,
} from '../../src/core/domain/types';
import { buildResultImg2ImgJobs } from '../../src/core/jobs/JobBuilder';
import { refineTarget } from '../../src/core/model/refine';
import type { ImageInputRequest, PreparedImage } from '../../src/shared/ipc';

type ImageInputs = { prepareImageInput(request: ImageInputRequest): Promise<PreparedImage> };

/** 끝난 결과마다 그 작업의 다듬기 설정으로 다듬기 작업을 만든다. */
export async function refineJobs(
  inputs: ImageInputs,
  job: Pick<JobSnapshotCommon, 'refine' | 'projectName' | 'outputFilenameTemplate'>,
  records: GenerationRecord[],
): Promise<Img2ImgJobSnapshot[]> {
  if (!job.refine) return [];
  const { size, fit, ...options } = job.refine;
  const jobs: Img2ImgJobSnapshot[] = [];
  for (const record of records) {
    const target = refineTarget(size, record.width, record.height);
    const image = await inputs.prepareImageInput({
      projectId: record.projectId,
      source: { kind: 'record', projectId: record.projectId, generationId: record.id },
      ...target,
      fit,
    });
    jobs.push(
      ...buildResultImg2ImgJobs({
        record,
        image,
        ...options,
        ...target,
        projectName: job.projectName,
        outputFilenameTemplate: job.outputFilenameTemplate,
      }),
    );
  }
  return jobs;
}
