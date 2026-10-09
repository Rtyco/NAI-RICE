import type { Preset } from '../../core/domain/types';
import { RESOLUTION_PRESETS } from '../../core/imaging/CanvasLayout';
import { normalizeGenerationSettings } from '../../core/model/defaults';
import { patchItem } from '../../core/model/mutations';
import { sectionInfo } from '../sections';
import { openLibrary, updateLibrary, type LibrarySection } from '../store';
import { Icon, type IconName } from './Icon';
import { Stepper } from './Stepper';

/**
 * 한 줄짜리 구성 칩: 아이콘 + 이름 + 선택 상자. 편집 버튼은 마우스를 올렸을 때만 보이고, 라이브러리의 그
 * 칸(`section`) 또는 `edit`이 가리키는 화면을 연다.
 */
export function ChainChip(props: {
  section?: LibrarySection;
  itemId?: string;
  missing?: boolean;
  /** 라이브러리 항목이 아니라 그 안의 값 하나를 고를 때 칩 이름과 설명을 바꾼다. */
  label?: { text: string; icon: IconName; usage: string };
  edit?: { title: string; open: () => void };
  children: React.ReactNode;
}) {
  const info = props.section ? sectionInfo(props.section) : undefined;
  const label = props.label ?? { text: info!.label, icon: info!.icon, usage: info!.usage };
  const edit = props.edit ?? {
    title: `라이브러리에서 ${info!.label} 편집`,
    open: () => openLibrary(props.section!, props.itemId),
  };
  return (
    <div
      className={`chain-chip ${props.missing ? 'missing' : ''}`}
      title={[label.text, label.usage].filter(Boolean).join(' · ')}
    >
      <span className="chain-chip-label">
        <Icon name={label.icon} size={15} />
        {label.text}
      </span>
      {props.children}
      <button className="icon-button chain-chip-edit" title={edit.title} onClick={edit.open}>
        <Icon name="edit" size={14} />
      </button>
    </div>
  );
}

/** 일반 생성 해상도. 생성 설정에 저장되므로 같은 생성 설정을 쓰는 곳 모두에 반영된다. */
export function SizeChip({ preset }: { preset: Preset }) {
  const { width, height } = normalizeGenerationSettings(preset.generation);
  const current = RESOLUTION_PRESETS.find((item) => item.width === width && item.height === height);
  return (
    <ChainChip
      section="presets"
      itemId={preset.id}
      label={{
        text: '해상도',
        icon: 'expand',
        usage: `생성 설정 「${preset.name}」의 일반 생성 해상도를 바꿉니다`,
      }}
    >
      <select
        value={current?.id ?? 'custom'}
        onChange={(event) => {
          const next = RESOLUTION_PRESETS.find((item) => item.id === event.target.value);
          if (next)
            updateLibrary((library) =>
              patchItem(library, 'presets', preset.id, (item) => ({
                ...item,
                generation: { ...item.generation, width: next.width, height: next.height },
              })),
            );
        }}
      >
        {RESOLUTION_PRESETS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
        {!current && (
          <option value="custom">
            직접 입력 {width}×{height}
          </option>
        )}
      </select>
    </ChainChip>
  );
}

type PresetNumberField = 'img2imgStrength' | 'img2imgNoise' | 'inpaintStrength';

// 범위는 생성 설정 화면의 같은 입력과 맞춘다.
const PRESET_NUMBER_CHIPS: Record<
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
  // NovelAI 웹 인페인팅의 Strength(inpaintImg2ImgStrength). 기본 1은 칠한 곳을 새로 그린다.
  inpaintStrength: {
    text: '강도',
    icon: 'brush',
    usage: '인페인팅 강도(Strength) · 낮을수록 칠한 곳의 원래 모습을 많이 남깁니다',
    min: 0,
    max: 1,
  },
};

/** i2i·인페인팅의 강도·노이즈. 생성 설정에 저장된다. */
export function PresetNumberChip({ preset, field }: { preset: Preset; field: PresetNumberField }) {
  const chip = PRESET_NUMBER_CHIPS[field];
  const value = normalizeGenerationSettings(preset.generation)[field];
  return (
    <ChainChip
      section="presets"
      itemId={preset.id}
      label={{
        text: chip.text,
        icon: chip.icon,
        usage: `${chip.usage} · 생성 설정 「${preset.name}」에 저장됩니다`,
      }}
    >
      <Stepper
        value={value}
        min={chip.min}
        max={chip.max}
        step={0.05}
        label={chip.text}
        onChange={(next) =>
          updateLibrary((library) =>
            patchItem(library, 'presets', preset.id, (item) => ({
              ...item,
              generation: { ...item.generation, [field]: next },
            })),
          )
        }
      />
    </ChainChip>
  );
}
