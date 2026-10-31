import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  dragBox,
  handleAt,
  handleDirection,
  type ImageBox,
  type TransformHandle,
} from '../../core/imaging/FreeTransform';
import { isTypingTarget } from '../useShortcut';
import type { useCanvasViewport } from './canvasViewport';

/** 자동 구성에서만. 바뀐 상자를 받아 다시 칠한다. */
export type TransformTarget = {
  box: ImageBox;
  image: CanvasImageSource;
  onBegin: () => void;
  onChange: (box: ImageBox) => void;
  onCancel: () => void;
};

const HISTORY_LIMIT = 40;
/** 화면 px */
const HIT_RADIUS = 8;

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><g fill='none' stroke-linecap='round'><path d='M5 15a8 8 0 0 1 13-8' stroke='white' stroke-width='4'/><path d='M5 15a8 8 0 0 1 13-8' stroke='black' stroke-width='1.6'/></g><path d='M15 4l5 3-5 3z' fill='black' stroke='white'/><path d='M2 13l3 5 3-5z' fill='black' stroke='white'/></svg>",
)}") 12 12, crosshair`;

function transformCursor(box: ImageBox, handle: TransformHandle): string {
  if (handle === 'move') return 'move';
  if (handle === 'rotate') return ROTATE_CURSOR;
  const direction = ((handleDirection(box, handle) % 180) + 180) % 180;
  return RESIZE_CURSORS[Math.round(direction / 45) % 4];
}

type Drag = { x: number; y: number; startBox: ImageBox; handle: TransformHandle };

/** 포토샵 Ctrl+T처럼 이미지를 옮기고 크기·회전을 바꾼다. 도구 전환은 부르는 쪽이 한다. */
export function useFreeTransform(options: {
  target?: TransformTarget;
  /** 변형 도구가 골라져 있을 때 */
  active: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  view: ReturnType<typeof useCanvasViewport>;
  spaceHeld: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const { target, active, view } = options;
  const transforming = active && Boolean(target);
  const drag = useRef<Drag | null>(null);
  const history = useRef<ImageBox[]>([]);
  const hitRadius = HIT_RADIUS / view.scale;

  const canvasPoint = (event: { clientX: number; clientY: number }) => {
    const bounds = options.canvasRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * options.width,
      y: ((event.clientY - bounds.top) / bounds.height) * options.height,
    };
  };

  const begin = () => {
    if (!target || active) return;
    history.current = [];
    target.onBegin();
    options.onStart();
  };

  const commit = () => {
    drag.current = null;
    options.onEnd();
  };

  const cancel = () => {
    target?.onCancel();
    commit();
  };

  const record = (box: ImageBox) => {
    history.current = [...history.current.slice(-(HISTORY_LIMIT - 1)), box];
  };

  const undo = () => {
    const previous = history.current.pop();
    if (previous) target?.onChange(previous);
  };

  useEffect(() => {
    if (!active && view.viewport.current) view.viewport.current.style.cursor = '';
  }, [active, view.viewport]);

  // 대화상자의 Esc(닫기)와 마스크 Ctrl+Z보다 먼저 받는다.
  useEffect(() => {
    if (!transforming) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const box = target?.box;
      const step = event.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (event.key === 'Enter') commit();
      else if (event.key === 'Escape') cancel();
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') undo();
      else if (nudge[event.key] && box) {
        const [dx, dy] = nudge[event.key];
        if (!event.repeat) record(box);
        target?.onChange({ ...box, cx: box.cx + dx, cy: box.cy + dy });
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // 손잡이가 캔버스 밖에 있어도 잡을 수 있게 화면 전체에서 받는다.
  const viewportHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!transforming || !target) return;
      if (event.button === 1 || (event.button === 0 && options.spaceHeld)) {
        view.pan.begin(event);
        return;
      }
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = canvasPoint(event);
      record(target.box);
      drag.current = {
        ...point,
        startBox: target.box,
        handle: handleAt(target.box, point.x, point.y, hitRadius),
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!transforming || !target) return;
      if (view.pan.move(event)) return;
      const point = canvasPoint(event);
      const current = drag.current;
      if (current) {
        target.onChange(
          dragBox(current.startBox, current.handle, { x: current.x, y: current.y }, point, {
            shift: event.shiftKey,
            alt: event.altKey,
          }),
        );
        return;
      }
      event.currentTarget.style.cursor = options.spaceHeld
        ? ''
        : transformCursor(target.box, handleAt(target.box, point.x, point.y, hitRadius));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!transforming) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (view.pan.end()) return;
      drag.current = null;
    },
    onDoubleClick: (event: { clientX: number; clientY: number }) => {
      if (!transforming || !target) return;
      const point = canvasPoint(event);
      if (handleAt(target.box, point.x, point.y, hitRadius) === 'move') commit();
    },
  };

  return { transforming, begin, commit, cancel, viewportHandlers };
}
