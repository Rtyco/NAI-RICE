import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';

import { edgeScrollStep } from './edgeScroll';

/** 항목 위치. 컨테이너 안쪽(스크롤 포함) 좌표라 스크롤해도 다시 잴 필요가 없다. */
type ItemRect = { id: string; left: number; top: number; right: number; bottom: number };

function isCtrl(event: KeyboardEvent, key: string): boolean {
  return event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === key;
}

/**
 * 빈 곳에서 끌면 상자가 나타나고 상자에 걸친 항목을 선택한다(탐색기와 같은 방식).
 * 항목은 data-select-id를 가진 요소이고, 항목 위에서 끌면 원래 동작(순서 바꾸기)을 그대로 쓴다.
 * Ctrl+클릭은 하나씩 더하거나 빼고, Shift+클릭은 범위를 고른다. Delete는 선택을 지우고 Esc·Ctrl+D는 해제한다.
 * `selectAllKey`를 주면 Ctrl+A로 그 항목들을 고른다. 화면의 본문 목록 하나에만 준다(사이드바처럼 늘 떠 있는
 * 목록에 주면 본문과 함께 골라진다).
 */
export function useBoxSelection<T extends HTMLElement>(
  ids: string[],
  onDelete: (ids: string[]) => void,
  options: { selectAllKey?: () => string[] } = {},
) {
  const ref = useRef<T>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    pointerId: number;
    base: Set<string>;
    moved: boolean;
    clientX: number;
    clientY: number;
    items?: ItemRect[];
    frame: number;
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
      } else if (isCtrl(event, 'd')) {
        event.preventDefault();
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const selectAllKey = useRef(options.selectAllKey);
  selectAllKey.current = options.selectAllKey;
  const hasSelectAllKey = Boolean(options.selectAllKey);
  useEffect(() => {
    if (!hasSelectAllKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isCtrl(event, 'a')) return;
      // 입력 칸에서는 브라우저 기본 동작(글자 전체 선택)을 둔다.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.modal-backdrop')) return;
      event.preventDefault();
      setSelected(new Set(selectAllKey.current?.() ?? []));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSelectAllKey]);

  /** 컨테이너 안쪽(스크롤 포함) 좌표. */
  const point = (event: { clientX: number; clientY: number }) => {
    const element = ref.current!;
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + element.scrollLeft,
      y: event.clientY - rect.top + element.scrollTop,
    };
  };

  /**
   * 포인터 위치까지 상자를 늘리고 상자에 걸친 항목을 고른다. 끄는 동안 매 이동마다 React로 다시 그리면 항목이
   * 많은 목록에서 버벅이므로, 상자는 DOM에 바로 그리고 고른 것이 달라질 때만 상태를 바꾼다.
   */
  const extend = () => {
    const current = drag.current;
    const element = ref.current;
    if (!current || !element) return;
    const end = point({ clientX: current.clientX, clientY: current.clientY });
    if (!current.moved && Math.hypot(end.x - current.x, end.y - current.y) < 4) return;
    current.moved = true;
    const left = Math.min(current.x, end.x);
    const top = Math.min(current.y, end.y);
    const right = Math.max(current.x, end.x);
    const bottom = Math.max(current.y, end.y);
    const box = boxRef.current;
    if (box)
      Object.assign(box.style, {
        display: 'block',
        left: `${left}px`,
        top: `${top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
      });
    if (!current.items) {
      const bounds = element.getBoundingClientRect();
      current.items = Array.from(element.querySelectorAll<HTMLElement>('[data-select-id]')).map(
        (item) => {
          const rect = item.getBoundingClientRect();
          const itemLeft = rect.left - bounds.left + element.scrollLeft;
          const itemTop = rect.top - bounds.top + element.scrollTop;
          return {
            id: item.dataset.selectId!,
            left: itemLeft,
            top: itemTop,
            right: itemLeft + rect.width,
            bottom: itemTop + rect.height,
          };
        },
      );
    }
    const hits = new Set(current.base);
    for (const item of current.items)
      if (item.left < right && item.right > left && item.top < bottom && item.bottom > top)
        hits.add(item.id);
    const previous = selectedRef.current;
    if (hits.size !== previous.size || [...hits].some((id) => !previous.has(id))) {
      selectedRef.current = hits;
      setSelected(hits);
    }
  };

  /** 한 프레임에 한 번 상자를 늘린다. 포인터가 위아래 끝에 있으면 멈춰 있어도 계속 스크롤한다. */
  const tick = () => {
    const current = drag.current;
    const element = ref.current;
    if (!current || !element) return;
    current.frame = 0;
    const step = current.moved
      ? edgeScrollStep(element.getBoundingClientRect(), current.clientY)
      : 0;
    const before = element.scrollTop;
    if (step) element.scrollTop += step;
    extend();
    if (element.scrollTop !== before) current.frame = requestAnimationFrame(tick);
  };

  const endDrag = () => {
    const current = drag.current;
    if (current?.frame) cancelAnimationFrame(current.frame);
    drag.current = null;
    if (boxRef.current) boxRef.current.style.display = 'none';
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
        clientX: event.clientX,
        clientY: event.clientY,
        frame: 0,
      };
      ref.current.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove: (event: PointerEvent<T>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.clientX = event.clientX;
      current.clientY = event.clientY;
      if (!current.frame) current.frame = requestAnimationFrame(tick);
    },
    onPointerUp: (event: PointerEvent<T>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      // 아직 그리지 않은 마지막 이동이 남아 있을 수 있으므로 놓은 위치로 한 번 더 계산한다.
      current.clientX = event.clientX;
      current.clientY = event.clientY;
      extend();
      endDrag();
      // 빈 곳을 그냥 누르면 선택을 해제한다(Ctrl·Shift를 누르고 있으면 그대로 둔다).
      if (!current.moved) setSelected(current.base);
    },
    onPointerCancel: endDrag,
  };

  /**
   * 항목을 누를 때 부른다. Ctrl·Shift 클릭이면 선택만 바꾸고 true를 돌려준다.
   * 그냥 클릭이면 선택을 비우고 false를 돌려주므로 원래 동작(열기)을 이어서 하면 된다.
   */
  const clickItem = useCallback((event: MouseEvent, id: string): boolean => {
    const ids = idsRef.current;
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
    if (selectedRef.current.size) setSelected(new Set());
    return false;
  }, []);

  const selectAll = useCallback((only: string[]) => setSelected(new Set(only)), []);

  const boxElement = <div ref={boxRef} className="select-box" />;

  return {
    containerProps,
    selected,
    clear: () => setSelected(new Set()),
    /** 주어진 항목만 고른 상태로 바꾼다. */
    selectAll,
    clickItem,
    boxElement,
    isSelected: (id: string) => selected.has(id),
  };
}
