import type { Preset } from '../../core/domain/types';
import { normalizeGenerationSettings } from '../../core/model/defaults';
import { patchItem } from '../../core/model/mutations';
import { updateLibrary } from '../store';
import { Icon, type IconName } from './Icon';
import { Stepper } from './Stepper';

export type PresetNumberField = 'img2imgStrength' | 'img2imgNoise' | 'inpaintStrength';

// 범위는 생성 설정 화면과 같다.
const FIELDS: Record<
  PresetNumberField,
  { text: string; icon: IconName; usage: string; min: number; max: number }
> = {
  img2imgStrength: {
    text: '강도',
    icon: 'refresh',
    usage: 'i2i 강도(Strength) · 낮을수록 원본을 많이 남깁니다',
    min: 0.01,
    max: 0.99,
  },
  img2imgNoise: {
    text: '노이즈',
    icon: 'sparkle',
    usage: 'i2i 노이즈(Noise) · 높을수록 원본에 없던 세부를 더 그려 넣습니다',
    min: 0,
    max: 0.99,
  },
  // NovelAI 웹 `inpaintImg2ImgStrength`. 1은 칠한 곳을 새로 그린다.
  inpaintStrength: {
    text: '강도',
    icon: 'brush',
    usage: '인페인팅 강도(Strength) · 낮을수록 칠한 곳의 원래 모습을 많이 남깁니다',
    min: 0,
    max: 1,
  },
};

function patchGeneration(preset: Preset, value: Partial<Preset['generation']>) {
  updateLibrary((library) =>
    patchItem(library, 'presets', preset.id, (item) => ({
      ...item,
      generation: { ...item.generation, ...value },
    })),
  );
}

export function PresetColorCorrectRow({ preset }: { preset: Preset }) {
  return (
    <label
      className="preset-number-row"
      title={`결과 색을 입력 이미지에 맞춥니다 (color_correct) · 생성 설정 「${preset.name}」에 저장됩니다`}
    >
      <span>
        <Icon name="palette" size={14} /> 색 보정
      </span>
      <input
        type="checkbox"
        checked={normalizeGenerationSettings(preset.generation).colorCorrect}
        onChange={(event) => patchGeneration(preset, { colorCorrect: event.target.checked })}
      />
    </label>
  );
}

export function PresetNumberRow({ preset, field }: { preset: Preset; field: PresetNumberField }) {
  const info = FIELDS[field];
  return (
    <div
      className="preset-number-row"
      title={`${info.usage} · 생성 설정 「${preset.name}」에 저장됩니다`}
    >
      <span>
        <Icon name={info.icon} size={14} /> {info.text}
      </span>
      <Stepper
        value={normalizeGenerationSettings(preset.generation)[field]}
        min={info.min}
        max={info.max}
        step={0.05}
        label={info.text}
        onChange={(next) => patchGeneration(preset, { [field]: next })}
      />
    </div>
  );
}
