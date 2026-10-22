import { useState } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import {
  CUSTOM_MAX,
  CUSTOM_MIN,
  RESOLUTION_PRESETS,
  snapDimension,
} from '../../core/imaging/CanvasLayout';
import {
  closestRatioFreeSize,
  isRatioSizeMode,
  RATIO_SIZES,
  ratioError,
  totalPixels,
  type RatioSizeMode,
  type Size,
} from '../../core/imaging/FreeSize';
import {
  effectiveGenerationSettings,
  FREE_PROJECT_ID,
  normalizeGenerationSettings,
} from '../../core/model/defaults';
import {
  estimateJobAnlas,
  FREE_MAX_PIXELS,
  generationCostWarnings,
} from '../../core/providers/NaiCost';
import { sendResultsToImg2Img, type ResultImg2ImgOptions } from '../actions';
import { projectMedia, resolveFreeGeneration, useLibrary, useStore } from '../store';
import { Modal } from './Dialogs';
import { NumberField, SelectField, Toggle } from './ui';

/** 크롭된 결과를 같은 비율로 키우는 업스케일 우회의 기본값. */
function nearestPreset(width: number, height: number) {
  return RESOLUTION_PRESETS.reduce((best, item) =>
    ratioError(item, width, height) < ratioError(best, width, height) ? item : best,
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
  const [size, setSize] = useState<string>(nearestPreset(first.width, first.height).id);
  const [custom, setCustom] = useState(() => closestRatioFreeSize(first.width, first.height));
  const [options, setOptions] = useState<Omit<ResultImg2ImgOptions, 'size'>>({
    fit: 'crop',
    strength: generation.img2imgStrength,
    noise: generation.img2imgNoise,
    colorCorrect: generation.colorCorrect,
    count: 1,
    seedMode: 'source',
  });
  const patch = (value: Partial<typeof options>) =>
    setOptions((current) => ({ ...current, ...value }));
  const ratioMode = isRatioSizeMode(size) ? size : undefined;
  const fixed = ratioMode
    ? undefined
    : (RESOLUTION_PRESETS.find((item) => item.id === size) ?? custom);
  const ratioTargets = (mode: RatioSizeMode) =>
    props.records.map((record) => RATIO_SIZES[mode](record.width, record.height));
  const exact = ratioTargets('exact-ratio');
  const closest = ratioTargets('closest-ratio');
  const ratioLabel = (name: string, targets: Size[]) => {
    const sizes = new Set(targets.map((item) => `${item.width}×${item.height}`));
    return sizes.size === 1 ? `${name} ${[...sizes][0]}` : `${name} (장마다)`;
  };
  const exactLoss = Math.round((1 - totalPixels(exact) / totalPixels(closest)) * 100);
  const closestOff = props.records.some(
    (record, index) => ratioError(closest[index], record.width, record.height) > 0.001,
  );
  const targets = fixed
    ? props.records.map(() => fixed)
    : ratioMode === 'exact-ratio'
      ? exact
      : closest;
  const total = props.records.length * options.count;
  // 기록 목록에는 Steps가 없어 생성 설정 값으로 어림한다. 큐에 넣을 때 다시 계산된다.
  const costJobs = props.records.map((record, index) => ({
    kind: 'img2img' as const,
    strength: options.strength,
    settings: effectiveGenerationSettings({ ...generation, model: record.model }),
    canvasWidth: targets[index].width,
    canvasHeight: targets[index].height,
  }));
  const estimate =
    costJobs.reduce((sum, job) => sum + estimateJobAnlas(job, token), 0) * options.count;
  const reasons = generationCostWarnings(costJobs, token);

  const submit = () => {
    props.close();
    void sendResultsToImg2Img(props.projectId, props.records, {
      ...options,
      size: fixed ? { width: fixed.width, height: fixed.height } : ratioMode!,
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
      <div className="four-column-fields">
        <SelectField
          label="목표 크기"
          value={size}
          options={[
            ...RESOLUTION_PRESETS.map((item) => ({
              value: item.id as string,
              label: item.label,
            })),
            { value: 'exact-ratio', label: ratioLabel('원본 비율 유지', exact) },
            { value: 'closest-ratio', label: ratioLabel('비슷한 비율 · 최대 크기', closest) },
            { value: 'custom', label: '직접 입력' },
          ]}
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
      {size === 'custom' && (
        <div className="four-column-fields">
          {(['width', 'height'] as const).map((side) => (
            <NumberField
              key={side}
              label={side === 'width' ? '가로' : '세로'}
              value={custom[side]}
              min={CUSTOM_MIN}
              max={CUSTOM_MAX}
              step={64}
              integer
              suffix="px"
              onChange={(value) =>
                setCustom((current) => ({ ...current, [side]: snapDimension(value) }))
              }
            />
          ))}
        </div>
      )}
      {ratioMode === 'exact-ratio' && exactLoss > 0 && (
        <p className="hint caution">
          64px 단위로 원본과 동일한 비율을 찾습니다. 「비슷한 비율 · 최대 크기」보다 픽셀 수가 약{' '}
          {exactLoss}% 적습니다.
        </p>
      )}
      {ratioMode === 'closest-ratio' && closestOff && (
        <p className="hint caution">64px 단위로 원본과 가장 비슷한 비율을 찾습니다.</p>
      )}
      {fixed && fixed.width * fixed.height > FREE_MAX_PIXELS && (
        <p className="field-error">
          {fixed.width}×{fixed.height}는 1024×1024보다 넓어 Opus 구독에서도 Anlas가 사용됩니다.
        </p>
      )}
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
        <Toggle
          label="색 보정 (Color Correct)"
          checked={options.colorCorrect}
          onChange={(colorCorrect) => patch({ colorCorrect })}
        />
      </div>
    </Modal>
  );
}
