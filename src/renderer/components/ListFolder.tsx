import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FolderColor } from '../../core/domain/types';
import { FOLDER_COLORS, setFolderColor, type FolderCollection } from '../../core/model/folders';
import { toggleFolder, updateLibrary, useStore } from '../store';
import { useUiOption } from '../uiOptions';
import { folderColorClass, folderKey, useFolderColor } from './listFolders';
import { showContextMenu, type MenuItem } from './contextMenuStore';
import { focusAndSelect } from './focusAndSelect';
import { Icon } from './Icon';
import { readDragPayload, writeDragPayload, type DragPayload } from './listDrag';

const COLOR_NAMES: Record<FolderColor, string> = {
  red: '빨강',
  orange: '주황',
  yellow: '노랑',
  green: '초록',
  teal: '청록',
  blue: '파랑',
  purple: '보라',
  pink: '분홍',
};

function folderColorMenu(
  scope: FolderCollection,
  name: string,
  current: FolderColor | undefined,
): MenuItem[] {
  return [
    { heading: '폴더 색' },
    {
      swatches: [
        { id: '', label: '색 없음', className: 'no-color', active: !current },
        ...FOLDER_COLORS.map((color) => ({
          id: color,
          label: COLOR_NAMES[color],
          className: folderColorClass(color),
          active: color === current,
        })),
      ],
      onPick: (id) =>
        updateLibrary((library) =>
          setFolderColor(library, scope, name, (id || undefined) as FolderColor | undefined),
        ),
    },
  ];
}

/** 제목에 항목을 놓으면 폴더 끝으로 들어가고, 제목을 끌면 폴더째 옮긴다. */
export function ListFolder(props: {
  scope: FolderCollection;
  name: string;
  count: number;
  dragType: string;
  renaming: boolean;
  setRenaming: (renaming: boolean) => void;
  onRename: (name: string) => void;
  onUngroup: () => void;
  onPickAll: () => void;
  startDrag: () => DragPayload;
  endDrag: () => void;
  onDrop: (payload: DragPayload) => void;
  children: ReactNode;
}) {
  const folded = useStore((state) =>
    state.foldedFolders.includes(folderKey(props.scope, props.name)),
  );
  const color = useFolderColor(props.scope, props.name);
  const [over, setOver] = useState(false);
  // 엔터·Esc 뒤에 따라오는 blur가 다시 저장하지 않게 한다.
  const done = useRef(false);
  useEffect(() => {
    if (props.renaming) done.current = false;
  }, [props.renaming]);
  const toggle = () => toggleFolder(folderKey(props.scope, props.name));
  const commit = (value: string) => {
    if (done.current) return;
    done.current = true;
    props.setRenaming(false);
    const name = value.trim();
    if (name && name !== props.name) props.onRename(name);
  };

  return (
    <div className={`list-folder ${folded ? 'folded' : ''} ${folderColorClass(color)}`}>
      <div
        className={`list-folder-head ${over ? 'drop-target' : ''}`}
        draggable={!props.renaming}
        onContextMenu={(event) =>
          showContextMenu(event, [
            { label: folded ? '펼치기' : '접기', onSelect: toggle },
            { label: '이름 변경', onSelect: () => props.setRenaming(true) },
            { label: '안의 항목 모두 선택', onSelect: props.onPickAll },
            'divider',
            ...folderColorMenu(props.scope, props.name, color),
            'divider',
            { label: '폴더 풀기', hint: '항목은 그대로 둡니다', onSelect: props.onUngroup },
          ])
        }
        onDragStart={(event) => writeDragPayload(event, props.dragType, props.startDrag())}
        onDragEnd={props.endDrag}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(props.dragType)) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          const payload = readDragPayload(event, props.dragType);
          setOver(false);
          if (!payload || payload.folder === props.name) return;
          event.preventDefault();
          event.stopPropagation();
          props.onDrop(payload);
        }}
      >
        {props.renaming ? (
          <span className="list-folder-toggle">
            <Icon name="folder" size={15} className="folder-icon" />
            <input
              className="library-item-rename"
              defaultValue={props.name}
              aria-label="폴더 이름"
              ref={focusAndSelect}
              onBlur={(event) => commit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit(event.currentTarget.value);
                if (event.key === 'Escape') {
                  done.current = true;
                  props.setRenaming(false);
                }
              }}
            />
          </span>
        ) : (
          <button
            className="list-folder-toggle"
            aria-expanded={!folded}
            onClick={toggle}
            onDoubleClick={() => props.setRenaming(true)}
          >
            <Icon name="chevron" size={12} className="section-chevron" />
            <Icon name="folder" size={15} className="folder-icon" />
            <b>{props.name}</b>
            <span className="count">{props.count}</span>
          </button>
        )}
      </div>
      {!folded && <div className="list-folder-body">{props.children}</div>}
    </div>
  );
}

/** 아이콘 폭까지 줄인 목록의 폴더. 이름 대신 폴더 아이콘과 항목 수를 보인다. `itemClass`는 그 목록의 항목 버튼 모양. */
export function IconFolder(props: {
  scope: FolderCollection;
  name: string;
  count: number;
  /** 툴팁의 항목 이름(작업, 생성 설정 …) */
  unit: string;
  folded: boolean;
  itemClass: string;
  children: ReactNode;
}) {
  const grouped = useUiOption('iconFolders');
  const color = useFolderColor(props.scope, props.name);
  const toggle = () => toggleFolder(folderKey(props.scope, props.name));
  if (!grouped) return props.children;
  return (
    <div className={`icon-folder ${props.folded ? 'folded' : ''} ${folderColorClass(color)}`}>
      <button
        className={`${props.itemClass} icon-folder-toggle`}
        aria-expanded={!props.folded}
        title={`${props.name} · ${props.unit} ${props.count}개 · ${props.folded ? '펼치기' : '접기'}`}
        onClick={toggle}
        onContextMenu={(event) =>
          showContextMenu(event, [
            { label: props.folded ? '펼치기' : '접기', onSelect: toggle },
            'divider',
            ...folderColorMenu(props.scope, props.name, color),
          ])
        }
      >
        <span className="avatar">
          <Icon name="folder" className="folder-icon" />
        </span>
        <span className="pill">{props.count}</span>
      </button>
      {!props.folded && props.children}
    </div>
  );
}
