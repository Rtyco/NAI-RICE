import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Preset } from '../../core/domain/types';
import {
  CUSTOM_MAX,
  CUSTOM_MIN,
  RESOLUTION_PRESETS,
  snapDimension,
} from '../../core/imaging/CanvasLayout';
import { normalizeGenerationSettings } from '../../core/model/defaults';
import { listRows } from '../../core/model/folders';
import { patchItem } from '../../core/model/mutations';
import { FREE_MAX_PIXELS } from '../../core/providers/NaiCost';
import { sectionInfo } from '../sections';
import { openLibrary, toggleFolder, updateLibrary, useStore, type LibrarySection } from '../store';
import { LibraryEditorDialog } from '../views/library/LibraryEditorDialog';
import { Modal, openDialog } from './Dialogs';
import { Icon, type IconName } from './Icon';
import { folderKey } from './listFolders';
import { NumberField } from './ui';

function itemExists(section: LibrarySection, id: string): boolean {
  const library = useStore.getState().library;
  return Boolean(
    library && (library[section] as Array<{ id: string }>).some((item) => item.id === id),
  );
}

/** 고른 항목이 없거나 지워졌으면 라이브러리의 그 칸으로 간다. */
function editItem(section: LibrarySection, itemId: string | undefined): void {
  if (!itemId || !itemExists(section, itemId)) {
    openLibrary(section, itemId);
    return;
  }
  void openDialog((close) => (
    <LibraryEditorDialog section={section} itemId={itemId} close={close} />
  ));
}

type ChainLabel = { text: string; icon: IconName; usage: string };

/** null이면 버튼이 없다. */
type ChainEdit = { title: string; open: () => void } | null;

export function ChainChip(props: {
  section?: LibrarySection;
  itemId?: string;
  missing?: boolean;
  /** 항목 안의 값 하나를 고를 때 */
  label?: ChainLabel;
  edit?: ChainEdit;
  chipRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const info = props.section ? sectionInfo(props.section) : undefined;
  const label = props.label ?? { text: info!.label, icon: info!.icon, usage: info!.usage };
  const edit =
    props.edit === undefined && props.section
      ? {
          title: `${info!.label} 편집`,
          open: () => editItem(props.section!, props.itemId),
        }
      : props.edit;
  return (
    <div
      ref={props.chipRef}
      className={`chain-chip ${props.missing ? 'missing' : ''}`}
      title={[label.text, label.usage].filter(Boolean).join(' · ')}
    >
      <span className="chain-chip-label">
        <Icon name={label.icon} size={15} />
        {label.text}
      </span>
      {props.children}
      {edit && (
        <button className="icon-button chain-chip-edit" title={edit.title} onClick={edit.open}>
          <Icon name="edit" size={14} />
        </button>
      )}
    </div>
  );
}

export type ChecklistItem = {
  id: string;
  name: string;
  folder?: string;
  hint?: string;
  thumb?: string;
  /** 누를 수 없는 까닭 */
  disabled?: string;
  noEdit?: boolean;
  /** 여러 칸을 섞어 보일 때. 없으면 칩의 `editSection`. */
  editSection?: LibrarySection;
};

/** 바깥 클릭, Esc, 창 크기 변경에 닫힌다. */
function ChecklistPopover(props: {
  anchor: HTMLElement;
  close: () => void;
  title: string;
  children: ReactNode;
  options?: ReactNode;
  footer?: ReactNode;
  query?: { value: string; change: (value: string) => void };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 400 });
  const { anchor, close } = props;

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = ref.current?.offsetWidth ?? 280;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 4,
      maxHeight: Math.max(160, window.innerHeight - rect.bottom - 16),
    });
  }, [anchor]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [anchor, close]);

  return createPortal(
    <div
      className="checklist-popover"
      ref={ref}
      style={position}
      role="dialog"
      aria-label={props.title}
    >
      <div className="checklist-head">
        <b>{props.title}</b>
      </div>
      {props.query && (
        <input
          className="checklist-search"
          autoFocus
          value={props.query.value}
          placeholder="이름으로 찾기"
          onChange={(event) => props.query!.change(event.target.value)}
        />
      )}
      <div className="checklist-body">{props.children}</div>
      {props.options && <div className="checklist-options">{props.options}</div>}
      {props.footer && <div className="checklist-footer">{props.footer}</div>}
    </div>,
    document.body,
  );
}

const SEARCH_FROM = 9;

/** 라이브러리 목록 폴더와 따로 접힌다. 이름으로 찾는 중에는 펼친다. */
function ChecklistFolder(props: {
  foldKey: string;
  name: string;
  count: number;
  checked: number;
  open: boolean;
  children: ReactNode;
}) {
  const folded = useStore((state) => state.foldedFolders.includes(props.foldKey)) && !props.open;
  return (
    <div className={`checklist-folder ${folded ? 'folded' : ''}`}>
      <button
        className="checklist-folder-name"
        aria-expanded={!folded}
        title={folded ? '펼치기' : '접기'}
        onClick={() => toggleFolder(props.foldKey)}
      >
        <Icon name="chevron" size={11} className="section-chevron" />
        <Icon name="folder" size={13} />
        <span>{props.name}</span>
        {props.checked > 0 && <em>{props.checked}개 고름</em>}
        <small>{props.count}</small>
      </button>
      {!folded && props.children}
    </div>
  );
}

/** `multi`는 고른 순서가 번호로 보이고, 눌러도 창이 닫히지 않는다. */
export function ChecklistChip(props: {
  section?: LibrarySection;
  label?: ChainLabel;
  itemId?: string;
  missing?: boolean;
  edit?: ChainEdit;
  value: string;
  thumb?: string;
  items: ChecklistItem[];
  checked: string[];
  multi?: boolean;
  onPick: (id: string) => void;
  /** `order`는 1부터 */
  rowTools?: (id: string, order: number) => ReactNode;
  editSection?: LibrarySection;
  empty?: string;
  hint?: string;
  before?: ReactNode;
  /** 없으면 「칩 이름 고르기」 */
  pickTitle?: string;
  options?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const chip = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const info = props.section ? sectionInfo(props.section) : undefined;
  const title = props.label?.text ?? info?.label ?? '';
  const close = () => {
    setAnchor(null);
    setQuery('');
  };
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? props.items.filter((item) => item.name.toLowerCase().includes(needle))
    : props.items;

  const row = (item: ChecklistItem) => {
    const order = props.checked.indexOf(item.id) + 1;
    const on = order > 0;
    const editSection = item.noEdit ? undefined : (item.editSection ?? props.editSection);
    return (
      <div key={item.id} className={`checklist-row ${on ? 'checked' : ''}`}>
        <button
          className="checklist-pick"
          role={props.multi ? 'menuitemcheckbox' : 'menuitemradio'}
          aria-checked={on}
          disabled={Boolean(item.disabled)}
          title={item.disabled}
          onClick={() => {
            props.onPick(item.id);
            if (!props.multi) close();
          }}
        >
          <span className="checklist-mark">
            {props.multi && on ? (
              <i>{order}</i>
            ) : (
              <Icon name={on ? 'check-square' : 'square'} size={16} />
            )}
          </span>
          {item.thumb !== undefined && (
            <span className="checklist-thumb">
              {item.thumb && <img src={item.thumb} alt="" draggable={false} />}
            </span>
          )}
          <span className="checklist-name">
            <b>{item.name || '(이름 없음)'}</b>
            {item.hint && <small>{item.hint}</small>}
          </span>
        </button>
        {on && props.rowTools?.(item.id, order)}
        {editSection && (
          <button
            className="icon-button checklist-edit"
            title="편집"
            aria-label={`${item.name} 편집`}
            onClick={() => {
              close();
              editItem(editSection, item.id);
            }}
          >
            <Icon name="edit" size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <ChainChip
      chipRef={chip}
      section={props.section}
      label={props.label}
      itemId={props.itemId}
      missing={props.missing}
      edit={props.edit}
    >
      {props.before}
      <button
        className="chain-chip-value chain-chip-trigger"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={() => (anchor ? close() : setAnchor(chip.current))}
      >
        {props.thumb && <img className="chain-thumb" src={props.thumb} alt="" />}
        <span>{props.value}</span>
        <Icon name="chevron" size={12} className="rotate-down" />
      </button>
      {anchor && (
        <ChecklistPopover
          anchor={anchor}
          close={close}
          title={
            props.pickTitle ??
            (props.multi ? `${title} 선택` : `${title} 선택`)
          }
          query={props.items.length >= SEARCH_FROM ? { value: query, change: setQuery } : undefined}
          options={props.options}
          footer={
            (props.hint || props.editSection) && (
              <>
                {props.hint && <small>{props.hint}</small>}
                {props.editSection && (
                  <button
                    className="link-button"
                    onClick={() => {
                      close();
                      openLibrary(props.editSection!);
                    }}
                  >
                    라이브러리에서 관리
                  </button>
                )}
              </>
            )
          }
        >
          {!shown.length && (
            <p className="hint">{needle ? '찾는 항목이 없습니다.' : props.empty}</p>
          )}
          {listRows(shown).map((entry) =>
            entry.kind === 'item' ? (
              row(entry.item)
            ) : (
              <ChecklistFolder
                key={`folder:${entry.name}`}
                foldKey={folderKey(`pick-${props.section ?? title}`, entry.name)}
                name={entry.name}
                count={entry.items.length}
                checked={entry.items.filter((item) => props.checked.includes(item.id)).length}
                open={Boolean(needle)}
              >
                {entry.items.map(row)}
              </ChecklistFolder>
            ),
          )}
        </ChecklistPopover>
      )}
    </ChainChip>
  );
}

/** 생성 설정에 저장되어 같은 생성 설정을 쓰는 곳 모두에 반영된다. */
export function SizeChip({ preset }: { preset: Preset }) {
  const { width, height } = normalizeGenerationSettings(preset.generation);
  const current = RESOLUTION_PRESETS.find((item) => item.width === width && item.height === height);
  const custom = `직접 입력 ${width}×${height}`;
  const save = (size: { width: number; height: number }) =>
    updateLibrary((library) =>
      patchItem(library, 'presets', preset.id, (item) => ({
        ...item,
        generation: { ...item.generation, ...size },
      })),
    );
  return (
    <ChecklistChip
      section="presets"
      itemId={preset.id}
      label={{
        text: '해상도',
        icon: 'expand',
        usage: `생성 설정 「${preset.name}」의 일반 생성 해상도를 바꿉니다`,
      }}
      value={current?.label ?? custom}
      items={[
        ...RESOLUTION_PRESETS.map((item) => ({ id: item.id, name: item.label })),
        {
          id: 'custom',
          name: current ? '직접 입력…' : `${custom}…`,
          hint: '가로·세로를 64 단위로 정합니다',
        },
      ]}
      checked={[current?.id ?? 'custom']}
      onPick={(id) => {
        const next = RESOLUTION_PRESETS.find((item) => item.id === id);
        if (next) save(next);
        else
          void openDialog((close) => (
            <CustomSizeDialog size={{ width, height }} onApply={save} close={close} />
          ));
      }}
      hint={`생성 설정 「${preset.name}」에 저장됩니다`}
    />
  );
}

function CustomSizeDialog(props: {
  size: { width: number; height: number };
  onApply: (size: { width: number; height: number }) => void;
  close: () => void;
}) {
  const [size, setSize] = useState(props.size);
  const apply = () => {
    props.onApply(size);
    props.close();
  };
  return (
    <Modal
      title="해상도 직접 입력"
      onClose={props.close}
      footer={
        <>
          <button onClick={props.close}>취소</button>
          <button className="accent" onClick={apply}>
            적용
          </button>
        </>
      }
    >
      <div
        className="two-column-fields"
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply();
        }}
      >
        {(['width', 'height'] as const).map((side) => (
          <NumberField
            key={side}
            label={side === 'width' ? '가로' : '세로'}
            value={size[side]}
            min={CUSTOM_MIN}
            max={CUSTOM_MAX}
            step={64}
            integer
            suffix="px"
            onChange={(value) =>
              setSize((current) => ({ ...current, [side]: snapDimension(value) }))
            }
          />
        ))}
      </div>
      {size.width * size.height > FREE_MAX_PIXELS && (
        <p className="field-error">
          {size.width}×{size.height}는 1024×1024보다 넓어 Opus 구독에서도 Anlas가 사용됩니다.
        </p>
      )}
    </Modal>
  );
}
