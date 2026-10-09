import type { Preset } from '../../core/domain/types';
import { RESOLUTION_PRESETS } from '../../core/imaging/CanvasLayout';
import { normalizeGenerationSettings } from '../../core/model/defaults';
import { patchItem } from '../../core/model/mutations';
import { sectionInfo } from '../sections';
import { openLibrary, updateLibrary, useStore, type LibrarySection } from '../store';
import { LibraryEditorDialog } from '../views/library/LibraryEditorDialog';
import { openDialog } from './Dialogs';
import { Icon, type IconName } from './Icon';

/**
 * 한 줄짜리 구성 칩: 아이콘 + 이름 + 선택 상자. 편집 버튼은 마우스를 올렸을 때만 보이고, 고른 항목을 편집
 * 팝업으로 연다(화면을 떠나지 않는다). 고른 항목이 없으면 라이브러리의 그 칸으로 간다.
 */
function itemExists(section: LibrarySection, id: string): boolean {
  const library = useStore.getState().library;
  return Boolean(
    library && (library[section] as Array<{ id: string }>).some((item) => item.id === id),
  );
}

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
    title: `${info!.label} 편집`,
    open: () => {
      const { section, itemId } = props;
      if (!section) return;
      if (!itemId || !itemExists(section, itemId)) {
        openLibrary(section, itemId);
        return;
      }
      void openDialog((close) => (
        <LibraryEditorDialog section={section} itemId={itemId} close={close} />
      ));
    },
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
