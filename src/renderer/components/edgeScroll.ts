const EDGE = 40;
const MAX_STEP = 24;

/** 끝에 가까울수록 빠르다. 포인터가 멈춰 있어도 매 프레임 불러야 계속 스크롤된다. */
export function edgeScrollStep(bounds: DOMRect, y: number): number {
  const edge = Math.min(EDGE, bounds.height / 4);
  const above = bounds.top + edge - y;
  const below = y - (bounds.bottom - edge);
  if (above > 0) return -Math.ceil(Math.min(1, above / edge) * MAX_STEP);
  if (below > 0) return Math.ceil(Math.min(1, below / edge) * MAX_STEP);
  return 0;
}
