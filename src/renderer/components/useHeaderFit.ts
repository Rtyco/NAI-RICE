import { useLayoutEffect, type RefObject } from 'react';

/** chips.css의 .fit-1 … .fit-6. 덜 중요한 것부터 숨긴다. */
const FIT_LEVELS = 6;

const clipped = (element: Element | null) =>
  Boolean(element && element.scrollWidth > element.clientWidth);

function fitHeader(header: HTMLElement): void {
  const bar = header.querySelector('.chain-bar.compact');
  const meter = header.querySelector('.account-meter');
  let level = 0;
  for (let next = 1; next <= FIT_LEVELS; next++) header.classList.remove(`fit-${next}`);
  // 칩 수·이름·계정 표시 글자에 따라 필요한 폭이 달라 컨테이너 쿼리의 고정 폭으로는 맞출 수 없다.
  while (bar && level < FIT_LEVELS && (clipped(bar) || clipped(meter)))
    header.classList.add(`fit-${++level}`);
}

/** 머리줄에 접어 둔 설정 줄의 칩이 잘리지 않게 한다. */
export function useHeaderFit(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const observer = new ResizeObserver(() => fitHeader(header));
    observer.observe(header);
    for (const child of header.children) observer.observe(child);
    return () => observer.disconnect();
  });
}
