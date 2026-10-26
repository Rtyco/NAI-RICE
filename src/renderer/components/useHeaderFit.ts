import { useLayoutEffect, type RefObject } from 'react';
import { useUiOption } from '../uiOptions';

const clipped = (element: Element | null) =>
  Boolean(element && element.scrollWidth > element.clientWidth);

/**
 * `start`까지는 늘 붙이고, 넘치는 동안 그다음부터 `.fit-{levels}`까지 하나씩 붙인다. 덜 중요한 것부터
 * 줄이는 규칙은 CSS에 있다. 항목 수·글자 길이에 따라 필요한 폭이 달라 컨테이너 쿼리의 고정 폭으로는 맞출 수 없다.
 */
function useFitLevels(
  ref: RefObject<HTMLElement | null>,
  levels: number,
  overflowing: (container: HTMLElement) => boolean,
  start = 0,
): void {
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const fit = () => {
      let level = 0;
      for (let next = 1; next <= levels; next++) container.classList.remove(`fit-${next}`);
      while (level < start) container.classList.add(`fit-${++level}`);
      while (level < levels && overflowing(container)) container.classList.add(`fit-${++level}`);
    };
    let frame = 0;
    // 콜백 안에서 클래스를 바꾸면 Chromium이 ResizeObserver loop 오류를 낸다.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(container);
    for (const child of container.children) observer.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });
}

const useSimpleUi = () => useUiOption('simpleUi');

/** 머리줄에 접어 둔 설정 줄의 칩이 잘리지 않게 한다(chips.css의 .fit-1 … .fit-6). */
export function useHeaderFit(ref: RefObject<HTMLElement | null>): void {
  const simple = useSimpleUi();
  useFitLevels(
    ref,
    6,
    (header) => {
      const bar = header.querySelector('.chain-bar.compact');
      return Boolean(bar) && (clipped(bar) || clipped(header.querySelector('.account-meter')));
    },
    simple ? 1 : 0,
  );
}

/** 하단 큐 막대를 한 줄로 둔다(queue.css의 .fit-1 … .fit-9). */
export function useQueueBarFit(ref: RefObject<HTMLElement | null>): void {
  useFitLevels(ref, 9, clipped, useSimpleUi() ? 2 : 0);
}

/** 펼친 설정 줄을 한 줄로 둔다(chips.css의 .fit-1 … .fit-6). 머리줄에 접은 칩은 useHeaderFit이 맡는다. */
export function useChainBarFit(ref: RefObject<HTMLElement | null>, compact: boolean): void {
  useFitLevels(ref, 6, (bar) => !compact && clipped(bar), useSimpleUi() && !compact ? 5 : 0);
}
