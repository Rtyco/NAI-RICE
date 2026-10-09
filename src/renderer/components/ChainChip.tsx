import type { Preset } from '../../core/domain/types';
import { RESOLUTION_PRESETS } from '../../core/imaging/CanvasLayout';
import { normalizeGenerationSettings } from '../../core/model/defaults';
import { patchItem } from '../../core/model/mutations';
import { sectionInfo } from '../sections';
import { openLibrary, updateLibrary, type LibrarySection } from '../store';
import { Icon, type IconName } from './Icon';

/** 한 줄짜리 구성 칩: 아이콘 + 이름 + 선택 상자. 편집 버튼은 마우스를 올렸을 때만 보인다. */
export function ChainChip(props: {
  section: LibrarySection;
  itemId?: string;
  missing?: boolean;
  /** 라이브러리 항목이 아니라 그 안의 값 하나를 고를 때 칩 이름과 설명을 바꾼다. */
  label?: { text: string; icon: IconName; usage: string };
  children: React.ReactNode;
}) {
  const info = sectionInfo(props.section);
  const label = props.label ?? { text: info.label, icon: info.icon, usage: info.usage };
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
      <button
        className="icon-button chain-chip-edit"
        title={`라이브러리에서 ${info.label} 편집`}
        onClick={() => openLibrary(props.section, props.itemId)}
      >
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

const STRENGTHS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

/** i2i 세기. 낮을수록 원본을 많이 남긴다. 생성 설정에 저장된다. */
export function StrengthChip({ preset }: { preset: Preset }) {
  const { img2imgStrength } = normalizeGenerationSettings(preset.generation);
  const choices = STRENGTHS.includes(img2imgStrength)
    ? STRENGTHS
    : [...STRENGTHS, img2imgStrength].sort((a, b) => a - b);
  return (
    <ChainChip
      section="presets"
      itemId={preset.id}
      label={{
        text: 'i2i 세기',
        icon: 'refresh',
        usage: `낮을수록 원본을 많이 남깁니다 · 생성 설정 「${preset.name}」에 저장됩니다`,
      }}
    >
      <select
        value={img2imgStrength}
        onChange={(event) => {
          const value = Number(event.target.value);
          updateLibrary((library) =>
            patchItem(library, 'presets', preset.id, (item) => ({
              ...item,
              generation: { ...item.generation, img2imgStrength: value },
            })),
          );
        }}
      >
        {choices.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </ChainChip>
  );
}
