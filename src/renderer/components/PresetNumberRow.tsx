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
  { text: string; icon: IconName; name: string; min: number; max: number }
> = {
  img2imgStrength: {
    text: '강도',
    icon: 'strength',
    name: 'i2i 강도 (Strength)',
    min: 0.01,
    max: 0.99,
  },
  img2imgNoise: {
    text: '노이즈',
    icon: 'noise',
    name: 'i2i 노이즈 (Noise)',
    min: 0,
    max: 0.99,
  },
  // NovelAI 웹 `inpaintImg2ImgStrength`. 1은 칠한 곳을 새로 그린다.
  inpaintStrength: {
    text: '강도',
    icon: 'strength',
    name: '인페인팅 강도 (Strength)',
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

/** `savedIn`은 툴팁의 저장 위치 */
export function NumberRow(props: {
  field: PresetNumberField;
  value: number;
  savedIn: string;
  onChange: (value: number) => void;
}) {
  const info = FIELDS[props.field];
  return (
    <div className="preset-number-row" title={`${info.name} · ${props.savedIn}에 저장`}>
      <span>
        <Icon name={info.icon} size={14} /> {info.text}
      </span>
      <Stepper
        value={props.value}
        min={info.min}
        max={info.max}
        step={0.05}
        label={info.text}
        onChange={props.onChange}
      />
    </div>
  );
}

export function PresetNumberRow({ preset, field }: { preset: Preset; field: PresetNumberField }) {
  return (
    <NumberRow
      field={field}
      value={normalizeGenerationSettings(preset.generation)[field]}
      savedIn={`생성 설정 「${preset.name}」`}
      onChange={(next) => patchGeneration(preset, { [field]: next })}
    />
  );
}
