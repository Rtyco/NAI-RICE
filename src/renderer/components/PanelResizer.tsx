import type { KeyboardEvent, PointerEvent } from 'react';
import {
  commitWidth,
  compactWidth,
  currentWidth,
  lowestWidth,
  PANELS,
  setWidth,
  stepWidth,
  type PanelId,
} from '../panelWidths';

let snapTimer: ReturnType<typeof setTimeout> | undefined;

/** 아이콘 폭으로 붙거나 떨어지는 한 번은 grid 애니메이션을 켠다(motion 240ms). */
function showSnap(): void {
  const root = document.documentElement;
  root.classList.add('panel-snapping');
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => root.classList.remove('panel-snapping'), 240);
}

/** 패널을 담은 grid(`position: relative`) 안에 두면 CSS 변수 폭에 맞춰 경계에 붙는다. */
export function PanelResizer({ panel }: { panel: PanelId }) {
  const { side, max, initial, column } = PANELS[panel];
  const compact = compactWidth(panel);

  const direction = side === 'left' ? 1 : -1;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = currentWidth(panel);
    // 끄는 동안 grid 애니메이션이 따라오면 손잡이가 마우스보다 늦다.
    document.documentElement.classList.add('panel-resizing');
    let width = startWidth;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const next = setWidth(panel, startWidth + (moveEvent.clientX - startX) * direction);
      if (compact !== undefined && (next === compact) !== (width === compact)) showSnap();
      width = next;
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      document.documentElement.classList.remove('panel-resizing');
      commitWidth(panel, width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0;
    if (!step) return;
    event.preventDefault();
    commitWidth(panel, stepWidth(panel, currentWidth(panel), step * direction));
  };

  return (
    <div
      className={`panel-resizer ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="패널 폭 조절"
      aria-valuemin={lowestWidth(panel)}
      aria-valuemax={max}
      tabIndex={0}
      title="끌어서 폭 조절 · 두 번 누르면 기본 폭"
      style={{ [side]: `calc(var(${column}, ${initial}px) - 3px)` }}
      onPointerDown={onPointerDown}
      onDoubleClick={() => commitWidth(panel, initial)}
      onKeyDown={onKeyDown}
    />
  );
}
