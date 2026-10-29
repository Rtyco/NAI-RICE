import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { clampZoom, useWheel, ZOOM_STEP } from './zoom';
import { useZoomKeys } from './zoomKeys';

type Offset = { x: number; y: number };
const CENTER: Offset = { x: 0, y: 0 };
const PAD = 16;

export type Pinch = { distance: number; mid: Offset; scale: number; from: Offset };

/** 처음 두 손가락 가운데 있던 지점이 지금 가운데로 따라오도록 배율과 위치를 정한다. `mid`는 뷰 가운데 기준. */
export function pinchView(start: Pinch, now: { distance: number; mid: Offset }) {
  const scale = clampZoom((start.scale * now.distance) / start.distance);
  const ratio = scale / start.scale;
  return {
    scale,
    offset: {
      x: now.mid.x - (start.mid.x - start.from.x) * ratio,
      y: now.mid.y - (start.mid.y - start.from.y) * ratio,
    },
  };
}

/** 스크롤로 옮기면 캔버스가 화면보다 작을 때 가운데에 고정되어, 가운데에서 `offset`만큼 민 자리에 그린다. */
export function useCanvasViewport(width: number, height: number) {
  const viewport = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [offset, setOffsetState] = useState<Offset>(CENTER);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; y: number; from: Offset } | null>(null);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setBox({ width: node.clientWidth, height: node.clientHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitScale = box.width
    ? Math.max(0.05, Math.min((box.width - PAD * 2) / width, (box.height - PAD * 2) / height))
    : 0.5;
  const scale = zoom === 'fit' ? fitScale : zoom;
  // 렌더 사이에 휠이 여러 번 오면 마지막으로 정한 값에서 이어 간다.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const offsetRef = useRef<Offset>(CENTER);
  const setOffset = (next: Offset) => {
    offsetRef.current = next;
    setOffsetState(next);
  };

  /** 커서(없으면 가운데) 아래 지점이 그 자리에 남는다. */
  const zoomTo = (next: number, clientX?: number, clientY?: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    const target = clampZoom(next);
    const ratio = target / scaleRef.current;
    const point = rect
      ? {
          x: (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2,
          y: (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2,
        }
      : CENTER;
    const from = offsetRef.current;
    setOffset({ x: point.x - (point.x - from.x) * ratio, y: point.y - (point.y - from.y) * ratio });
    scaleRef.current = target;
    setZoom(target);
  };

  const fit = () => {
    setOffset(CENTER);
    setZoom('fit');
  };
  useZoomKeys(viewport, {
    toggle: () => (zoom === 'fit' ? zoomTo(1) : fit()),
    actualSize: () => zoomTo(1),
  });

  useWheel(viewport, (event) => {
    event.preventDefault();
    zoomTo(
      scaleRef.current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      event.clientX,
      event.clientY,
    );
  });

  const pan = {
    begin(event: ReactPointerEvent<HTMLElement>) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, from: offsetRef.current };
      setPanning(true);
    },
    /** 끄는 중이면 true */
    move(event: ReactPointerEvent<HTMLElement>): boolean {
      const start = drag.current;
      if (!start) return false;
      setOffset({
        x: start.from.x + event.clientX - start.x,
        y: start.from.y + event.clientY - start.y,
      });
      return true;
    },
    end(): boolean {
      if (!drag.current) return false;
      drag.current = null;
      setPanning(false);
      return true;
    },
  };

  const fingers = useRef(new Map<number, Offset>());
  const pinch = useRef<Pinch | null>(null);
  const fromCenter = (point: Offset): Offset => {
    const rect = viewport.current?.getBoundingClientRect();
    return rect
      ? { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 }
      : point;
  };
  const twoFingers = () => {
    const [a, b] = [...fingers.current.values()];
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: fromCenter({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
    };
  };

  /** 두 손가락으로 확대·이동한다. true면 그리기 대신 이것이 받은 것이다. */
  const touch = {
    /** 두 번째 손가락이 닿으면 true. 그리던 획은 부른 쪽이 취소한다. */
    down(event: ReactPointerEvent<HTMLElement>): boolean {
      if (event.pointerType !== 'touch') return false;
      fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.current.size !== 2) return Boolean(pinch.current);
      event.currentTarget.setPointerCapture(event.pointerId);
      pinch.current = { ...twoFingers(), scale: scaleRef.current, from: offsetRef.current };
      return true;
    },
    move(event: ReactPointerEvent<HTMLElement>): boolean {
      if (!fingers.current.has(event.pointerId)) return false;
      fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const start = pinch.current;
      if (!start || fingers.current.size < 2) return Boolean(start);
      const next = pinchView(start, twoFingers());
      setOffset(next.offset);
      scaleRef.current = next.scale;
      setZoom(next.scale);
      return true;
    },
    /** 확대·이동 중이던 손가락이면 true. 남은 손가락으로는 다시 그리지 않는다. */
    up(event: ReactPointerEvent<HTMLElement>): boolean {
      if (!fingers.current.delete(event.pointerId)) return false;
      if (!pinch.current) return false;
      if (!fingers.current.size) pinch.current = null;
      return true;
    },
  };

  const stackStyle: CSSProperties = {
    width: width * scale,
    height: height * scale,
    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
  };

  return {
    viewport,
    scale,
    zoomTo,
    fit,
    pan,
    touch,
    panning,
    stackStyle,
  };
}
