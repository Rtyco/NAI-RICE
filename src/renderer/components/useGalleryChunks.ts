import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * Chromium은 한 번 그린 묶음이 화면 밖으로 나가면 그때 높이를 그대로 쓴다(계산 높이가 바뀌어도 따르지 않는다).
 * 열 수·비율·폭·카드 수가 바뀌면 잠깐 hidden으로 배치해 계산 높이로 되돌린다.
 */
export function useFreshChunkHeights(grid: RefObject<HTMLDivElement | null>, layoutKey: string) {
  const reset = useCallback(() => {
    const element = grid.current;
    if (!element) return;
    element.classList.add('reset-chunks');
    void element.offsetHeight;
    element.classList.remove('reset-chunks');
  }, [grid]);
  const laidOut = useRef(layoutKey);
  useLayoutEffect(() => {
    if (laidOut.current === layoutKey) return;
    laidOut.current = layoutKey;
    reset();
  }, [layoutKey, reset]);
  const present = Boolean(grid.current);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    let width = element.clientWidth;
    let timer = 0;
    // 패널을 여닫는 동안은 폭이 프레임마다 바뀐다. 그때마다 되돌리면 프레임의 배치가 두 배가 되어 멈춘 뒤에 한 번 한다.
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      clearTimeout(timer);
      // 패널이 움직이는 동안 묶은 폭이 바뀐 것이면 움직임이 끝난 뒤에 한다.
      const later = () => {
        if (element.parentElement?.classList.contains('panel-moving'))
          timer = window.setTimeout(later, 150);
        else reset();
      };
      timer = window.setTimeout(later, 150);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [grid, reset, present]);
}

const panelMotion = (animation: Animation, grid: Element): animation is CSSTransition =>
  animation instanceof CSSTransition &&
  animation.transitionProperty === 'grid-template-columns' &&
  animation.effect instanceof KeyframeEffect &&
  Boolean(animation.effect.target?.contains(grid));

type Box = { x: number; y: number; width: number; height: number };

/**
 * 패널 칸이 움직이는 동안(grid-template-columns 전환) 카드를 프레임마다 다시 배치하지 않는다. 한 줄 8장에서 한
 * 프레임이 25~30ms였다. 격자를 끝 폭으로 한 번 배치하고, 보이는 카드는 처음 자리·크기에서 끝 자리로 transform
 * 애니메이션(FLIP)을 패널 전환과 같은 시간·곡선으로 돌린다. 폭을 묶고 끝에 한 번 맞추는 방식은 어색했다.
 */
export function useCardMorphWhilePanelsMove(grid: RefObject<HTMLDivElement | null>) {
  const present = Boolean(grid.current);
  useEffect(() => {
    const element = grid.current;
    const view = element?.parentElement;
    if (!element || !view) return;
    const moving = new Map<EventTarget, number>();
    const morphs: Animation[] = [];
    let opened: HTMLElement[] = [];
    let fallback = 0;
    let closing = 0;
    // 마지막으로 배치한 폭. 시작할 때 레이아웃을 읽기 전에 격자를 이 폭으로 묶어야 진행된 폭으로 다시 배치하지 않는다.
    let width = element.getBoundingClientRect().width;
    const sizes = new ResizeObserver(([entry]) => {
      if (!element.style.width) width = entry.contentRect.width;
    });
    sizes.observe(element);
    const reopen = () => {
      clearTimeout(closing);
      for (const chunk of opened) chunk.style.removeProperty('content-visibility');
      opened = [];
    };
    const release = () => {
      moving.clear();
      clearTimeout(fallback);
      for (const morph of morphs.splice(0)) morph.cancel();
      // 풀어도 폭이 같아 ResizeObserver가 부르지 않는다.
      if (element.style.width) width = parseFloat(element.style.width);
      element.style.removeProperty('width');
      view.classList.remove('panel-moving');
      // 묶음을 다시 auto로 돌리면 카드를 다시 배치한다. 애니메이션이 끝나는 프레임을 피해 조금 뒤에 한다.
      clearTimeout(closing);
      closing = window.setTimeout(reopen, 300);
    };
    /** 화면과 위아래 반 화면 안에 걸친 묶음. 이보다 먼 묶음은 그리지 않은 채로 둔다. */
    const chunksNearView = () => {
      const box = view.getBoundingClientRect();
      const margin = box.height / 2;
      return [...element.children].filter((chunk): chunk is HTMLElement => {
        const rect = chunk.getBoundingClientRect();
        return rect.bottom > box.top - margin && rect.top < box.bottom + margin;
      });
    };
    const boxes = () => {
      const origin = element.getBoundingClientRect();
      return new Map(
        chunksNearView().flatMap((chunk) =>
          [...chunk.children].map((card): [Element, Box] => {
            const rect = card.getBoundingClientRect();
            return [
              card,
              {
                x: rect.left - origin.left,
                y: rect.top - origin.top,
                width: rect.width,
                height: rect.height,
              },
            ];
          }),
        ),
      );
    };
    const morph = () => {
      if (!element.style.width) element.style.width = `${width}px`;
      const transitions = document.getAnimations().filter((item) => panelMotion(item, element));
      if (!transitions.length) {
        if (!morphs.length) element.style.removeProperty('width');
        return;
      }
      const times = transitions.map((transition) => transition.currentTime);
      const seek = (time: (transition: CSSTransition, index: number) => CSSNumberish | null) =>
        transitions.forEach(
          (transition, index) => (transition.currentTime = time(transition, index)),
        );
      const endTime = (transition: CSSTransition) =>
        Number(transition.effect?.getComputedTiming().endTime ?? 0);
      // 시작 이벤트는 첫 프레임을 그린 뒤에 온다(곡선이 가팔라 그사이 28% 움직인다). 처음으로 옮겨 잰다.
      // 그 배치는 이미 한 것이라 다시 하지 않고, 움직이던 카드는 transform까지 든 지금 자리를 잰다.
      seek(() => 0);
      const before = boxes();
      for (const running of morphs.splice(0)) running.cancel();
      const style = getComputedStyle(view);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      seek(endTime);
      const end = view.clientWidth - padding;
      seek((_, index) => times[index]);
      element.style.width = `${end}px`;
      view.classList.add('panel-moving');
      // 묶음은 내용을 제 상자로 자른다. 옮겨 그리는 카드가 이웃 묶음 자리로 넘어가도 보이게 한다.
      reopen();
      opened = chunksNearView();
      for (const chunk of opened) chunk.style.contentVisibility = 'visible';
      const timing = transitions[0].effect?.getTiming();
      const duration = endTime(transitions[0]);
      for (const [card, after] of boxes()) {
        const from = before.get(card);
        if (!from || !after.width || !after.height) continue;
        const dx = from.x - after.x;
        const dy = from.y - after.y;
        const sx = from.width / after.width;
        const sy = from.height / after.height;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.002) continue;
        const animation = card.animate(
          [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }],
          { duration, easing: timing?.easing ?? 'linear' },
        );
        // currentTime으로 맞추면 새 애니메이션은 시작을 기다리며 한 프레임 늦는다.
        animation.startTime = transitions[0].startTime;
        morphs.push(animation);
      }
      // 전환 중에 요소가 빠지면 끝 이벤트가 오지 않는다.
      clearTimeout(fallback);
      fallback = window.setTimeout(release, duration + 500);
    };
    const isPanelMotion = (event: TransitionEvent) =>
      event.propertyName === 'grid-template-columns' &&
      event.target instanceof Element &&
      event.target.contains(element);
    const onRun = (event: TransitionEvent) => {
      if (!isPanelMotion(event)) return;
      moving.set(event.target!, (moving.get(event.target!) ?? 0) + 1);
      morph();
    };
    const onEnd = (event: TransitionEvent) => {
      if (!isPanelMotion(event)) return;
      const left = (moving.get(event.target!) ?? 1) - 1;
      if (left > 0) moving.set(event.target!, left);
      else moving.delete(event.target!);
      if (!moving.size) release();
    };
    document.addEventListener('transitionrun', onRun);
    document.addEventListener('transitionend', onEnd);
    document.addEventListener('transitioncancel', onEnd);
    return () => {
      document.removeEventListener('transitionrun', onRun);
      document.removeEventListener('transitionend', onEnd);
      document.removeEventListener('transitioncancel', onEnd);
      sizes.disconnect();
      release();
      reopen();
    };
  }, [grid, present]);
}
