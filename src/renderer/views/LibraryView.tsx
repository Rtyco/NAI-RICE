import { useState, type MouseEvent, type ReactNode } from 'react';
import type { CharacterReference, Reference, Vibe } from '../../core/domain/types';
import { projectsUsing } from '../../core/model/defaults';
import {
  groupIntoFolder,
  listRows,
  moveIntoFolder,
  moveNextTo,
  newFolderName,
  renameFolder,
  setFolder,
  ungroupFolder,
} from '../../core/model/folders';
import { showContextMenu } from '../components/contextMenuStore';
import { AccountMeter } from '../components/AccountMeter';
import { Icon } from '../components/Icon';
import { PanelResizer } from '../components/PanelResizer';
import { SidePanelToggle } from '../components/SidePanelToggle';
import { importJsonFromPicker } from '../importers';
import { useBoxSelection } from '../components/useBoxSelection';
import { dragPayload } from '../components/listDrag';
import { ListFolder } from '../components/ListFolder';
import { ListRow } from '../components/ListRow';
import { folderKey, useFoldedFolders, useGroupTarget } from '../components/listFolders';
import {
  cycleLibraryList,
  libraryListStageOf,
  openLibrary,
  pictureMedia,
  referenceMedia,
  stageTitle,
  toggleFolder,
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
  exportVibeItems,
  importVibeFromPicker,
  openReferenceFolder,
  itemSubtitle,
  withName,
  type Item,
} from './library/itemActions';
import { UsedBy } from './library/UsedBy';
import { LibraryItemEditor } from './library/LibraryEditorDialog';
import { exportable, sectionInfo } from '../sections';
import { useShortcut } from '../useShortcut';

const DRAG_TYPE = 'application/x-library-item';

function itemAvatar(section: LibrarySection, item: Item, collapsed: boolean): ReactNode {
  const reference = section === 'references' ? (item as Reference) : undefined;
  const picture =
    section === 'characterReferences' || section === 'vibes'
      ? { image: (item as CharacterReference | Vibe).image }
      : undefined;
  const thumb = reference?.image
    ? referenceMedia(reference.id, reference.image.originalFile, reference.updatedAt)
    : picture?.image && pictureMedia(picture.image.file);
  if (reference || picture)
    return (
      <span className="avatar">{thumb ? <img src={thumb} alt="" draggable={false} /> : '?'}</span>
    );
  return collapsed && <span className="avatar">{item.name.slice(0, 1) || '?'}</span>;
}

export function LibraryView({ section, itemId }: { section: LibrarySection; itemId?: string }) {
  const library = useLibrary();
  const items = library[section] as Item[];
  const selected = items.find((item) => item.id === itemId) ?? items[0];
  const info = sectionInfo(section);
  const [dragging, setDragging] = useState<string[]>([]);
  const stage = useStore(libraryListStageOf);
  const collapsed = stage === 'icons';
  const listTitle = stageTitle(`${info.label} 목록`, 'libraryListStage', stage, 'F7');
  const reopenList = stage === 'hidden' && (
    <button
      className="icon-button panel-reopen"
      title={listTitle}
      aria-label={listTitle}
      onClick={cycleLibraryList}
    >
      <Icon name={info.icon} size={18} />
      <Icon name="chevron" size={12} />
    </button>
  );
  const removeMany = (ids: string[]) =>
    void deleteItems(
      section,
      items.filter((item) => ids.includes(item.id)),
    );
  const rows = listRows(items);
  const isFolded = useFoldedFolders(section);
  // 접힌 폴더 안은 건너뛴다.
  const visibleIds = rows.flatMap((row) =>
    row.kind === 'item'
      ? [row.item.id]
      : isFolded(row.name)
        ? []
        : row.items.map((item) => item.id),
  );
  const selection = useBoxSelection<HTMLElement>(visibleIds, removeMany, {
    selectAllKey: () => library[section].map((item) => item.id),
  });
  const [renamingFolder, setRenamingFolder] = useState<string>();
  const group = (ids: string[]) => {
    const name = newFolderName(useStore.getState().library![section] as Item[]);
    updateLibrary((current) => groupIntoFolder(current, section, ids, name));
    toggleFolder(folderKey(section, name), false);
    selection.clear();
    setRenamingFolder(name);
  };
  const touch = useGroupTarget({
    picked: () => (collapsed ? [] : [...selection.selected]),
    current: () => (collapsed ? undefined : selected?.id),
    group,
  });
  const step = (offset: number) => {
    const next = visibleIds[visibleIds.indexOf(selected?.id ?? '') + offset];
    if (next) openLibrary(section, next);
  };
  useShortcut('Alt+ArrowUp', () => step(-1));
  useShortcut('Alt+ArrowDown', () => step(1));
  useShortcut('Ctrl+Shift+N', () =>
    openLibrary(section, createItem(section, useStore.getState().library!)),
  );
  useShortcut('Ctrl+Shift+D', () => selected && void duplicateItem(section, selected));
  // 여러 개를 고른 동안의 Delete는 useBoxSelection이 처리한다.
  useShortcut(
    'Delete',
    () => selected && void deleteItem(section, selected),
    !selection.selected.size,
  );
  const renderItem = (item: Item) => {
    const uses = projectsUsing(library, info.kind, item.id).length;
    const picked = !collapsed && selection.isSelected(item.id);
    return (
      <ListRow
        key={item.id}
        id={item.id}
        name={item.name}
        avatar={itemAvatar(section, item, collapsed)}
        subtitle={`${itemSubtitle(section, item)}${uses ? ` · 작업 ${uses}` : ''}`}
        renameLabel="이름"
        deleteTitle="삭제"
        collapsed={collapsed}
        active={item.id === selected?.id}
        dragType={DRAG_TYPE}
        dragging={dragging.includes(item.id)}
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
        dropHere={(payload) =>
          updateLibrary((current) =>
            moveNextTo(
              current,
              section,
              payload.ids,
              payload.grabbed,
              item.id,
              Boolean(payload.folder),
            ),
          )
        }
        picked={picked}
        onPick={(event) => selection.clickItem(event, item.id)}
        open={() => openLibrary(section, item.id)}
        rename={(name) => updateLibrary((current) => withName(current, section, item.id, name))}
        remove={() => void deleteItem(section, item)}
        menu={{
          duplicate: () => void duplicateItem(section, item),
          exportJson: exportable(section) ? () => exportItem(section, item) : undefined,
          exportVibes:
            section === 'vibes'
              ? () => exportVibeItems(picked ? [...selection.selected] : [item.id])
              : undefined,
          pickedCount: selection.selected.size,
          removePicked: () => removeMany([...selection.selected]),
          group: () => group(picked ? [...selection.selected] : [item.id]),
          ungroup: item.folder
            ? () => updateLibrary((current) => setFolder(current, section, [item.id], undefined))
            : undefined,
        }}
      />
    );
  };
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
    <div className={`library-view list-${stage}`}>
      <aside
        className={`library-list ${collapsed ? 'collapsed' : ''} ${stage === 'hidden' ? 'stage-hidden' : ''}`}
      >
        <div className="library-list-head">
          <button
            className="icon-button library-list-toggle"
            title={listTitle}
            aria-label={listTitle}
            onClick={cycleLibraryList}
          >
            <Icon name="chevron-left" size={18} />
          </button>
          {!collapsed && (
            <>
              <div className="library-list-title">
                <b>{info.label}</b>
                {info.usage && <small>{info.usage}</small>}
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
          onPointerDownCapture={touch}
        >
          {(collapsed
            ? rows.flatMap((row) =>
                row.kind === 'item'
                  ? [row]
                  : row.items.map((item) => ({ kind: 'item' as const, item })),
              )
            : rows
          ).map((row) => {
            if (row.kind === 'folder')
              return (
                <ListFolder
                  key={`folder:${row.name}`}
                  scope={section}
                  name={row.name}
                  count={row.items.length}
                  dragType={DRAG_TYPE}
                  renaming={renamingFolder === row.name}
                  setRenaming={(on) => setRenamingFolder(on ? row.name : undefined)}
                  onRename={(name) => {
                    toggleFolder(folderKey(section, name), isFolded(row.name));
                    updateLibrary((current) => renameFolder(current, section, row.name, name));
                  }}
                  onUngroup={() =>
                    updateLibrary((current) => ungroupFolder(current, section, row.name))
                  }
                  onPickAll={() => selection.selectAll(row.items.map((item) => item.id))}
                  startDrag={() => {
                    const ids = row.items.map((item) => item.id);
                    setDragging(ids);
                    return { ids, grabbed: ids[0], folder: row.name };
                  }}
                  endDrag={() => setDragging([])}
                  onDrop={(payload) =>
                    updateLibrary((current) =>
                      payload.folder
                        ? moveNextTo(
                            current,
                            section,
                            payload.ids,
                            payload.grabbed,
                            row.items[0].id,
                            true,
                          )
                        : moveIntoFolder(current, section, payload.ids, row.name),
                    )
                  }
                >
                  {row.items.map(renderItem)}
                </ListFolder>
              );
            return renderItem(row.item);
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
          <div className={`selection-bar ${section === 'vibes' ? 'wide' : ''}`}>
            <span className="selection-count">
              {selection.selected.size}개<span className="bar-label"> 선택</span>
            </span>
            <button
              className="with-icon"
              title="고른 항목을 새 폴더로 묶습니다 (Ctrl+G)"
              onClick={() => group([...selection.selected])}
            >
              <Icon name="folder" size={14} />
              <span className="bar-label">묶기</span>
            </button>
            {section === 'vibes' && (
              <button
                className="with-icon"
                title="고른 바이브를 NovelAI 바이브 묶음(.naiv4vibeBundle)으로 저장합니다"
                onClick={() => exportVibeItems([...selection.selected])}
              >
                <Icon name="export" size={14} />
                <span className="bar-label">내보내기</span>
              </button>
            )}
            <button
              className="with-icon danger-quiet"
              title="고른 항목을 삭제합니다"
              onClick={() => removeMany([...selection.selected])}
            >
              <Icon name="trash" size={14} />
              <span className="bar-label">삭제</span>
            </button>
            <button
              className="link-button with-icon"
              title="선택 취소 (Esc)"
              onClick={selection.clear}
            >
              <Icon name="close" size={14} />
              <span className="bar-label">선택 취소</span>
            </button>
          </div>
        )}
        {!collapsed && section === 'vibes' && (
          <button className="link-button" onClick={importVibeFromPicker}>
            바이브 파일 가져오기
          </button>
        )}
        {!collapsed && (
          <button className="link-button" onClick={() => void importJsonFromPicker()}>
            JSON 가져오기
          </button>
        )}
      </aside>
      {stage === 'open' && <PanelResizer panel="library-list" />}
      <section className="library-editor animate-in" key={selected?.id ?? 'empty'}>
        {selected ? (
          <>
            <header className="library-editor-head">
              {reopenList}
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
              {exportable(section) && (
                <>
                  <button className="with-icon" onClick={() => exportItem(section, selected)}>
                    <Icon name="export" /> JSON 내보내기
                  </button>
                  <span className="zone-divider" />
                </>
              )}
              {section === 'vibes' && (
                <>
                  <button
                    className="with-icon"
                    title="NovelAI 웹에서 가져올 수 있는 .naiv4vibe 파일로 저장합니다"
                    onClick={() => exportVibeItems([selected.id])}
                  >
                    <Icon name="export" /> 바이브 파일로 내보내기
                  </button>
                  <span className="zone-divider" />
                </>
              )}
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
              {section === 'references' && <SidePanelToggle />}
            </header>
            <UsedBy section={section} id={selected.id} />
            <div className={`library-editor-body ${section === 'references' ? 'fill' : ''}`}>
              <LibraryItemEditor section={section} item={selected} />
            </div>
          </>
        ) : (
          <div className="empty-state">
            {reopenList}
            <h2>{info.label}이(가) 없습니다</h2>
            <button className="accent" onClick={add}>
              ＋ 추가
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
