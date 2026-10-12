import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { clampZoom, useWheel, ZOOM_STEP } from './zoom';

type Offset = { x: number; y: number };
const CENTER: Offset = { x: 0, y: 0 };
/** 화면에 맞출 때 가장자리에 남기는 여백(px). */
const PAD = 16;

/**
 * 편집 캔버스의 확대·이동. 결과 미리보기(ImageStage)처럼 캔버스를 화면 가운데에서 `offset`만큼 민 자리에
 * 그린다. 스크롤로 옮기면 캔버스가 화면보다 작을 때 움직이지 않아(가운데에 고정) 이 방식을 쓴다.
 */
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
  // 렌더 사이에 휠 이벤트가 여러 번 오면 렌더된 값이 아니라 마지막으로 정한 값에서 이어 간다.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const offsetRef = useRef<Offset>(CENTER);
  const setOffset = (next: Offset) => {
    offsetRef.current = next;
    setOffsetState(next);
  };

  /** 화면의 한 점(없으면 가운데) 아래에 있던 캔버스 지점이 그 자리에 남도록 배율을 바꾼다. */
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
    /** 끄는 중이면 옮기고 true를 돌려준다. */
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

  const stackStyle: CSSProperties = {
    width: width * scale,
    height: height * scale,
    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
  };

  return {
    viewport,
    scale,
    zoomTo,
    fit: () => {
      setOffset(CENTER);
      setZoom('fit');
    },
    pan,
    panning,
    stackStyle,
  };
}
