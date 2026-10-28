import { useState } from 'react';
import type { GenerationSummary, RefineSettings } from '../../core/domain/types';
import { FREE_PROJECT_ID } from '../../core/model/defaults';
import { defaultRefineSettings, refineCostJob } from '../../core/model/refine';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { sendResultsToImg2Img } from '../actions';
import {
  resultGeneration,
  updateFreeGeneration,
  updateProject,
  useLibrary,
  useStore,
} from '../store';
import { Modal } from './Dialogs';
import { CostEstimate, ResultThumbs } from './ResultDialogParts';
import { RefineFields } from './RefineFields';

export function Img2ImgDialog(props: {
  projectId: string;
  records: GenerationSummary[];
  close: () => void;
}) {
  const library = useLibrary();
  const token = useStore((state) => state.token);
  const project = library.projects.find((item) => item.id === props.projectId);
  const free = props.projectId === FREE_PROJECT_ID ? library.freeGeneration : undefined;
  const saved = project ?? free;
  const generation = resultGeneration(library, props.projectId);
  const first = props.records[0];
  const [options, setOptions] = useState<RefineSettings>(
    () => saved?.refine ?? defaultRefineSettings(generation, first),
  );
  const [autoRefine, setAutoRefine] = useState(Boolean(saved?.autoRefine));
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
    if (project)
      updateProject(project.id, (current) => ({ ...current, refine: options, autoRefine }));
    else if (free) updateFreeGeneration({ refine: options, autoRefine });
    void sendResultsToImg2Img(props.projectId, props.records, options);
  };

  return (
    <Modal
      title={props.records.length > 1 ? `결과 ${props.records.length}장 다듬기` : '다듬기'}
      onClose={props.close}
      wide
      footer={
        <>
          <CostEstimate estimate={estimate} reasons={reasons} />
          <button onClick={props.close}>취소</button>
          <button className="accent" onClick={submit}>
            {total}장 생성
          </button>
        </>
      }
    >
      <ResultThumbs projectId={props.projectId} records={props.records} />
      <RefineFields value={options} sources={props.records} onChange={setOptions} />
      {saved && (
        <>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={autoRefine}
              onChange={(event) => setAutoRefine(event.target.checked)}
            />
            <span>{project ? '씬을 생성할 때마다' : '생성할 때마다'} 자동으로 다듬기</span>
          </label>
          <p className="hint">{project ? '이 작업' : '자유 생성'}의 다듬기 설정으로 저장됩니다.</p>
        </>
      )}
    </Modal>
  );
}
