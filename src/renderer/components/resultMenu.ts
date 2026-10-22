import type { MouseEvent } from 'react';
import { showContextMenu, type MenuItem } from './contextMenuStore';
import type { IconName } from './Icon';

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

export function resultGroups(actions: ResultAction[]): ResultAction[][] {
  const result: ResultAction[][] = [];
  for (const action of actions) {
    const last = result[result.length - 1];
    if (last && last[0].group === action.group) last.push(action);
    else result.push([action]);
  }
  return result;
}

export function showResultMenu(event: MouseEvent, actions: ResultAction[]): void {
  const items: MenuItem[] = [];
  for (const group of resultGroups(actions)) {
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
