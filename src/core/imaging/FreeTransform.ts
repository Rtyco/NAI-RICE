/** 캔버스 px. 회전 전 크기와 중심 */
export type ImageBox = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** 도, 시계 방향 */
  rotation: number;
  flipX: boolean;
};

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type TransformHandle = ResizeHandle | 'move' | 'rotate';

export type TransformModifiers = { shift: boolean; alt: boolean };

type Point = { x: number; y: number };

/** 상자 중심 기준 단위 좌표 */
const HANDLE_UNITS: Record<ResizeHandle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export const RESIZE_HANDLES = Object.keys(HANDLE_UNITS) as ResizeHandle[];

const MIN_SIZE = 8;
const ROTATE_SNAP = 15;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function normalizeDegrees(degrees: number): number {
  const turned = ((degrees % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
}

export function toLocal(box: ImageBox, x: number, y: number): Point {
  const angle = -radians(box.rotation);
  const dx = x - box.cx;
  const dy = y - box.cy;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

export function toCanvas(box: ImageBox, x: number, y: number): Point {
  const angle = radians(box.rotation);
  return {
    x: box.cx + x * Math.cos(angle) - y * Math.sin(angle),
    y: box.cy + x * Math.sin(angle) + y * Math.cos(angle),
  };
}

export function handlePoint(box: ImageBox, handle: ResizeHandle): Point {
  const [ux, uy] = HANDLE_UNITS[handle];
  return toCanvas(box, (ux * box.width) / 2, (uy * box.height) / 2);
}

/** 포토샵 자유 변형처럼 상자 바깥을 끌면 회전한다. */
export function handleAt(box: ImageBox, x: number, y: number, radius: number): TransformHandle {
  for (const handle of RESIZE_HANDLES) {
    const point = handlePoint(box, handle);
    if (Math.hypot(point.x - x, point.y - y) <= radius) return handle;
  }
  const local = toLocal(box, x, y);
  return Math.abs(local.x) <= box.width / 2 && Math.abs(local.y) <= box.height / 2
    ? 'move'
    : 'rotate';
}

/** 화면에서 손잡이가 가리키는 방향(도). 커서 모양을 고를 때 쓴다. */
export function handleDirection(box: ImageBox, handle: ResizeHandle): number {
  const [ux, uy] = HANDLE_UNITS[handle];
  return normalizeDegrees((Math.atan2(uy, ux) * 180) / Math.PI + box.rotation);
}

export function dragBox(
  start: ImageBox,
  handle: TransformHandle,
  from: Point,
  to: Point,
  modifiers: TransformModifiers,
): ImageBox {
  if (handle === 'move') {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    if (modifiers.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    return { ...start, cx: start.cx + dx, cy: start.cy + dy };
  }
  if (handle === 'rotate') {
    const before = Math.atan2(from.y - start.cy, from.x - start.cx);
    const after = Math.atan2(to.y - start.cy, to.x - start.cx);
    let rotation = start.rotation + ((after - before) * 180) / Math.PI;
    if (modifiers.shift) rotation = Math.round(rotation / ROTATE_SNAP) * ROTATE_SNAP;
    return { ...start, rotation: normalizeDegrees(rotation) };
  }
  const [ux, uy] = HANDLE_UNITS[handle];
  const grabbed = toLocal(start, from.x, from.y);
  const pointer = toLocal(start, to.x, to.y);
  // 잡은 곳과 손잡이의 차이를 유지해 누르는 순간 튀지 않게 한다.
  const px = pointer.x + (ux * start.width) / 2 - grabbed.x;
  const py = pointer.y + (uy * start.height) / 2 - grabbed.y;
  const fromCenter = modifiers.alt;
  const anchorX = fromCenter ? 0 : (-ux * start.width) / 2;
  const anchorY = fromCenter ? 0 : (-uy * start.height) / 2;
  const reach = fromCenter ? 2 : 1;
  let width = start.width;
  let height = start.height;
  if (ux && uy && !modifiers.shift) {
    // 대각선에 투영해 한 축만 움직여도 매끄럽게 커진다.
    const cornerX = (ux * start.width) / 2 - anchorX;
    const cornerY = (uy * start.height) / 2 - anchorY;
    const scale =
      ((px - anchorX) * cornerX + (py - anchorY) * cornerY) / (cornerX ** 2 + cornerY ** 2);
    const minimum = MIN_SIZE / Math.min(start.width, start.height);
    width = start.width * Math.max(minimum, scale);
    height = start.height * Math.max(minimum, scale);
  } else {
    if (ux) width = Math.max(MIN_SIZE, (px - anchorX) * ux * reach);
    if (uy) height = Math.max(MIN_SIZE, (py - anchorY) * uy * reach);
  }
  const center = toCanvas(
    start,
    fromCenter || !ux ? 0 : anchorX + (ux * width) / 2,
    fromCenter || !uy ? 0 : anchorY + (uy * height) / 2,
  );
  return { ...start, cx: center.x, cy: center.y, width, height };
}
