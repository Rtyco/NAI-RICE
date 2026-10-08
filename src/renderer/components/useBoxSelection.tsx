import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

type Box = { left: number; top: number; width: number; height: number };

const EDGE = 28;

/**
 * 빈 곳에서 끌면 상자가 나타나고 상자에 걸친 항목을 선택한다(탐색기와 같은 방식).
 * 항목은 data-select-id를 가진 요소이고, 항목 위에서 끌면 원래 동작(순서 바꾸기)을 그대로 쓴다.
 * Ctrl+클릭은 하나씩 더하거나 빼고, Shift+클릭은 범위를 고른다. Delete는 선택을 지우고 Esc는 해제한다.
 */
export function useBoxSelection<T extends HTMLElement>(
  ids: string[],
  onDelete: (ids: string[]) => void,
) {
  const ref = useRef<T>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [box, setBox] = useState<Box | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    pointerId: number;
    base: Set<string>;
    moved: boolean;
  } | null>(null);
  const anchor = useRef<string | undefined>(undefined);
  const key = ids.join('\n');

  // 지워졌거나 다른 목록으로 바뀐 항목은 선택에서 뺀다.
  useEffect(() => {
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => ids.includes(id)));
      return next.size === previous.size ? previous : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  useEffect(() => {
    if (!selected.size) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.modal-backdrop')) return;
      if (event.key === 'Delete') {
        event.preventDefault();
        onDeleteRef.current([...selected]);
      } else if (event.key === 'Escape') {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  /** 컨테이너 안쪽(스크롤 포함) 좌표. */
  const point = (event: { clientX: number; clientY: number }) => {
    const element = ref.current!;
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + element.scrollLeft,
      y: event.clientY - rect.top + element.scrollTop,
    };
  };

  /** 포인터 위치까지 상자를 늘리고 상자에 걸친 항목을 고른다. */
  const extend = (event: { clientX: number; clientY: number }) => {
    const current = drag.current;
    const element = ref.current;
    if (!current || !element) return;
    const bounds = element.getBoundingClientRect();
    const end = point(event);
    if (!current.moved && Math.hypot(end.x - current.x, end.y - current.y) < 4) return;
    current.moved = true;
    const next: Box = {
      left: Math.min(current.x, end.x),
      top: Math.min(current.y, end.y),
      width: Math.abs(end.x - current.x),
      height: Math.abs(end.y - current.y),
    };
    setBox(next);
    const hits = new Set(current.base);
    for (const item of Array.from(element.querySelectorAll<HTMLElement>('[data-select-id]'))) {
      const rect = item.getBoundingClientRect();
      const left = rect.left - bounds.left + element.scrollLeft;
      const top = rect.top - bounds.top + element.scrollTop;
      if (
        left < next.left + next.width &&
        left + rect.width > next.left &&
        top < next.top + next.height &&
        top + rect.height > next.top
      )
        hits.add(item.dataset.selectId!);
    }
    setSelected(hits);
  };

  const containerProps = {
    ref,
    onPointerDown: (event: PointerEvent<T>) => {
      if (event.button !== 0 || !ref.current) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          '[data-select-id], button, input, select, textarea, a, label, [contenteditable="true"]',
        )
      )
        return;
      const start = point(event);
      drag.current = {
        ...start,
        pointerId: event.pointerId,
        base: event.ctrlKey || event.shiftKey ? new Set(selected) : new Set(),
        moved: false,
      };
      ref.current.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove: (event: PointerEvent<T>) => {
      const current = drag.current;
      const element = ref.current;
      if (!current || !element || current.pointerId !== event.pointerId) return;
      const bounds = element.getBoundingClientRect();
      if (event.clientY < bounds.top + EDGE) element.scrollTop -= 12;
      else if (event.clientY > bounds.bottom - EDGE) element.scrollTop += 12;
      extend(event);
    },
    onPointerUp: (event: PointerEvent<T>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      // 마지막 이동이 앞 이동과 합쳐져 빠질 수 있으므로 놓은 위치로 한 번 더 계산한다.
      extend(event);
      drag.current = null;
      setBox(null);
      // 빈 곳을 그냥 누르면 선택을 해제한다(Ctrl·Shift를 누르고 있으면 그대로 둔다).
      if (!current.moved) setSelected(current.base);
    },
    onPointerCancel: () => {
      drag.current = null;
      setBox(null);
    },
  };

  /**
   * 항목을 누를 때 부른다. Ctrl·Shift 클릭이면 선택만 바꾸고 true를 돌려준다.
   * 그냥 클릭이면 선택을 비우고 false를 돌려주므로 원래 동작(열기)을 이어서 하면 된다.
   */
  const clickItem = (event: MouseEvent, id: string): boolean => {
    if (event.ctrlKey || event.metaKey) {
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
      return true;
    }
    if (event.shiftKey && anchor.current && ids.includes(anchor.current)) {
      const [from, to] = [ids.indexOf(anchor.current), ids.indexOf(id)].sort((a, b) => a - b);
      setSelected(new Set(ids.slice(from, to + 1)));
      return true;
    }
    anchor.current = id;
    if (selected.size) setSelected(new Set());
    return false;
  };

  const boxElement = box && (
    <div
      className="select-box"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    />
  );

  return {
    containerProps,
    selected,
    clear: () => setSelected(new Set()),
    /** 주어진 항목만 고른 상태로 바꾼다. */
    selectAll: (only: string[]) => setSelected(new Set(only)),
    clickItem,
    boxElement,
    isSelected: (id: string) => selected.has(id),
  };
}
