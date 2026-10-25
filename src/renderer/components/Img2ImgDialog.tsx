import { useState } from 'react';
import type { GenerationSummary, RefineSettings } from '../../core/domain/types';
import { FREE_PROJECT_ID, normalizeGenerationSettings } from '../../core/model/defaults';
import { defaultRefineSettings, refineCostJob } from '../../core/model/refine';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { sendResultsToImg2Img } from '../actions';
import { projectMedia, resolveFreeGeneration, updateProject, useLibrary, useStore } from '../store';
import { Modal } from './Dialogs';
import { RefineFields } from './RefineFields';

export function Img2ImgDialog(props: {
  projectId: string;
  records: GenerationSummary[];
  close: () => void;
}) {
  const library = useLibrary();
  const token = useStore((state) => state.token);
  const project = library.projects.find((item) => item.id === props.projectId);
  const preset =
    props.projectId === FREE_PROJECT_ID
      ? resolveFreeGeneration(library).preset
      : library.presets.find((item) => item.id === project?.presetId);
  const generation = normalizeGenerationSettings(
    preset?.generation ?? library.presets[0].generation,
  );
  const first = props.records[0];
  const [options, setOptions] = useState<RefineSettings>(
    () => project?.refine ?? defaultRefineSettings(generation, first),
  );
  const total = props.records.length * options.count;
  // 기록 목록에는 Steps가 없어 생성 설정 값으로 어림한다. 큐에 넣을 때 다시 계산된다.
  const costJobs = props.records.map((record) =>
    refineCostJob(options, { ...generation, model: record.model }, record),
  );
  const estimate =
    costJobs.reduce((sum, job) => sum + estimateJobAnlas(job, token), 0) * options.count;
  const reasons = generationCostWarnings(costJobs, token);

  const submit = () => {
    props.close();
    if (project) updateProject(project.id, (current) => ({ ...current, refine: options }));
    void sendResultsToImg2Img(props.projectId, props.records, options);
  };

  return (
    <Modal
      title={props.records.length > 1 ? `결과 ${props.records.length}장 다듬기` : '다듬기'}
      onClose={props.close}
      wide
      footer={
        <>
          <span
            className="hint"
            title={[...reasons, '예상값이며 실제 차감량과 다를 수 있습니다.'].join('\n')}
          >
            {estimate ? `예상 약 ${estimate.toLocaleString()} Anlas` : '예상 0 Anlas'}
          </span>
          <button onClick={props.close}>취소</button>
          <button className="accent" onClick={submit}>
            {total}장 생성
          </button>
        </>
      }
    >
      <div className="i2i-sources">
        {props.records.slice(0, 12).map((record) => (
          <figure key={record.id}>
            <img src={projectMedia(props.projectId, record.thumbFile ?? record.file)} alt="" />
            <figcaption>
              {record.emotionName || `seed ${record.seed}`} · {record.width}×{record.height}
            </figcaption>
          </figure>
        ))}
        {props.records.length > 12 && <p className="hint">외 {props.records.length - 12}장</p>}
      </div>
      <RefineFields value={options} sources={props.records} onChange={setOptions} />
      {project && <p className="hint">이 작업의 다듬기 설정으로 저장됩니다.</p>}
    </Modal>
  );
}
