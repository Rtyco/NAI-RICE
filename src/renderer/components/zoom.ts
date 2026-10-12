import { useEffect, useRef, type RefObject } from 'react';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;

export const clampZoom = (scale: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));

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
