import { useLayoutEffect, type RefObject } from 'react';

/** 가운데 정렬이라 높이가 다른 칩도 같은 줄이면 가운데가 같다. */
function rowCount(bar: HTMLElement): number {
  return new Set(
    [...bar.children].map((child) => {
      const element = child as HTMLElement;
      return Math.round(element.offsetTop + element.offsetHeight / 2);
    }),
  ).size;
}

function fitNames(bar: HTMLElement): void {
  bar.classList.remove('named');
  const rows = rowCount(bar);
  bar.classList.add('named');
  if (rowCount(bar) > rows) bar.classList.remove('named');
}

/** 펼친 설정 줄에서 이름을 넣어도 줄 수가 늘지 않으면 칩 이름을 보인다. 칩 수와 이름 길이가 달라 폭을 재서 정한다. */
export function useChipNames(ref: RefObject<HTMLElement | null>, compact: boolean): void {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar || compact) return;
    let frame = 0;
    // 콜백 안에서 칩 폭을 바꾸면 Chromium이 ResizeObserver loop 오류를 낸다.
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitNames(bar));
    });
    const observeChips = () => {
      resize.disconnect();
      resize.observe(bar);
      for (const child of bar.children) resize.observe(child);
    };
    // 모드를 바꾸면 칩이 늘거나 준다.
    const mutation = new MutationObserver(observeChips);
    mutation.observe(bar, { childList: true });
    observeChips();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [ref, compact]);
}
