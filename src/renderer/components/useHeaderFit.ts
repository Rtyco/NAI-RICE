import { useLayoutEffect, useRef, type RefObject } from 'react';
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
  /** 바뀌면 다시 맞춘다. 컨테이너의 className을 React가 다시 쓰는 값이면 넣는다. */
  mode = '',
): void {
  const check = useRef(overflowing);
  useLayoutEffect(() => {
    check.current = overflowing;
  });
  // 렌더마다 다시 맞추면 키 입력마다 단계를 지웠다 붙이며 레이아웃을 여러 번 한다(갤러리 키 +2.5ms).
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const fit = () => {
      let level = 0;
      for (let next = 1; next <= levels; next++) container.classList.remove(`fit-${next}`);
      while (level < start) container.classList.add(`fit-${++level}`);
      while (level < levels && check.current(container)) container.classList.add(`fit-${++level}`);
    };
    let frame = 0;
    // 콜백 안에서 클래스를 바꾸면 Chromium이 ResizeObserver loop 오류를 낸다.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    const observeChildren = () => {
      for (const child of container.children) observer.observe(child);
    };
    observer.observe(container);
    observeChildren();
    const children = new MutationObserver(observeChildren);
    children.observe(container, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      children.disconnect();
    };
  }, [ref, levels, start, mode]);
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
      return (
        Boolean(bar) &&
        (clipped(bar) || clipped(header.querySelector(':is(.account-meter, .token-missing)')))
      );
    },
    simple ? 1 : 0,
  );
}

/** 하단 큐 막대를 한 줄로 둔다(queue.css의 .fit-1 … .fit-9). */
export function useQueueBarFit(ref: RefObject<HTMLElement | null>): void {
  useFitLevels(ref, 9, clipped, useSimpleUi() ? 2 : 0);
}

/** 결과 막대를 한 줄로 둔다(scene-detail.css의 .fit-1 … .fit-11). */
export function useResultBarFit(ref: RefObject<HTMLElement | null>): void {
  useFitLevels(ref, 11, clipped);
}

/**
 * 펼친 설정 줄을 한 줄로 둔다(chips.css의 .fit-1 … .fit-6). 머리줄에 접은 칩은 useHeaderFit이 맡는다.
 * 줄바꿈을 고른 사용자면 줄이지 않는다(.wrap). 막대의 className을 돌려준다.
 */
export function useChainBarFit(ref: RefObject<HTMLElement | null>, compact: boolean): string {
  const wrap = useUiOption('chipWrap') && !compact;
  const className = `chain-bar ${compact ? 'compact' : ''} ${wrap ? 'wrap' : ''}`;
  useFitLevels(
    ref,
    6,
    (bar) => !compact && !wrap && clipped(bar),
    useSimpleUi() && !compact ? 5 : 0,
    className,
  );
  return className;
}
