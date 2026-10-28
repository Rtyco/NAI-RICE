import type {
  GenerationJobSnapshot,
  GenerationSettings,
  GenerationRecord,
  InpaintJobSnapshot,
  LineFixSettings,
  Project,
  Rect,
} from '../domain/types';
import {
  buildResultInpaintJobs,
  type ImageInput,
  type ResultImg2ImgInput,
} from '../jobs/JobBuilder';
import type { Size } from '../imaging/FreeSize';
import { supportsInpaint } from '../providers/NaiModels';
import { effectiveGenerationSettings } from './defaults';
import { buildRefineJobs, type RefineImageRequest } from './refine';

export type BorderLineRequest = {
  projectId: string;
  source: { kind: 'record'; projectId: string; generationId: string };
  marginPx: number;
};

/** 결과에 64 배수 여백을 더한 입력. `outputRect`는 여백을 뺀 원래 결과 영역이다. */
export type BorderLineInput = {
  image: ImageInput;
  mask: { maskPath: string; maskSha256: string };
  width: number;
  height: number;
  outputRect: Rect;
};

/** 구분선이 없으면 undefined. 메인은 직접, 화면은 IPC로 같은 일을 한다. */
export type PrepareBorderLineInput = (
  request: BorderLineRequest,
) => Promise<BorderLineInput | undefined>;

/** 구분선은 인페인트 모드의 캔버스에서만 생긴다. */
export function autoLineFixOn(project: Pick<Project, 'mode' | 'autoLineFix'>): boolean {
  return project.mode === 'reference' && Boolean(project.autoLineFix);
}

export function lineFixSummary(settings: LineFixSettings): string {
  return `세기 ${settings.strength.toFixed(2)} · 여유 ${settings.marginPx}px`;
}

/** 예상 Anlas용. 입력은 결과(`source`)에 64 배수 여백을 더한 크기다. `generation`은 원본 결과의 설정. */
export function lineFixCostJob(
  settings: LineFixSettings,
  generation: GenerationSettings,
  source: Size,
) {
  const ceil64 = (value: number) => Math.ceil(value / 64) * 64;
  return {
    kind: 'inpaint' as const,
    strength: settings.strength,
    settings: effectiveGenerationSettings({
      ...generation,
      ...(settings.model ? { model: settings.model } : {}),
    }),
    canvasWidth: ceil64(source.width),
    canvasHeight: ceil64(source.height),
  };
}

/** 작업을 만들 때처럼 모르는 모델 ID는 기본 모델로 읽는다. */
export function lineFixModel(
  record: Pick<GenerationRecord, 'settings'>,
  settings: LineFixSettings,
) {
  return effectiveGenerationSettings({
    ...record.settings,
    ...(settings.model ? { model: settings.model } : {}),
  }).model;
}

/** 구분선을 찾지 못했거나 모델이 인페인팅을 못 하는 결과는 `skipped`에 남는다. */
export async function buildLineFixJobs(
  settings: LineFixSettings,
  records: GenerationRecord[],
  names: Pick<ResultImg2ImgInput, 'projectName' | 'outputFilenameTemplate'>,
  prepare: PrepareBorderLineInput,
): Promise<{ jobs: InpaintJobSnapshot[]; skipped: GenerationRecord[] }> {
  const jobs: InpaintJobSnapshot[] = [];
  const skipped: GenerationRecord[] = [];
  for (const record of records) {
    const input = supportsInpaint(lineFixModel(record, settings))
      ? await prepare({
          projectId: record.projectId,
          source: { kind: 'record', projectId: record.projectId, generationId: record.id },
          marginPx: settings.marginPx,
        })
      : undefined;
    if (!input) {
      skipped.push(record);
      continue;
    }
    jobs.push(
      ...buildResultInpaintJobs({
        ...settings,
        ...input,
        record,
        projectName: names.projectName,
        outputFilenameTemplate: names.outputFilenameTemplate,
      }),
    );
  }
  return { jobs, skipped };
}

/** 구분선을 찾은 결과는 지운 결과를 다듬고, 못 찾은 결과는 원본을 바로 다듬는다. */
export async function buildFollowUpJobs(
  job: Pick<GenerationJobSnapshot, 'lineFix' | 'refine' | 'projectName' | 'outputFilenameTemplate'>,
  records: GenerationRecord[],
  inputs: {
    prepareImageInput: (request: RefineImageRequest) => Promise<ImageInput>;
    prepareBorderLineInput: PrepareBorderLineInput;
  },
): Promise<GenerationJobSnapshot[]> {
  const jobs: GenerationJobSnapshot[] = [];
  let rest = records;
  if (job.lineFix) {
    const fixes = await buildLineFixJobs(job.lineFix, records, job, inputs.prepareBorderLineInput);
    jobs.push(...fixes.jobs.map((fix) => (job.refine ? { ...fix, refine: job.refine } : fix)));
    rest = fixes.skipped;
  }
  if (job.refine)
    jobs.push(...(await buildRefineJobs(job.refine, rest, job, inputs.prepareImageInput)));
  return jobs;
}
