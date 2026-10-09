import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;

export const clampZoom = (scale: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));

/**
 * 확대·축소한 뒤에도 커서(버튼으로 바꾸면 화면 가운데) 아래의 지점이 그 자리에 남도록 스크롤을 옮긴다.
 * 비율을 바꾸기 직전에 돌려준 함수를 부르면, 다음 렌더가 끝난 뒤 스크롤을 맞춘다.
 */
export function useZoomAnchor(
  viewport: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
) {
  const pending = useRef<{ fx: number; fy: number; x: number; y: number } | undefined>(undefined);
  useLayoutEffect(() => {
    const anchor = pending.current;
    const view = viewport.current;
    const element = target.current;
    if (!anchor || !view || !element) return;
    pending.current = undefined;
    const rect = element.getBoundingClientRect();
    view.scrollLeft += rect.left + anchor.fx * rect.width - anchor.x;
    view.scrollTop += rect.top + anchor.fy * rect.height - anchor.y;
  });
  return (clientX?: number, clientY?: number) => {
    const view = viewport.current;
    const element = target.current;
    if (!view || !element) return;
    const bounds = view.getBoundingClientRect();
    const x = clientX ?? bounds.left + bounds.width / 2;
    const y = clientY ?? bounds.top + bounds.height / 2;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pending.current = { fx: (x - rect.left) / rect.width, fy: (y - rect.top) / rect.height, x, y };
  };
}

/** React의 onWheel은 passive라 휠의 기본 스크롤을 막을 수 없어서 직접 단다. */
export function useWheel(
  element: RefObject<HTMLElement | null>,
  onWheel: (event: WheelEvent) => void,
) {
  const handler = useRef(onWheel);
  handler.current = onWheel;
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const listener = (event: WheelEvent) => handler.current(event);
    node.addEventListener('wheel', listener, { passive: false });
    return () => node.removeEventListener('wheel', listener);
  }, [element]);
}

/** 끌어서 스크롤을 옮긴다. `start`가 true를 돌려준 포인터만 잡는다. */
export function usePan(viewport: RefObject<HTMLElement | null>) {
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  return {
    begin(event: ReactPointerEvent<HTMLElement>) {
      const view = viewport.current;
      if (!view) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        left: view.scrollLeft,
        top: view.scrollTop,
      };
    },
    /** 끄는 중이면 스크롤을 옮기고 true를 돌려준다. */
    move(event: ReactPointerEvent<HTMLElement>): boolean {
      const view = viewport.current;
      const start = drag.current;
      if (!view || !start) return false;
      view.scrollLeft = start.left - (event.clientX - start.x);
      view.scrollTop = start.top - (event.clientY - start.y);
      return true;
    },
    end(): boolean {
      const panning = Boolean(drag.current);
      drag.current = null;
      return panning;
    },
  };
}
