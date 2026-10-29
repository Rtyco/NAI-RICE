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
  /** 우클릭 메뉴에서 이름 뒤에 붙는 글자 */
  accessKey?: string;
  /** 막대 툴팁과 우클릭 메뉴 오른쪽에 보인다. */
  shortcut?: string;
  disabled?: boolean;
  active?: boolean;
  /** 결과 막대에서 아이콘만 보인다. 우클릭 메뉴에는 이름이 나온다. */
  iconOnly?: boolean;
  /** 결과 막대에는 없고 우클릭 메뉴에만 있다. */
  menuOnly?: boolean;
  /** 좁은 결과 막대에서 이름을 다른 버튼보다 늦게 뺀다. */
  keepLabel?: boolean;
  /** 아이콘만으로도 넘치는 결과 막대에서 ⋯ 메뉴로 접는 순서. 작을수록 먼저, 없으면 접지 않는다. */
  fold?: number;
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

export function resultTitle(action: ResultAction): string {
  return action.title ?? (action.shortcut ? `${action.label} (${action.shortcut})` : action.label);
}

export function resultMenuItem(action: ResultAction): MenuItem {
  return {
    label: action.label,
    onSelect: action.onSelect,
    disabled: action.disabled,
    danger: action.group === 'delete',
    accessKey: action.accessKey,
    hint: action.shortcut,
  };
}

export function showResultMenu(event: MouseEvent, actions: ResultAction[]): void {
  const items: MenuItem[] = [];
  for (const group of resultGroups(actions)) {
    if (items.length) items.push('divider');
    items.push(...group.map(resultMenuItem));
  }
  showContextMenu(event, items);
}
