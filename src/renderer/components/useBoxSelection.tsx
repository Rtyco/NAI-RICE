import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { isTypingTarget } from '../useShortcut';

import { edgeScrollStep } from './edgeScroll';

/** 컨테이너 안쪽(스크롤 포함) 좌표라 스크롤해도 다시 잴 필요가 없다. */
type ItemRect = { id: string; left: number; top: number; right: number; bottom: number };

/** Shift 클릭 범위. 기준이 목록에 없으면 undefined. */
export function rangeBetween(ids: string[], anchor: string | undefined, id: string) {
  const from = anchor === undefined ? -1 : ids.indexOf(anchor);
  const to = ids.indexOf(id);
  if (from < 0 || to < 0) return undefined;
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
}

function isCtrl(event: KeyboardEvent, key: string): boolean {
  return event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === key;
}

/**
 * 항목은 data-select-id 요소이고, 항목 위에서 끌면 원래 동작(순서 바꾸기)을 쓴다. `selectAllKey`는 본문 목록 하나에만 준다(늘 떠 있는 사이드바에 주면 함께
 * 골라진다).
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

  useEffect(() => {
    const current = new Set(key.split('\n'));
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => current.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [key]);

  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  useEffect(() => {
    if (!selected.size) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
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
      // 입력 칸에서는 글자 전체 선택을 둔다.
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('.modal-backdrop')) return;
      event.preventDefault();
      setSelected(new Set(selectAllKey.current?.() ?? []));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSelectAllKey]);

  const point = (event: { clientX: number; clientY: number }) => {
    const element = ref.current!;
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + element.scrollLeft,
      y: event.clientY - rect.top + element.scrollTop,
    };
  };

  /** 이동마다 React로 그리면 큰 목록에서 버벅여, 상자는 DOM에 바로 그리고 고른 것이 바뀔 때만 상태를 바꾼다. */
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

  /** 포인터가 위아래 끝에 있으면 멈춰 있어도 계속 스크롤한다. */
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
      // preventDefault로 포커스가 옮겨지지 않아 검색 칸 같은 입력에 커서가 남는다.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
      // 아직 그리지 않은 마지막 이동이 남아 있을 수 있다.
      current.clientX = event.clientX;
      current.clientY = event.clientY;
      extend();
      endDrag();
      if (!current.moved) setSelected(current.base);
    },
    onPointerCancel: endDrag,
  };

  /** Ctrl·Shift 클릭이면 선택만 바꾸고 true. 그냥 클릭이면 선택을 비우고 false(원래 동작을 이어서 한다). */
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
    const range = event.shiftKey ? rangeBetween(ids, anchor.current, id) : undefined;
    if (range) {
      setSelected(new Set(range));
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
    selectAll,
    clickItem,
    boxElement,
    isSelected: (id: string) => selected.has(id),
  };
}
