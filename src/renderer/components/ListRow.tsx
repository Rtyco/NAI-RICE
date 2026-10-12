import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useRenameRequest } from '../renameRequest';
import { showContextMenu } from './ContextMenu';
import { focusAndSelect } from './focusAndSelect';
import { Icon } from './Icon';
import { readDragPayload, writeDragPayload, type DragPayload } from './listDrag';
import { listMenu, type ListMenuActions } from './listMenu';

/** 사이드바 작업 목록과 라이브러리 목록의 한 줄. 사이드바를 접으면 열기·끌기·우클릭만 된다. */
export function ListRow(props: {
  id: string;
  name: string;
  /** 사이드바 작업 줄. 줄과 버튼에 작업 목록용 class를 더한다. */
  project?: boolean;
  avatar?: ReactNode;
  subtitle: string;
  badge?: ReactNode;
  renameLabel: string;
  deleteTitle: string;
  collapsed: boolean;
  active: boolean;
  dragType: string;
  dragging: boolean;
  /** 끌기를 시작할 때 옮길 항목들을 정한다(고른 항목 중 하나를 끌면 고른 것 모두). */
  startDrag: (id: string) => DragPayload;
  endDrag: () => void;
  dropHere: (payload: DragPayload) => void;
  /** 상자·Ctrl·Shift로 여러 개를 고른 상태인지. */
  picked: boolean;
  /** Ctrl·Shift 클릭이면 선택만 바꾸고 true를 돌려준다. */
  onPick: (event: MouseEvent) => boolean;
  open: () => void;
  rename: (name: string) => void;
  remove: () => void;
  menu: Omit<ListMenuActions, 'open' | 'rename' | 'remove'>;
}) {
  const { collapsed } = props;
  const [over, setOver] = useState(false);
  const [renaming, setRenamingState] = useState(false);
  // 엔터·Esc로 끝낸 뒤 따라오는 blur가 다시 저장하지 않게 한다.
  const editing = useRef(false);
  const setRenaming = (value: boolean) => {
    editing.current = value;
    setRenamingState(value);
  };
  useRenameRequest(props.active && !collapsed, () => setRenaming(true));

  const commitName = (value: string) => {
    if (!editing.current) return;
    setRenaming(false);
    const name = value.trim();
    if (name && name !== props.name) props.rename(name);
  };
  const mainClass = `library-item-main${props.project ? ' project-item' : ''}`;

  return (
    <div
      className={`library-item${props.project ? ' project-row' : ''} ${props.active ? 'selected' : ''} ${props.picked ? 'picked' : ''} ${over ? 'drop-target' : ''} ${props.dragging ? 'dragging' : ''}`}
      data-select-id={collapsed ? undefined : props.id}
      draggable={!renaming}
      onContextMenu={(event) =>
        showContextMenu(
          event,
          listMenu({
            ...props.menu,
            open: props.open,
            rename: collapsed ? undefined : () => setRenaming(true),
            remove: props.remove,
            pickedCount: props.picked ? props.menu.pickedCount : 0,
            group: collapsed ? undefined : props.menu.group,
            ungroup: collapsed ? undefined : props.menu.ungroup,
          }),
        )
      }
      onDragStart={(event) => writeDragPayload(event, props.dragType, props.startDrag(props.id))}
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
        if (!payload || payload.ids.includes(props.id)) return;
        event.preventDefault();
        event.stopPropagation();
        props.dropHere(payload);
      }}
    >
      {renaming ? (
        <div className={mainClass}>
          {props.avatar}
          <span className="project-meta">
            <input
              className="library-item-rename"
              defaultValue={props.name}
              aria-label={props.renameLabel}
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
          className={mainClass}
          title={
            collapsed
              ? props.name
              : '두 번 클릭: 이름 변경 · 끌어서 순서 변경 · Ctrl·Shift 클릭: 여러 개 선택'
          }
          onClick={(event) => {
            if (collapsed || !props.onPick(event)) props.open();
          }}
          onDoubleClick={() => !collapsed && setRenaming(true)}
        >
          {props.avatar}
          {!collapsed && (
            <span className="project-meta">
              <b>{props.name || '(이름 없음)'}</b>
              <small>{props.subtitle}</small>
            </span>
          )}
          {props.badge}
        </button>
      )}
      {!collapsed && !renaming && (
        <button
          className="icon-button danger item-actions"
          title={props.deleteTitle}
          onClick={props.remove}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}
