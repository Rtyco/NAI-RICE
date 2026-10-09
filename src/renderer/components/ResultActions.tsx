import type { MouseEvent } from 'react';
import { showContextMenu, type MenuItem } from './ContextMenu';
import { Icon, type IconName } from './Icon';

export type ResultAction = {
  label: string;
  icon: IconName;
  onSelect: () => void;
  title?: string;
  disabled?: boolean;
  /** 켜진 상태(대표 지정)를 버튼에 표시한다. */
  active?: boolean;
  danger?: boolean;
};

/** 결과 화면 오른쪽 「선택한 결과」 버튼들. 같은 목록을 이미지 우클릭 메뉴(`showResultMenu`)도 쓴다. */
export function ResultButtons({ actions }: { actions: ResultAction[] }) {
  return (
    <div className="button-grid">
      {actions.map((action) => (
        <button
          key={action.label}
          className={action.danger ? 'danger-quiet' : action.active ? 'active' : ''}
          disabled={action.disabled}
          title={action.title}
          onClick={action.onSelect}
        >
          <Icon name={action.icon} size={14} className={action.active ? 'filled' : ''} />{' '}
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function showResultMenu(event: MouseEvent, actions: ResultAction[]): void {
  const items: MenuItem[] = [];
  for (const action of actions) {
    if (action.danger) items.push('divider');
    items.push({
      label: action.label,
      onSelect: action.onSelect,
      disabled: action.disabled,
      danger: action.danger,
    });
  }
  showContextMenu(event, items);
}
