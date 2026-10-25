import { useState } from 'react';
import type { RefineSettings } from '../../core/domain/types';
import {
  CUSTOM_MAX,
  CUSTOM_MIN,
  RESOLUTION_PRESETS,
  snapDimension,
} from '../../core/imaging/CanvasLayout';
import {
  isRatioSizeMode,
  RATIO_SIZES,
  ratioError,
  totalPixels,
  type RatioSizeMode,
  type Size,
} from '../../core/imaging/FreeSize';
import { FREE_MAX_PIXELS } from '../../core/providers/NaiCost';
import { NAI_MODELS } from '../../core/providers/NaiModels';
import { NumberField, PromptField, SelectField } from './ui';

function presetIdOf(size: Size): string | undefined {
  return RESOLUTION_PRESETS.find((item) => item.width === size.width && item.height === size.height)
    ?.id;
}

/** 다듬기 창과 생성 후 다듬기 설정이 함께 쓴다. `sources`는 다듬을 결과 크기(모르면 빈 배열). */
export function RefineFields(props: {
  value: RefineSettings;
  sources: Size[];
  onChange: (value: RefineSettings) => void;
}) {
  const { value, sources } = props;
  const patch = (next: Partial<RefineSettings>) => props.onChange({ ...value, ...next });
  const [customMode, setCustomMode] = useState(
    typeof value.size !== 'string' && !presetIdOf(value.size),
  );
  const sizeChoice =
    typeof value.size === 'string'
      ? value.size
      : customMode
        ? 'custom'
        : (presetIdOf(value.size) ?? 'custom');
  const fixed = typeof value.size === 'string' ? undefined : value.size;
  const ratioTargets = (mode: RatioSizeMode) =>
    sources.map((source) => RATIO_SIZES[mode](source.width, source.height));
  const exact = ratioTargets('exact-ratio');
  const closest = ratioTargets('closest-ratio');
  const ratioLabel = (name: string, targets: Size[]) => {
    const sizes = new Set(targets.map((item) => `${item.width}×${item.height}`));
    return sizes.size === 1 ? `${name} ${[...sizes][0]}` : sizes.size ? `${name} (장마다)` : name;
  };
  const exactLoss = sources.length
    ? Math.round((1 - totalPixels(exact) / totalPixels(closest)) * 100)
    : 0;
  const closestOff = sources.some(
    (source, index) => ratioError(closest[index], source.width, source.height) > 0.001,
  );
  const pickSize = (choice: string) => {
    setCustomMode(choice === 'custom');
    if (isRatioSizeMode(choice)) return patch({ size: choice });
    const preset = RESOLUTION_PRESETS.find((item) => item.id === choice);
    if (preset) return patch({ size: { width: preset.width, height: preset.height } });
    patch({ size: fixed ?? closest[0] ?? { width: 1024, height: 1024 } });
  };

  return (
    <>
      <div className="four-column-fields">
        <SelectField
          label="모델"
          value={value.model}
          options={[
            { value: '', label: '원본과 같은 모델' },
            ...NAI_MODELS.map((model) => ({ value: model.id, label: model.label })),
          ]}
          onChange={(model) => patch({ model })}
        />
        <SelectField
          label="프롬프트"
          value={value.prompt}
          options={[
            { value: 'source', label: '원본 프롬프트' },
            { value: 'negative-only', label: '네거티브만 남기기' },
            { value: 'empty', label: '비우기 (네거티브도)' },
            { value: 'custom', label: '직접 입력' },
          ]}
          onChange={(prompt) => patch({ prompt })}
        />
        <NumberField
          label="세기 (Strength)"
          value={value.strength}
          min={0.01}
          max={0.99}
          step={0.05}
          onChange={(strength) => patch({ strength })}
        />
        <NumberField
          label="노이즈 (Noise)"
          value={value.noise}
          min={0}
          max={0.99}
          step={0.05}
          onChange={(noise) => patch({ noise })}
        />
      </div>
      {value.prompt === 'custom' && (
        <div className="two-column-fields">
          <PromptField
            label="포지티브"
            dialogTitle="다듬기 포지티브"
            rows={3}
            value={value.customPositive ?? ''}
            onChange={(customPositive) => patch({ customPositive })}
          />
          <PromptField
            label="네거티브"
            dialogTitle="다듬기 네거티브"
            tone="negative"
            rows={3}
            value={value.customNegative ?? ''}
            onChange={(customNegative) => patch({ customNegative })}
          />
        </div>
      )}
      <div className="four-column-fields">
        <SelectField
          label="목표 크기"
          value={sizeChoice}
          options={[
            ...RESOLUTION_PRESETS.map((item) => ({ value: item.id, label: item.label })),
            { value: 'exact-ratio', label: ratioLabel('원본 비율 유지', exact) },
            { value: 'closest-ratio', label: ratioLabel('비슷한 비율 · 최대 크기', closest) },
            { value: 'custom', label: '직접 입력' },
          ]}
          onChange={pickSize}
        />
        <SelectField
          label="비율이 다르면"
          value={value.fit}
          options={[
            { value: 'crop', label: '위쪽을 남기고 자르기' },
            { value: 'pad', label: '흰 여백 넣기' },
          ]}
          onChange={(fit) => patch({ fit })}
        />
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
      {sizeChoice === 'custom' && fixed && (
        <div className="four-column-fields">
          {(['width', 'height'] as const).map((side) => (
            <NumberField
              key={side}
              label={side === 'width' ? '가로' : '세로'}
              value={fixed[side]}
              min={CUSTOM_MIN}
              max={CUSTOM_MAX}
              step={64}
              integer
              suffix="px"
              onChange={(next) => patch({ size: { ...fixed, [side]: snapDimension(next) } })}
            />
          ))}
        </div>
      )}
      {value.size === 'exact-ratio' && exactLoss > 0 && (
        <p className="hint caution">
          「비슷한 비율 · 최대 크기」보다 픽셀 수가 약 {exactLoss}% 적습니다.
        </p>
      )}
      {value.size === 'closest-ratio' && closestOff && (
        <p className="hint caution">원본과 비율이 조금 다릅니다.</p>
      )}
      {fixed && fixed.width * fixed.height > FREE_MAX_PIXELS && (
        <p className="field-error">
          {fixed.width}×{fixed.height}는 1024×1024보다 넓어 Opus 구독에서도 Anlas가 사용됩니다.
        </p>
      )}
    </>
  );
}
