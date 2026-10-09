import { useRef, useState, type MouseEvent } from 'react';
import type { Reference } from '../../core/domain/types';
import { projectsUsing } from '../../core/model/defaults';
import { moveItems } from '../../core/model/mutations';
import { showContextMenu } from '../components/ContextMenu';
import { AccountMeter } from '../components/AccountMeter';
import { Icon } from '../components/Icon';
import { focusAndSelect } from '../components/focusAndSelect';
import { importJsonFromPicker } from '../importers';
import { useBoxSelection } from '../components/useBoxSelection';
import {
  dragPayload,
  readDragPayload,
  writeDragPayload,
  type DragPayload,
} from '../components/listDrag';
import { listMenu } from '../components/listMenu';
import {
  openLibrary,
  referenceMedia,
  toggleLibraryList,
  updateLibrary,
  useLibrary,
  useStore,
  type LibrarySection,
} from '../store';
import {
  createItem,
  deleteItem,
  deleteItems,
  duplicateItem,
  exportItem,
  openReferenceFolder,
  itemSubtitle,
  LABELS,
  withName,
  type Item,
} from './library/itemActions';
import { UsedBy } from './library/UsedBy';
import { LibraryItemEditor } from './library/LibraryEditorDialog';

const DRAG_TYPE = 'application/x-library-item';

/**
 * 목록 한 줄. 끌어서 놓으면 순서를 바꾸고, 두 번 클릭하면 그 자리에서 이름을 바꾼다. 목록을 접으면 사이드바처럼
 * 아바타만 남고 누르면 바로 그 항목을 연다.
 */
function LibraryRow(props: {
  section: LibrarySection;
  item: Item;
  index: number;
  collapsed: boolean;
  selected: boolean;
  subtitle: string;
  /** 끄는 중인 항목들. */
  dragging: string[];
  /** 끌기를 시작할 때 옮길 항목들을 정한다(고른 항목 중 하나를 끌면 고른 것 모두). */
  startDrag: (id: string) => DragPayload;
  endDrag: () => void;
  /** 상자·Ctrl·Shift로 여러 개를 고른 상태인지. */
  picked: boolean;
  /** 지금 고른 항목 수. 고른 항목에서 우클릭하면 삭제를 한꺼번에 한다. */
  pickedCount: number;
  removePicked: () => void;
  /** Ctrl·Shift 클릭이면 선택만 바꾸고 true를 돌려준다. */
  onPick: (event: MouseEvent) => boolean;
}) {
  const { section, item, collapsed } = props;
  const [over, setOver] = useState(false);
  const [renaming, setRenamingState] = useState(false);
  // 엔터·Esc로 끝낸 뒤 따라오는 blur가 다시 저장하지 않게 한다.
  const editing = useRef(false);
  const setRenaming = (value: boolean) => {
    editing.current = value;
    setRenamingState(value);
  };
  const reference = section === 'references' ? (item as Reference) : undefined;

  const avatar = reference ? (
    <span className="avatar">
      {reference.image ? (
        <img
          src={referenceMedia(reference.id, reference.image.originalFile, reference.updatedAt)}
          alt=""
          draggable={false}
        />
      ) : (
        '?'
      )}
    </span>
  ) : (
    collapsed && <span className="avatar">{item.name.slice(0, 1) || '?'}</span>
  );

  const commitName = (value: string) => {
    if (!editing.current) return;
    setRenaming(false);
    const name = value.trim();
    if (name && name !== item.name)
      updateLibrary((current) => withName(current, section, item.id, name));
  };

  return (
    <div
      className={`library-item ${props.selected ? 'selected' : ''} ${props.picked ? 'picked' : ''} ${over ? 'drop-target' : ''} ${props.dragging.includes(item.id) ? 'dragging' : ''}`}
      data-select-id={collapsed ? undefined : item.id}
      draggable={!renaming}
      onContextMenu={(event) =>
        showContextMenu(
          event,
          listMenu({
            open: () => openLibrary(section, item.id),
            rename: collapsed ? undefined : () => setRenaming(true),
            duplicate: () => void duplicateItem(section, item),
            exportJson: () => exportItem(section, item),
            remove: () => void deleteItem(section, item),
            pickedCount: props.picked ? props.pickedCount : 0,
            removePicked: props.removePicked,
          }),
        )
      }
      onDragStart={(event) => writeDragPayload(event, DRAG_TYPE, props.startDrag(item.id))}
      onDragEnd={props.endDrag}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const payload = readDragPayload(event, DRAG_TYPE);
        setOver(false);
        if (!payload || payload.ids.includes(item.id)) return;
        event.preventDefault();
        event.stopPropagation();
        updateLibrary((current) =>
          moveItems(current, section, payload.ids, payload.grabbed, item.id),
        );
      }}
    >
      {renaming ? (
        <div className="library-item-main">
          {avatar}
          <span className="project-meta">
            <input
              className="library-item-rename"
              defaultValue={item.name}
              aria-label="이름"
              ref={focusAndSelect}
              onBlur={(event) => commitName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitName(event.currentTarget.value);
                if (event.key === 'Escape') setRenaming(false);
              }}
            />
            <small>{props.subtitle}</small>
          </span>
        </div>
      ) : (
        <button
          className="library-item-main"
          title={
            collapsed
              ? item.name
              : '두 번 클릭: 이름 변경 · 끌어서 순서 변경 · Ctrl·Shift 클릭: 여러 개 선택'
          }
          onClick={(event) => {
            if (collapsed || !props.onPick(event)) openLibrary(section, item.id);
          }}
          onDoubleClick={() => !collapsed && setRenaming(true)}
        >
          {avatar}
          {!collapsed && (
            <span className="project-meta">
              <b>{item.name || '(이름 없음)'}</b>
              <small>{props.subtitle}</small>
            </span>
          )}
        </button>
      )}
      {!collapsed && !renaming && (
        <button
          className="icon-button danger item-actions"
          title="삭제"
          onClick={() => void deleteItem(section, item)}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}

export function LibraryView({ section, itemId }: { section: LibrarySection; itemId?: string }) {
  const library = useLibrary();
  const items = library[section] as Item[];
  const selected = items.find((item) => item.id === itemId) ?? items[0];
  const label = LABELS[section];
  const [dragging, setDragging] = useState<string[]>([]);
  const collapsed = useStore((state) => state.libraryListCollapsed);
  const removeMany = (ids: string[]) =>
    void deleteItems(
      section,
      items.filter((item) => ids.includes(item.id)),
    );
  const selection = useBoxSelection<HTMLElement>(
    items.map((item) => item.id),
    removeMany,
  );
  // 감정 모음은 기본 감정 6개로 시작할지 빈 채로 시작할지 고른다.
  const add = (event: MouseEvent) => {
    const create = (empty: boolean) =>
      openLibrary(section, createItem(section, useStore.getState().library!, { empty }));
    if (section !== 'emotionSets') {
      create(false);
      return;
    }
    showContextMenu(event, [
      {
        label: '기본 씬 6개로 시작',
        hint: '중립·기쁨·슬픔·분노·놀람·부끄러움',
        onSelect: () => create(false),
      },
      { label: '빈 상태로 시작', onSelect: () => create(true) },
    ]);
  };

  return (
    <div className={`library-view ${collapsed ? 'list-collapsed' : ''}`}>
      <aside className={`library-list ${collapsed ? 'collapsed' : ''}`}>
        <div className="library-list-head">
          <button
            className="icon-button library-list-toggle"
            title={`${label.title} 목록 ${collapsed ? '펼치기' : '접기'}`}
            aria-label={`${label.title} 목록 ${collapsed ? '펼치기' : '접기'}`}
            onClick={toggleLibraryList}
          >
            <Icon name="sidebar" size={18} />
          </button>
          {!collapsed && (
            <>
              <div className="library-list-title">
                <small className="eyebrow">라이브러리</small>
                <b>{label.title}</b>
                {label.description && <small>{label.description}</small>}
              </div>
              <button className="accent" onClick={add}>
                ＋ 추가
              </button>
            </>
          )}
        </div>
        <nav
          className={collapsed ? '' : 'selectable'}
          {...(collapsed ? {} : selection.containerProps)}
        >
          {items.map((item, index) => {
            const uses = projectsUsing(library, label.kind, item.id).length;
            return (
              <LibraryRow
                key={item.id}
                section={section}
                item={item}
                index={index}
                collapsed={collapsed}
                selected={item.id === selected?.id}
                subtitle={`${itemSubtitle(section, item)}${uses ? ` · 작업 ${uses}` : ''}`}
                dragging={dragging}
                startDrag={(id) => {
                  const payload = dragPayload(
                    id,
                    selection.selected,
                    items.map((entry) => entry.id),
                  );
                  setDragging(payload.ids);
                  return payload;
                }}
                endDrag={() => setDragging([])}
                picked={!collapsed && selection.isSelected(item.id)}
                pickedCount={selection.selected.size}
                removePicked={() => removeMany([...selection.selected])}
                onPick={(event) => selection.clickItem(event, item.id)}
              />
            );
          })}
          {collapsed && (
            <button className="library-item-main add" title="추가" onClick={add}>
              <span className="avatar">
                <Icon name="plus" />
              </span>
            </button>
          )}
          {!items.length && !collapsed && <p className="hint pad-x">아직 없습니다.</p>}
          {!collapsed && selection.boxElement}
        </nav>
        {!collapsed && selection.selected.size > 0 && (
          <div className="selection-bar">
            <span>{selection.selected.size}개 선택</span>
            <button
              className="with-icon danger-quiet"
              onClick={() => removeMany([...selection.selected])}
            >
              <Icon name="trash" size={14} /> 삭제
            </button>
            <button className="link-button" onClick={selection.clear}>
              선택 취소
            </button>
          </div>
        )}
        {!collapsed && (
          <button className="link-button" onClick={() => void importJsonFromPicker()}>
            JSON 가져오기
          </button>
        )}
      </aside>
      <section className="library-editor animate-in" key={selected?.id ?? 'empty'}>
        {selected ? (
          <>
            <header className="library-editor-head">
              <input
                className="project-name-input"
                value={selected.name}
                aria-label="이름"
                onChange={(event) =>
                  updateLibrary((current) =>
                    withName(current, section, selected.id, event.target.value),
                  )
                }
              />
              <div className="header-spacer" />
              <AccountMeter />
              <span className="zone-divider" />
              {section === 'references' && (
                <button className="with-icon" onClick={() => openReferenceFolder(selected)}>
                  <Icon name="folder" /> 폴더 열기
                </button>
              )}
              <button className="with-icon" onClick={() => exportItem(section, selected)}>
                <Icon name="export" /> JSON 내보내기
              </button>
              <span className="zone-divider" />
              <button className="with-icon" onClick={() => void duplicateItem(section, selected)}>
                <Icon name="copy" /> 복제
              </button>
              <span className="zone-divider" />
              <button
                className="with-icon danger-quiet"
                onClick={() => void deleteItem(section, selected)}
              >
                <Icon name="trash" /> 삭제
              </button>
            </header>
            <UsedBy section={section} id={selected.id} />
            <div className={`library-editor-body ${section === 'references' ? 'fill' : ''}`}>
              <LibraryItemEditor section={section} item={selected} />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h2>{label.title}이(가) 없습니다</h2>
            <button className="accent" onClick={add}>
              ＋ 추가
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
