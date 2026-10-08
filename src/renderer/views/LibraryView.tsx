import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Character, EmotionSet, PieceSet, Preset, Reference } from '../../core/domain/types';
import { projectsUsing } from '../../core/model/defaults';
import { moveItem } from '../../core/model/mutations';
import { showContextMenu } from '../components/ContextMenu';
import { AccountMeter } from '../components/AccountMeter';
import { Icon } from '../components/Icon';
import { focusAndSelect } from '../components/focusAndSelect';
import { sectionInfo } from '../sections';
import { importJsonFromPicker } from '../importers';
import { useBoxSelection } from '../components/useBoxSelection';
import {
  openLibrary,
  referenceMedia,
  updateLibrary,
  useLibrary,
  useStore,
  type LibrarySection,
} from '../store';
import { ReferenceEditor } from './ReferenceEditor';
import {
  createItem,
  deleteItem,
  deleteItems,
  duplicateItem,
  exportItem,
  itemMenu,
  openReferenceFolder,
  itemSubtitle,
  LABELS,
  withName,
  type Item,
} from './library/itemActions';
import { UsedBy } from './library/UsedBy';
import { PresetEditor } from './library/PresetEditor';
import { CharacterEditor } from './library/CharacterEditor';
import { EmotionSetEditor } from './library/EmotionSetEditor';
import { PieceSetEditor } from './library/PieceSetEditor';

const DRAG_TYPE = 'application/x-library-item';

/** 목록 한 줄. 끌어서 놓으면 순서를 바꾸고, 두 번 클릭하면 그 자리에서 이름을 바꾼다. */
function LibraryRow(props: {
  section: LibrarySection;
  item: Item;
  index: number;
  selected: boolean;
  subtitle: string;
  dragging: string | undefined;
  setDragging: (id: string | undefined) => void;
  /** 상자·Ctrl·Shift로 여러 개를 고른 상태인지. */
  picked: boolean;
  /** Ctrl·Shift 클릭이면 선택만 바꾸고 true를 돌려준다. */
  onPick: (event: MouseEvent) => boolean;
}) {
  const { section, item } = props;
  const [over, setOver] = useState(false);
  const [renaming, setRenamingState] = useState(false);
  // 엔터·Esc로 끝낸 뒤 따라오는 blur가 다시 저장하지 않게 한다.
  const editing = useRef(false);
  const setRenaming = (value: boolean) => {
    editing.current = value;
    setRenamingState(value);
  };
  const reference = section === 'references' ? (item as Reference) : undefined;

  const avatar = reference && (
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
      className={`library-item ${props.selected ? 'selected' : ''} ${props.picked ? 'picked' : ''} ${over ? 'drop-target' : ''} ${props.dragging === item.id ? 'dragging' : ''}`}
      data-select-id={item.id}
      draggable={!renaming}
      onContextMenu={(event) => showContextMenu(event, itemMenu(section, item))}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = 'move';
        props.setDragging(item.id);
      }}
      onDragEnd={() => props.setDragging(undefined)}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(DRAG_TYPE);
        setOver(false);
        if (!id || id === item.id) return;
        event.preventDefault();
        event.stopPropagation();
        updateLibrary((current) => moveItem(current, section, id, props.index));
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
          title="두 번 클릭: 이름 변경 · 끌어서 순서 변경 · Ctrl·Shift 클릭: 여러 개 선택"
          onClick={(event) => {
            if (!props.onPick(event)) openLibrary(section, item.id);
          }}
          onDoubleClick={() => setRenaming(true)}
        >
          {avatar}
          <span className="project-meta">
            <b>{item.name || '(이름 없음)'}</b>
            <small>{props.subtitle}</small>
          </span>
        </button>
      )}
      {!renaming && (
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
  const [dragging, setDragging] = useState<string>();
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
        label: '기본 감정 6개로 시작',
        hint: '중립·기쁨·슬픔·분노·놀람·부끄러움',
        onSelect: () => create(false),
      },
      { label: '빈 상태로 시작', onSelect: () => create(true) },
    ]);
  };

  let editor: ReactNode = null;
  if (selected) {
    if (section === 'presets') editor = <PresetEditor preset={selected as Preset} />;
    if (section === 'characters') editor = <CharacterEditor character={selected as Character} />;
    if (section === 'emotionSets') editor = <EmotionSetEditor set={selected as EmotionSet} />;
    if (section === 'references')
      editor = <ReferenceEditor key={selected.id} reference={selected as Reference} />;
    if (section === 'pieceSets') editor = <PieceSetEditor set={selected as PieceSet} />;
  }

  return (
    <div className="library-view">
      <aside className="library-list">
        <div className="library-list-head">
          <span className="chain-icon">
            <Icon name={sectionInfo(section).icon} size={18} />
          </span>
          <div>
            <small className="eyebrow">라이브러리</small>
            <b>{label.title}</b>
            {label.description && <small>{label.description}</small>}
          </div>
          <button className="accent" onClick={add}>
            ＋ 추가
          </button>
        </div>
        <nav className="selectable" {...selection.containerProps}>
          {items.map((item, index) => {
            const uses = projectsUsing(library, label.kind, item.id).length;
            return (
              <LibraryRow
                key={item.id}
                section={section}
                item={item}
                index={index}
                selected={item.id === selected?.id}
                subtitle={`${itemSubtitle(section, item)}${uses ? ` · 작업 ${uses}` : ''}`}
                dragging={dragging}
                setDragging={setDragging}
                picked={selection.isSelected(item.id)}
                onPick={(event) => selection.clickItem(event, item.id)}
              />
            );
          })}
          {!items.length && <p className="hint pad-x">아직 없습니다.</p>}
          {selection.boxElement}
        </nav>
        {selection.selected.size > 0 && (
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
        <button className="link-button" onClick={() => void importJsonFromPicker()}>
          JSON 가져오기
        </button>
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
              {section === 'references' && (
                <button className="with-icon" onClick={() => openReferenceFolder(selected)}>
                  <Icon name="folder" /> 폴더 열기
                </button>
              )}
              <button className="with-icon" onClick={() => exportItem(section, selected)}>
                <Icon name="export" /> JSON 내보내기
              </button>
              <button className="with-icon" onClick={() => void duplicateItem(section, selected)}>
                <Icon name="copy" /> 복제
              </button>
              <button
                className="with-icon danger-quiet"
                onClick={() => void deleteItem(section, selected)}
              >
                <Icon name="trash" /> 삭제
              </button>
            </header>
            <UsedBy section={section} id={selected.id} />
            <div className={`library-editor-body ${section === 'references' ? 'fill' : ''}`}>
              {editor}
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
