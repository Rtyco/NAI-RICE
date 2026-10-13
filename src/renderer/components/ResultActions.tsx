import { Fragment, type MouseEvent } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { showContextMenu, type MenuItem } from './ContextMenu';
import { Modal, openDialog } from './Dialogs';
import { Icon, type IconName } from './Icon';
import { RecordInfo } from './RecordInfo';

export type ResultAction = {
  label: string;
  icon: IconName;
  onSelect: () => void;
  /** 같은 묶음끼리 붙이고 사이에 구분선. 목록은 묶음 순서대로 적는다. */
  group: 'main' | 'send' | 'file' | 'delete';
  title?: string;
  disabled?: boolean;
  active?: boolean;
  /** 결과 막대에서 아이콘만 보인다. 우클릭 메뉴에는 이름이 나온다. */
  iconOnly?: boolean;
};

function groups(actions: ResultAction[]): ResultAction[][] {
  const result: ResultAction[][] = [];
  for (const action of actions) {
    const last = result[result.length - 1];
    if (last && last[0].group === action.group) last.push(action);
    else result.push([action]);
  }
  return result;
}

/** 같은 목록을 `showResultMenu`도 쓴다. */
export function ResultBar(props: {
  projectId: string;
  record: GenerationSummary;
  actions: ResultAction[];
}) {
  const { record } = props;
  return (
    <div className="result-bar" role="toolbar" aria-label="선택한 결과">
      <button
        className="icon-button"
        title={`생성 정보 · seed ${record.seed}`}
        aria-label="생성 정보"
        onClick={() =>
          void openDialog((close) => (
            <Modal title={`생성 정보 · seed ${record.seed}`} onClose={close} wide>
              <RecordInfo projectId={props.projectId} record={record} />
            </Modal>
          ))
        }
      >
        <Icon name="info" size={14} />
      </button>
      {groups(props.actions).map((group) => (
        <Fragment key={group[0].group}>
          {group[0].group === 'file' ? (
            <span className="header-spacer" />
          ) : (
            group[0].group !== 'delete' && <span className="zone-divider" />
          )}
          {group.map((action) => (
            <button
              key={action.label}
              className={`${action.iconOnly ? 'icon-button' : 'with-icon'} ${action.group === 'delete' ? 'danger-quiet' : action.active ? 'active' : ''}`}
              disabled={action.disabled}
              title={action.iconOnly ? (action.title ?? action.label) : action.title}
              aria-label={action.label}
              onClick={action.onSelect}
            >
              <Icon name={action.icon} size={14} className={action.active ? 'filled' : ''} />
              {!action.iconOnly && action.label}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

export function showResultMenu(event: MouseEvent, actions: ResultAction[]): void {
  const items: MenuItem[] = [];
  for (const group of groups(actions)) {
    if (items.length) items.push('divider');
    for (const action of group)
      items.push({
        label: action.label,
        onSelect: action.onSelect,
        disabled: action.disabled,
        danger: action.group === 'delete',
      });
  }
  showContextMenu(event, items);
}
