import { useEffect, type RefObject } from 'react';
import { edgeScrollStep } from './edgeScroll';

/**
 * 기본(HTML5) 끌기 중에는 포인터 이벤트가 오지 않아 dragover 위치로 가장자리 스크롤을 한다. 포인터가 멈춰도
 * 매 프레임 이어 가고, 더 움직이지 않거나 끌기가 끝나면 멈춘다.
 */
export function useDragEdgeScroll(scroller: RefObject<HTMLElement | null>, type: string): void {
  useEffect(() => {
    let y: number | undefined;
    let frame = 0;
    const tick = () => {
      frame = 0;
      const element = scroller.current;
      if (!element || y === undefined) return;
      const step = edgeScrollStep(element.getBoundingClientRect(), y);
      const before = element.scrollTop;
      if (step) element.scrollTop += step;
      if (element.scrollTop !== before) frame = requestAnimationFrame(tick);
    };
    const onOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes(type)) return;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      y = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragend', stop);
    window.addEventListener('drop', stop);
    return () => {
      stop();
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragend', stop);
      window.removeEventListener('drop', stop);
    };
  }, [scroller, type]);
}
