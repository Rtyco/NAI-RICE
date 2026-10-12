const EDGE = 40;
const MAX_STEP = 24;

/**
 * 끄는 동안 포인터가 목록 위아래 끝 가까이(또는 밖)에 있으면 한 프레임에 스크롤할 양. 끝에 가까울수록 빠르다.
 * 포인터가 멈춰 있어도 매 프레임 불러야 계속 스크롤된다.
 */
export function edgeScrollStep(bounds: DOMRect, y: number): number {
  const edge = Math.min(EDGE, bounds.height / 4);
  const above = bounds.top + edge - y;
  const below = y - (bounds.bottom - edge);
  if (above > 0) return -Math.ceil(Math.min(1, above / edge) * MAX_STEP);
  if (below > 0) return Math.ceil(Math.min(1, below / edge) * MAX_STEP);
  return 0;
}

/** 세로로 스크롤되는 가장 가까운 조상. */
export function scrollParent(element: HTMLElement): HTMLElement | undefined {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight)
      return node;
  }
  return undefined;
}
