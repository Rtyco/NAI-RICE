import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toggleFolder, useStore } from '../store';
import { folderKey } from './listFolders';
import { showContextMenu } from './contextMenuStore';
import { focusAndSelect } from './focusAndSelect';
import { Icon } from './Icon';
import { readDragPayload, writeDragPayload, type DragPayload } from './listDrag';

/** 제목에 항목을 놓으면 폴더 끝으로 들어가고, 제목을 끌면 폴더째 옮긴다. */
export function ListFolder(props: {
  scope: string;
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
    <div className={`list-folder ${folded ? 'folded' : ''}`}>
      <div
        className={`list-folder-head ${over ? 'drop-target' : ''}`}
        draggable={!props.renaming}
        onContextMenu={(event) =>
          showContextMenu(event, [
            { label: folded ? '펼치기' : '접기', onSelect: toggle },
            { label: '이름 변경', onSelect: () => props.setRenaming(true) },
            { label: '안의 항목 모두 선택', onSelect: props.onPickAll },
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
            <Icon name="folder" size={15} />
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
            title="누르면 접고 폅니다 · 두 번 클릭: 이름 변경 · 끌어서 폴더째 옮기기"
            onClick={toggle}
            onDoubleClick={() => props.setRenaming(true)}
          >
            <Icon name="chevron" size={12} className="section-chevron" />
            <Icon name="folder" size={15} />
            <b>{props.name}</b>
            <span className="count">{props.count}</span>
          </button>
        )}
      </div>
      {!folded && <div className="list-folder-body">{props.children}</div>}
    </div>
  );
}
