import { useState } from 'react';
import type { GenerationSummary, LineFixSettings } from '../../core/domain/types';
import { normalizeGenerationSettings } from '../../core/model/defaults';
import { lineFixCostJob } from '../../core/model/lineFix';
import { REFINE_PROMPT_OPTIONS } from '../../core/model/refine';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { INPAINT_MODELS, modelLabel, supportsInpaint } from '../../core/providers/NaiModels';
import { fixBorderLines } from '../actions';
import { resultGeneration, updateLibrary, useLibrary, useStore } from '../store';
import { Modal } from './Dialogs';
import { CostEstimate, ResultThumbs } from './ResultDialogParts';
import { CustomPromptFields } from './RefineFields';
import { NumberField, SelectField } from './ui';

const saveLineFix = (value: LineFixSettings) =>
  updateLibrary((current) => ({
    ...current,
    settings: { ...current.settings, lineFix: value },
  }));

export function LineFixFields(props: {
  value: LineFixSettings;
  onChange: (value: LineFixSettings) => void;
}) {
  const { value } = props;
  const patch = (next: Partial<LineFixSettings>) => props.onChange({ ...value, ...next });
  return (
    <>
      <div className="four-column-fields">
        <SelectField
          label="모델"
          value={value.model}
          options={[
            { value: '', label: '원본과 같은 모델' },
            ...INPAINT_MODELS.map((model) => ({ value: model.id, label: model.label })),
          ]}
          onChange={(model) => patch({ model })}
        />
        <SelectField
          label="프롬프트"
          value={value.prompt}
          options={REFINE_PROMPT_OPTIONS}
          onChange={(prompt) => patch({ prompt })}
        />
        <NumberField
          label="세기 (Strength)"
          value={value.strength}
          min={0.01}
          max={1}
          step={0.05}
          onChange={(strength) => patch({ strength })}
        />
        <NumberField
          label="마스크 여유"
          value={value.marginPx}
          min={0}
          max={32}
          integer
          suffix="px"
          onChange={(marginPx) => patch({ marginPx })}
        />
      </div>
      {value.prompt === 'custom' && (
        <CustomPromptFields value={value} title="구분선 지우기" onChange={patch} />
      )}
      <div className="four-column-fields">
        <NumberField
          label="결과마다 장수"
          value={value.count}
          min={1}
          max={10}
          integer
          onChange={(count) => patch({ count })}
        />
        <SelectField
          label="Seed"
          value={value.seedMode}
          options={[
            { value: 'source', label: '원본 seed (장마다 +1)' },
            { value: 'random', label: '무작위' },
          ]}
          onChange={(seedMode) => patch({ seedMode })}
        />
      </div>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={value.autoMask}
          onChange={(event) => patch({ autoMask: event.target.checked })}
        />
        <span>i2i로 보낼 때 구분선을 찾아 마스크 칠하기</span>
      </label>
    </>
  );
}

export function LineFixDialog(props: {
  projectId: string;
  records: GenerationSummary[];
  close: () => void;
}) {
  const library = useLibrary();
  const token = useStore((state) => state.token);
  const generation = resultGeneration(library, props.projectId);
  const [options, setOptions] = useState<LineFixSettings>(library.settings.lineFix);
  // 작업을 만들 때처럼 모르는 모델 ID는 기본 모델로 읽는다.
  const modelOf = (record: GenerationSummary) =>
    normalizeGenerationSettings({ ...generation, model: options.model || record.model }).model;
  const unsupported = [...new Set(props.records.map(modelOf))].filter(
    (model) => !supportsInpaint(model),
  );
  const total = props.records.length * options.count;
  // 기록 목록에는 Steps가 없어 생성 설정 값으로 어림한다. 입력은 64 배수 여백을 더한 크기다.
  const costJobs = props.records.map((record) =>
    lineFixCostJob({ ...options, model: modelOf(record) }, generation, record),
  );
  const estimate =
    costJobs.reduce((sum, job) => sum + estimateJobAnlas(job, token), 0) * options.count;
  const reasons = generationCostWarnings(costJobs, token);

  const submit = () => {
    props.close();
    saveLineFix(options);
    void fixBorderLines(props.projectId, props.records, options);
  };

  return (
    <Modal
      title={
        props.records.length > 1 ? `결과 ${props.records.length}장 구분선 지우기` : '구분선 지우기'
      }
      onClose={props.close}
      wide
      footer={
        <>
          <CostEstimate estimate={estimate} reasons={reasons} />
          <button onClick={props.close}>취소</button>
          <button className="accent" disabled={unsupported.length > 0} onClick={submit}>
            {total}장 생성
          </button>
        </>
      }
    >
      <ResultThumbs projectId={props.projectId} records={props.records} />
      <LineFixFields value={options} onChange={setOptions} />
      {unsupported.length > 0 && (
        <p className="field-error">
          {unsupported.map(modelLabel).join(', ')}은(는) 인페인팅을 지원하지 않아 모델을 골라야
          합니다.
        </p>
      )}
      <p className="hint">프로그램 설정에 저장됩니다.</p>
    </Modal>
  );
}

export function LineFixSettingsDialog(props: { close: () => void }) {
  const library = useLibrary();
  const [value, setValue] = useState(library.settings.lineFix);
  const save = () => {
    saveLineFix(value);
    props.close();
  };
  return (
    <Modal
      title="구분선 지우기 설정"
      onClose={props.close}
      wide
      footer={
        <>
          <button onClick={props.close}>취소</button>
          <button className="accent" onClick={save}>
            저장
          </button>
        </>
      }
    >
      <LineFixFields value={value} onChange={setValue} />
      <p className="hint">프로그램 설정에 저장됩니다.</p>
    </Modal>
  );
}
