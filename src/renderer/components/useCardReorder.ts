import { useCallback, useRef, useState, type PointerEvent } from 'react';
import { edgeScrollStep, scrollParent } from './edgeScroll';

/** 이만큼 움직여야 끌기로 본다. 그보다 짧으면 그냥 클릭이다. */
const DRAG_THRESHOLD = 6;

export type CardReorder = {
  /** 끌고 있는 카드와 지금 놓일 카드. */
  dragging?: string;
  over?: string;
  /** 카드 요소의 onPointerDown에 단다. 카드에는 `data-select-id`가 있어야 한다. 늘 같은 함수다. */
  start: (event: PointerEvent<HTMLElement>, id: string) => void;
};

/**
 * 카드 끌어서 순서 바꾸기. HTML5 끌어 놓기는 Windows의 Electron에서 OLE 끌기를 거쳐 끄는 그림이 커서를 늦게
 * 따라가고 dragover도 띄엄띄엄 와 버벅인다. 그래서 포인터 이벤트로 카드 복제본을 직접 움직이고, 놓일 카드 찾기와
 * 목록 끝 자동 스크롤은 한 프레임에 한 번만 하며, React 상태는 놓일 카드가 바뀔 때만 바꾼다.
 */
export function useCardReorder(
  ids: string[],
  onMove: (id: string, index: number) => void,
): CardReorder {
  const [state, setState] = useState<{ dragging?: string; over?: string }>({});
  const latest = useRef({ ids, onMove });
  latest.current = { ids, onMove };

  const start = useCallback((event: PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey) return;
    if ((event.target as HTMLElement).closest('input, select, textarea, .card-actions')) return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const scroller = scrollParent(card);
    const startX = event.clientX;
    const startY = event.clientY;
    let x = startX;
    let y = startY;
    let ghost: HTMLElement | undefined;
    let over: string | undefined;
    let frame = 0;

    const tick = () => {
      frame = 0;
      if (!ghost) return;
      let scrolled = false;
      if (scroller) {
        const step = edgeScrollStep(scroller.getBoundingClientRect(), y);
        const before = scroller.scrollTop;
        if (step) scroller.scrollTop += step;
        scrolled = scroller.scrollTop !== before;
      }
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-select-id]');
      const next = hit && hit.dataset.selectId !== id ? hit.dataset.selectId : undefined;
      if (next !== over) {
        over = next;
        setState({ dragging: id, over });
      }
      if (scrolled) frame = requestAnimationFrame(tick);
    };
    const move = (moveEvent: globalThis.PointerEvent) => {
      x = moveEvent.clientX;
      y = moveEvent.clientY;
      if (!ghost) {
        if (Math.hypot(x - startX, y - startY) < DRAG_THRESHOLD) return;
        ghost = card.cloneNode(true) as HTMLElement;
        ghost.classList.add('card-drag-ghost');
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        document.body.append(ghost);
        document.body.classList.add('card-reordering');
        setState({ dragging: id });
      }
      // 복제본은 이벤트를 받자마자 옮겨야 커서에 붙어 다닌다.
      ghost.style.transform = `translate3d(${x - (startX - rect.left)}px, ${y - (startY - rect.top)}px, 0)`;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelAnimationFrame(frame);
      if (!ghost) return;
      ghost.remove();
      document.body.classList.remove('card-reordering');
      setState({});
      // 놓은 자리에서 이어지는 click이 카드를 열지 않게 한 번 막는다.
      const swallow = (clickEvent: MouseEvent) => clickEvent.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (commit && over) latest.current.onMove(id, latest.current.ids.indexOf(over));
    };
    const up = (upEvent: globalThis.PointerEvent) => {
      x = upEvent.clientX;
      y = upEvent.clientY;
      // 마지막 이동을 아직 반영하지 못했을 수 있다. 카드 사이 빈틈에서 놓으면 보이던 자리에 둔다.
      const hit =
        ghost && document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-select-id]');
      if (hit) over = hit.dataset.selectId !== id ? hit.dataset.selectId : undefined;
      finish(true);
    };
    const cancel = () => finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }, []);

  return { ...state, start };
}
