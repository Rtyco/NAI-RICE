import { useEffect } from 'react';

// Electron은 Chrome과 달리 휠 클릭 자동 스크롤이 꺼져 있어 직접 한다.
const DEAD_ZONE = 10;
/** 기준점에서 1px 멀어질 때마다 초당 이만큼 px */
const SPEED = 8;

/** 기준점에서 `offset`px 떨어졌을 때 초당 스크롤할 px. 아래가 +. */
export function autoscrollSpeed(offset: number): number {
  const distance = Math.abs(offset) - DEAD_ZONE;
  return distance > 0 ? Math.sign(offset) * distance * SPEED : 0;
}

function scrollableParent(start: EventTarget | null): HTMLElement | undefined {
  for (
    let node = start instanceof Element ? start : null;
    node && node !== document.documentElement;
    node = node.parentElement
  ) {
    if (!(node instanceof HTMLElement)) continue;
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1
    )
      return node;
  }
  return undefined;
}

/** 눌렀다 바로 놓으면 다음 클릭까지, 누른 채 끌면 놓을 때까지 스크롤한다. Chrome과 같다. */
function autoscroll(target: HTMLElement, from: MouseEvent): () => void {
  const originY = from.clientY;
  let pointerY = originY;
  let dragged = false;
  // scrollTop은 정수로 반올림되어 느릴 때 움직이지 않는다.
  let exact = target.scrollTop;
  let last = performance.now();
  let frame = 0;

  const marker = document.createElement('div');
  marker.className = 'autoscroll-marker';
  marker.style.left = `${from.clientX}px`;
  marker.style.top = `${originY}px`;
  document.body.append(marker);
  document.documentElement.classList.add('autoscrolling');

  const tick = (now: number) => {
    if (Math.abs(target.scrollTop - exact) >= 1) exact = target.scrollTop;
    const max = target.scrollHeight - target.clientHeight;
    exact = Math.min(
      max,
      Math.max(0, exact + (autoscrollSpeed(pointerY - originY) * (now - last)) / 1000),
    );
    target.scrollTop = exact;
    last = now;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onMove = (event: PointerEvent) => {
    pointerY = event.clientY;
    if (Math.abs(pointerY - originY) > DEAD_ZONE) dragged = true;
  };
  const onUp = (event: PointerEvent) => {
    if (event.button === 1 && dragged) stop();
  };
  // 멈추려고 누른 클릭이 아래 버튼을 누르거나 메뉴를 열지 않게 한다.
  // pointerdown을 preventDefault하는 곳(끌어 고르기)에서는 mousedown이 오지 않는다.
  const onDown = (event: PointerEvent) => {
    swallow(event);
    stop();
    // Windows는 contextmenu를 버튼을 놓은 뒤 따로 보내 다음 누름까지 기다린다.
    const after = event.button === 2 ? ['contextmenu'] : ['click', 'auxclick'];
    const release = () => {
      for (const type of after) window.removeEventListener(type, swallow, { capture: true });
    };
    for (const type of after) window.addEventListener(type, swallow, { capture: true, once: true });
    if (event.button === 2)
      window.addEventListener('pointerdown', release, { capture: true, once: true });
    else
      window.addEventListener('pointerup', () => setTimeout(release), {
        capture: true,
        once: true,
      });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    swallow(event);
    stop();
  };

  function stop() {
    cancelAnimationFrame(frame);
    marker.remove();
    document.documentElement.classList.remove('autoscrolling');
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('wheel', stop, true);
    window.removeEventListener('blur', stop);
  }

  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('wheel', stop, true);
  window.addEventListener('blur', stop);
  return stop;
}

/** 캔버스처럼 휠 클릭을 따로 쓰는 곳은 mousedown을 preventDefault해 둔다. */
export function useMiddleClickScroll(): void {
  useEffect(() => {
    let stop: (() => void) | undefined;
    const onDown = (event: MouseEvent) => {
      if (event.button !== 1 || event.defaultPrevented) return;
      const target = scrollableParent(event.target);
      if (!target) return;
      event.preventDefault();
      stop = autoscroll(target, event);
    };
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
      stop?.();
    };
  }, []);
}
