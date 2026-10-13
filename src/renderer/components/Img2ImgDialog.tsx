import { useState } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { RESOLUTION_PRESETS } from '../../core/imaging/CanvasLayout';
import {
  effectiveGenerationSettings,
  FREE_PROJECT_ID,
  normalizeGenerationSettings,
} from '../../core/model/defaults';
import { estimateJobAnlas, generationCostWarnings } from '../../core/providers/NaiCost';
import { sendResultsToImg2Img, type ResultImg2ImgOptions } from '../actions';
import { projectMedia, resolveFreeGeneration, useLibrary, useStore } from '../store';
import { Modal } from './Dialogs';
import { NumberField, SelectField } from './ui';

/** 크롭된 결과를 같은 비율로 키우는 업스케일 우회의 기본값. */
function nearestPreset(width: number, height: number) {
  const ratio = width / height;
  return RESOLUTION_PRESETS.reduce((best, item) =>
    Math.abs(Math.log(item.width / item.height / ratio)) <
    Math.abs(Math.log(best.width / best.height / ratio))
      ? item
      : best,
  );
}

export function Img2ImgDialog(props: {
  projectId: string;
  records: GenerationSummary[];
  close: () => void;
}) {
  const library = useLibrary();
  const token = useStore((state) => state.token);
  const preset =
    props.projectId === FREE_PROJECT_ID
      ? resolveFreeGeneration(library).preset
      : library.presets.find(
          (item) =>
            item.id ===
            library.projects.find((project) => project.id === props.projectId)?.presetId,
        );
  const generation = normalizeGenerationSettings(
    preset?.generation ?? library.presets[0].generation,
  );
  const first = props.records[0];
  const [size, setSize] = useState(nearestPreset(first.width, first.height).id);
  const [options, setOptions] = useState<Omit<ResultImg2ImgOptions, 'width' | 'height'>>({
    fit: 'crop',
    strength: generation.img2imgStrength,
    noise: generation.img2imgNoise,
    count: 1,
    seedMode: 'source',
  });
  const patch = (value: Partial<typeof options>) =>
    setOptions((current) => ({ ...current, ...value }));
  const target = RESOLUTION_PRESETS.find((item) => item.id === size)!;
  const total = props.records.length * options.count;
  // 기록 목록에는 Steps가 없어 생성 설정 값으로 어림한다. 큐에 넣을 때 다시 계산된다.
  const costJob = {
    kind: 'img2img' as const,
    strength: options.strength,
    settings: effectiveGenerationSettings({ ...generation, model: first.model }),
    canvasWidth: target.width,
    canvasHeight: target.height,
  };
  const estimate = estimateJobAnlas(costJob, token) * total;
  const reasons = generationCostWarnings([costJob], token);
  const ratioDiffers = props.records.some(
    (record) => Math.abs(record.width / record.height - target.width / target.height) > 0.02,
  );

  const submit = () => {
    props.close();
    void sendResultsToImg2Img(props.projectId, props.records, {
      ...options,
      width: target.width,
      height: target.height,
    });
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
            {estimate ? `예상 약 ${estimate.toLocaleString()} Anlas` : '예상 0 Anlas (무료)'}
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
      <div className="four-column-fields">
        <SelectField
          label="목표 크기"
          value={size}
          options={RESOLUTION_PRESETS.map((item) => ({
            value: item.id,
            label: `${item.label} (무료)`,
          }))}
          onChange={setSize}
        />
        <SelectField
          label="비율이 다르면"
          value={options.fit}
          options={[
            { value: 'crop', label: '위쪽을 남기고 자르기' },
            { value: 'pad', label: '흰 여백 넣기' },
          ]}
          onChange={(fit) => patch({ fit })}
        />
        <NumberField
          label="세기 (Strength)"
          value={options.strength}
          min={0.01}
          max={0.99}
          step={0.05}
          onChange={(strength) => patch({ strength })}
        />
        <NumberField
          label="노이즈 (Noise)"
          value={options.noise}
          min={0}
          max={0.99}
          step={0.05}
          onChange={(noise) => patch({ noise })}
        />
      </div>
      <div className="four-column-fields">
        <NumberField
          label="결과마다 장수"
          value={options.count}
          min={1}
          max={10}
          integer
          onChange={(count) => patch({ count })}
        />
        <SelectField
          label="Seed"
          value={options.seedMode}
          options={[
            { value: 'source', label: '원본 seed (장마다 +1)' },
            { value: 'random', label: '무작위' },
          ]}
          onChange={(seedMode) => patch({ seedMode })}
        />
      </div>
      <p className="hint">
        원래 결과의 프롬프트와 설정을 그대로 쓰고, reference inset 태그는 뺍니다. 세기가 낮을수록
        원본을 많이 남깁니다(0.3~0.5 권장). 결과는 원래 씬에 새 결과로 쌓입니다.
        {ratioDiffers && ' 목표 크기와 비율이 다른 결과가 있어 맞춰서 보냅니다.'}
      </p>
    </Modal>
  );
}
