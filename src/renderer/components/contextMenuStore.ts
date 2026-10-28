import type { MouseEvent as ReactMouseEvent } from 'react';
import { create } from 'zustand';

export type MenuItem =
  | { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  /** 누를 수 없는 작은 제목 */
  | { heading: string }
  /** 한 줄의 색 단추. `className`이나 `color`가 색을 정한다. */
  | {
      swatches: Array<{
        id: string;
        label: string;
        className?: string;
        color?: string;
        active: boolean;
      }>;
      onPick: (id: string) => void;
    }
  | 'divider';

export const useContextMenu = create<{ x: number; y: number; items: MenuItem[] } | null>(
  () => null,
);

export function showContextMenu(event: ReactMouseEvent, items: MenuItem[]): void {
  event.preventDefault();
  event.stopPropagation();
  useContextMenu.setState({ x: event.clientX, y: event.clientY, items }, true);
}

export function closeContextMenu(): void {
  useContextMenu.setState(null, true);
}
