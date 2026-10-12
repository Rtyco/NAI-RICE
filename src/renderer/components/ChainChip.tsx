import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Preset } from '../../core/domain/types';
import { RESOLUTION_PRESETS } from '../../core/imaging/CanvasLayout';
import { normalizeGenerationSettings } from '../../core/model/defaults';
import { listRows } from '../../core/model/folders';
import { patchItem } from '../../core/model/mutations';
import { sectionInfo } from '../sections';
import { openLibrary, toggleFolder, updateLibrary, useStore, type LibrarySection } from '../store';
import { LibraryEditorDialog } from '../views/library/LibraryEditorDialog';
import { openDialog } from './Dialogs';
import { Icon, type IconName } from './Icon';
import { folderKey } from './listFolders';

/**
 * 한 줄짜리 구성 칩: 아이콘 + 이름 + 값. 편집 버튼은 마우스를 올렸을 때만 보이고, 고른 항목을 편집
 * 팝업으로 연다(화면을 떠나지 않는다). 고른 항목이 없으면 라이브러리의 그 칸으로 간다.
 */
function itemExists(section: LibrarySection, id: string): boolean {
  const library = useStore.getState().library;
  return Boolean(
    library && (library[section] as Array<{ id: string }>).some((item) => item.id === id),
  );
}

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

export function ChainChip(props: {
  section?: LibrarySection;
  itemId?: string;
  missing?: boolean;
  /** 라이브러리 항목이 아니라 그 안의 값 하나를 고를 때 칩 이름과 설명을 바꾼다. */
  label?: ChainLabel;
  /** null이면 편집 버튼을 두지 않는다. */
  edit?: { title: string; open: () => void } | null;
  /** 편집 버튼 앞에 붙는 버튼. 편집 버튼처럼 마우스를 올렸을 때만 보인다. */
  actions?: ReactNode;
  chipRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const info = props.section ? sectionInfo(props.section) : undefined;
  const label = props.label ?? { text: info!.label, icon: info!.icon, usage: info!.usage };
  const edit =
    props.edit === undefined
      ? {
          title: `${info!.label} 편집`,
          open: () => props.section && editItem(props.section, props.itemId),
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
      {props.actions}
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
  /** 누를 수 없으면 그 까닭. */
  disabled?: string;
  /** 「쓰지 않음」처럼 라이브러리 항목이 아닌 줄. 편집 버튼을 두지 않는다. */
  noEdit?: boolean;
};

/** 칩 아래에 붙는 작은 창. 바깥을 누르거나 Esc, 창 크기가 바뀌면 닫힌다. */
function ChecklistPopover(props: {
  anchor: HTMLElement;
  close: () => void;
  title: string;
  children: ReactNode;
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
      {props.footer && <div className="checklist-footer">{props.footer}</div>}
    </div>,
    document.body,
  );
}

const SEARCH_FROM = 9;

/**
 * 고르기 창의 폴더. 라이브러리 목록의 폴더와 따로 접히고 다음에 열 때도 기억한다. 접혀 있어도 고른 항목 수가
 * 보이고, 이름으로 찾는 중에는 펼쳐 둔다.
 */
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

/**
 * 라이브러리 항목을 고르는 칩. 누르면 작은 창에 항목이 폴더대로 보이고, 지금 쓰는 항목은 체크와 색으로
 * 표시된다. 여럿 고르는 칸(`multi`)은 체크 대신 고른 순서가 번호로 보이고, 눌러도 창이 닫히지 않는다.
 */
export function ChecklistChip(props: {
  section?: LibrarySection;
  label?: ChainLabel;
  itemId?: string;
  missing?: boolean;
  edit?: { title: string; open: () => void } | null;
  /** 칩에 보일 값. */
  value: string;
  thumb?: string;
  items: ChecklistItem[];
  checked: string[];
  multi?: boolean;
  onPick: (id: string) => void;
  /** 고른 줄 끝에 붙는 조작. `order`는 1부터다. */
  rowTools?: (id: string, order: number) => ReactNode;
  /** 줄마다 편집 버튼을 둘 라이브러리 칸. */
  editSection?: LibrarySection;
  empty?: string;
  hint?: string;
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
        {props.editSection && !item.noEdit && (
          <button
            className="icon-button checklist-edit"
            title="편집"
            aria-label={`${item.name} 편집`}
            onClick={() => {
              close();
              editItem(props.editSection!, item.id);
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
          title={props.multi ? `${title} 고르기 · 여럿 고를 수 있습니다` : `${title} 고르기`}
          query={props.items.length >= SEARCH_FROM ? { value: query, change: setQuery } : undefined}
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

/** 일반 생성 해상도. 생성 설정에 저장되므로 같은 생성 설정을 쓰는 곳 모두에 반영된다. */
export function SizeChip({ preset }: { preset: Preset }) {
  const { width, height } = normalizeGenerationSettings(preset.generation);
  const current = RESOLUTION_PRESETS.find((item) => item.width === width && item.height === height);
  const custom = `직접 입력 ${width}×${height}`;
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
        ...(current
          ? []
          : [{ id: 'custom', name: custom, disabled: '생성 설정 편집에서 바꾼 크기입니다' }]),
      ]}
      checked={[current?.id ?? 'custom']}
      onPick={(id) => {
        const next = RESOLUTION_PRESETS.find((item) => item.id === id);
        if (next)
          updateLibrary((library) =>
            patchItem(library, 'presets', preset.id, (item) => ({
              ...item,
              generation: { ...item.generation, width: next.width, height: next.height },
            })),
          );
      }}
      hint={`생성 설정 「${preset.name}」에 저장됩니다`}
    />
  );
}
