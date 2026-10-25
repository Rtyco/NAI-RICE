import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { floodRegion } from '../../core/imaging/FloodFill';
import {
  canvas2d,
  fillRegion,
  hexToRgb,
  packedColor,
  rgbToHex,
  type CanvasImage,
} from '../lib/image';
import { useCanvasViewport } from './canvasViewport';
import { useDrawSettings, type DrawTip } from './drawSettings';
import { DrawToolbar } from './DrawToolbar';

/** 한 장이 1216×832 기준 약 4MB의 GPU 메모리다. */
const HISTORY_LIMIT = 20;

type Point = { x: number; y: number; pressure: number };

/** `willReadFrequently`(CPU)면 보일 때마다 통째로 GPU에 올려 붓이 늦게 따라온다. 픽셀은 `composite()` 사본에서 읽는다. */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d')!;
}

function stamp(
  context: CanvasRenderingContext2D,
  point: Point,
  size: number,
  tip: DrawTip,
  color: string,
) {
  const radius = Math.max(0.5, (size * point.pressure) / 2);
  if (tip === 'square') {
    context.fillStyle = color;
    context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    return;
  }
  if (tip === 'soft') {
    const [r, g, b] = hexToRgb(color);
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    context.fillStyle = gradient;
  } else context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
}

/**
 * NovelAI 웹 Draw처럼 바탕 위 별도 층에 그린다. 바탕·그린 것·지금 획을 캔버스 세 장으로 겹쳐 매 프레임 전체를 다시 그리지 않는다. 획 불투명도는 CSS로 보이고 손을 뗄 때
 * 합친다.
 */
export function DrawCanvas(props: {
  base: CanvasImage;
  /** 바탕 캔버스를 그 자리에서 다시 칠할 때마다 바뀐다. */
  baseVersion?: number;
  width: number;
  height: number;
  /** 지우개로 지울 수 있게 그린 층으로 불러온다. 처음 한 번만 읽는다. */
  initialLayer?: CanvasImageSource;
  /** 바탕과 합친 PNG */
  onApply?: (dataUrl: string) => Promise<void>;
  /** 합치지 않은 그림이 없으면 undefined. */
  onPendingChange?: (apply: (() => Promise<void>) | undefined) => void;
  /** 있으면 합치지 않고 바뀔 때마다 그린 층 사본을 넘긴다. */
  onLayerChange?: (layer: HTMLCanvasElement) => void;
}) {
  const { width, height } = props;
  const view = useCanvasViewport(width, height);
  const baseRef = useRef<HTMLCanvasElement>(null);
  /** 닫힐 때의 정리 함수는 React가 ref를 비운 뒤에 돌아 요소를 따로 쥔다. */
  const layerRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const settings = useDrawSettings();
  const { tool, tip, size, opacity, tolerance, color, backColor } = settings;
  /** 앞 획의 끝. Shift+클릭이 여기서 곧게 잇는다. */
  const lastPoint = useRef<Point | null>(null);
  const [dirty, setDirty] = useState(false);
  const undoStack = useRef<HTMLCanvasElement[]>([]);
  const redoStack = useRef<HTMLCanvasElement[]>([]);
  const [, setHistoryVersion] = useState(0);
  const active = useRef<{ tool: 'pen' | 'eraser'; last: Point } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const layer = () => context2d(layerRef.current!);
  const initialLayer = useRef(props.initialLayer);

  useEffect(() => {
    const context = baseRef.current && context2d(baseRef.current);
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(props.base, 0, 0, width, height);
  }, [props.base, props.baseVersion, width, height]);

  useEffect(() => {
    if (!initialLayer.current) return;
    const context = context2d(layerRef.current!);
    context.clearRect(0, 0, width, height);
    context.drawImage(initialLayer.current, 0, 0, width, height);
  }, [width, height]);

  const composite = (): CanvasRenderingContext2D => {
    const { context } = canvas2d(width, height);
    context.drawImage(props.base, 0, 0, width, height);
    context.drawImage(layerRef.current!, 0, 0);
    return context;
  };

  const apply = async () => {
    if (!dirty || !props.onApply) return;
    setDirty(false);
    await props.onApply(composite().canvas.toDataURL('image/png'));
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const { onPendingChange } = props;
  useEffect(() => {
    onPendingChange?.(dirty ? () => applyRef.current() : undefined);
  }, [dirty, onPendingChange]);
  useEffect(() => () => void applyRef.current(), []);

  /** GPU 안 복사라 getImageData처럼 멈칫하지 않는다. */
  const snapshot = () => {
    const copy = canvas2d(width, height, false);
    copy.context.drawImage(layerRef.current!, 0, 0);
    return copy.canvas;
  };
  const changed = () => {
    if (props.onLayerChange) props.onLayerChange(snapshot());
    else setDirty(true);
  };
  const pushHistory = () => {
    undoStack.current = [...undoStack.current.slice(-(HISTORY_LIMIT - 1)), snapshot()];
    redoStack.current = [];
    setHistoryVersion((version) => version + 1);
  };
  const restore = (
    from: { current: HTMLCanvasElement[] },
    to: { current: HTMLCanvasElement[] },
  ) => {
    const previous = from.current.at(-1);
    if (!previous) return;
    to.current = [...to.current, snapshot()];
    from.current = from.current.slice(0, -1);
    const context = layer();
    context.clearRect(0, 0, width, height);
    context.drawImage(previous, 0, 0);
    changed();
    setHistoryVersion((version) => version + 1);
  };
  const undo = () => restore(undoStack, redoStack);
  const redo = () => restore(redoStack, undoStack);

  const clearDrawing = () => {
    pushHistory();
    layer().clearRect(0, 0, width, height);
    changed();
  };

  const fillLayer = (fillColor: string) => {
    pushHistory();
    const context = layer();
    context.fillStyle = fillColor;
    context.fillRect(0, 0, width, height);
    changed();
  };

  const pointAt = (bounds: DOMRect, event: PointerEvent): Point => ({
    x: ((event.clientX - bounds.left) / bounds.width) * width,
    y: ((event.clientY - bounds.top) / bounds.height) * height,
    // 마우스는 누르는 동안 0.5로 온다.
    pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 1,
  });
  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>): Point =>
    pointAt(event.currentTarget.getBoundingClientRect(), event.nativeEvent);

  const pick = (point: Point) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(point.x)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(point.y)));
    const [r, g, b] = composite().getImageData(x, y, 1, 1).data;
    settings.setColor(rgbToHex(r, g, b));
  };

  const fill = (point: Point) => {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    pushHistory();
    const pixels = composite().getImageData(0, 0, width, height);
    const region = floodRegion(new Uint32Array(pixels.data.buffer), width, height, x, y, tolerance);
    const paint = new ImageData(width, height);
    fillRegion(new Uint32Array(paint.data.buffer), region, packedColor(hexToRgb(color)));
    const temp = canvas2d(width, height, false);
    temp.context.putImageData(paint, 0, 0);
    const context = layer();
    context.globalAlpha = opacity / 100;
    context.drawImage(temp.canvas, 0, 0);
    context.globalAlpha = 1;
    changed();
  };

  const drawSegment = (from: Point, to: Point) => {
    const brush = active.current;
    if (!brush) return;
    const target = brush.tool === 'pen' ? context2d(strokeRef.current!) : layer();
    target.globalCompositeOperation = brush.tool === 'eraser' ? 'destination-out' : 'source-over';
    const spacing = Math.max(1, size * (tip === 'soft' ? 0.1 : 0.2));
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      stamp(
        target,
        {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          pressure: from.pressure + (to.pressure - from.pressure) * t,
        },
        size,
        tip,
        brush.tool === 'eraser' ? '#000000' : color,
      );
    }
    target.globalCompositeOperation = 'source-over';
  };

  const moveCursor = (event: ReactPointerEvent<HTMLCanvasElement> | null) => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    if (!event || (tool !== 'pen' && tool !== 'eraser') || spaceHeld) {
      cursor.style.display = 'none';
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const diameter = size * view.scale;
    cursor.style.display = 'block';
    cursor.style.width = cursor.style.height = `${diameter}px`;
    cursor.style.transform = `translate(${event.clientX - bounds.left - diameter / 2}px, ${event.clientY - bounds.top - diameter / 2}px)`;
  };

  /** 두 번째 손가락이 닿으면 첫 손가락으로 그리던 획을 되돌린다. */
  const cancelStroke = () => {
    if (!active.current) return;
    active.current = null;
    context2d(strokeRef.current!).clearRect(0, 0, width, height);
    const before = undoStack.current.at(-1);
    if (!before) return;
    undoStack.current = undoStack.current.slice(0, -1);
    const context = layer();
    context.clearRect(0, 0, width, height);
    context.drawImage(before, 0, 0);
    setHistoryVersion((version) => version + 1);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (view.touch.down(event)) {
      cancelStroke();
      moveCursor(null);
      return;
    }
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      view.pan.begin(event);
      moveCursor(null);
      return;
    }
    if (event.button !== 0) return;
    const point = pointOf(event);
    // 포토샵의 Alt+클릭, NovelAI 웹의 Ctrl+클릭은 어느 도구에서나 스포이트.
    if (event.altKey || event.ctrlKey || tool === 'picker') {
      pick(point);
      return;
    }
    if (tool === 'fill') {
      fill(point);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pushHistory();
    context2d(strokeRef.current!).clearRect(0, 0, width, height);
    active.current = { tool, last: point };
    drawSegment(event.shiftKey && lastPoint.current ? lastPoint.current : point, point);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (view.touch.move(event) || view.pan.move(event)) return;
    moveCursor(event);
    const brush = active.current;
    if (!brush) return;
    // Chromium은 pointermove를 프레임마다 묶는다. 모두 이어야 빠른 곡선이 꺾은선이 되지 않는다.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const bounds = event.currentTarget.getBoundingClientRect();
    for (const moved of events.length ? events : [event.nativeEvent]) {
      const point = pointAt(bounds, moved);
      drawSegment(brush.last, point);
      brush.last = point;
    }
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (view.touch.up(event) || view.pan.end()) return;
    const brush = active.current;
    if (!brush) return;
    active.current = null;
    lastPoint.current = brush.last;
    if (brush.tool === 'pen') {
      const context = layer();
      context.globalAlpha = opacity / 100;
      context.drawImage(strokeRef.current!, 0, 0);
      context.globalAlpha = 1;
      context2d(strokeRef.current!).clearRect(0, 0, width, height);
    }
    changed();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      // 인페인트 편집 팝업 안에서도 쓰므로 맨 위 대화상자 안에 있을 때만 받는다.
      const dialog = [...document.querySelectorAll('.modal-backdrop')].at(-1);
      if (dialog && !dialog.contains(layerRef.current)) return;
      const key = event.key.toLowerCase();
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code)?.[1];
      const shortcut = settings.toolForKey(key);
      // 포토샵 단축키. 숫자는 화면 이동 단축키보다 먼저 받아야 해 캡처 단계에서 막는다.
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && event.shiftKey) redo();
        else if (key === 'z') undo();
        else if (key === 'y') redo();
        else if (event.key === 'Backspace') fillLayer(backColor);
        else return;
      } else if (event.altKey) {
        if (event.key === 'Backspace') fillLayer(color);
        else return;
      } else if (event.code === 'Space') setSpaceHeld(true);
      else if (event.code === 'BracketLeft') {
        if (event.shiftKey) settings.setTip('soft');
        else settings.shrink();
      } else if (event.code === 'BracketRight') {
        if (event.shiftKey) settings.setTip('round');
        else settings.grow();
      } else if (event.shiftKey) return;
      else if (digit) settings.typeOpacity(Number(digit));
      else if (key === 'x') settings.swapColors();
      else if (key === 'd') settings.resetColors();
      else if (event.key === 'Delete' || event.key === 'Backspace') clearDrawing();
      else if (shortcut) settings.setTool(shortcut);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  return (
    <section className="canvas-card draw-canvas">
      <DrawToolbar
        settings={settings}
        view={view}
        history={{
          onUndo: undo,
          onRedo: redo,
          canUndo: undoStack.current.length > 0,
          canRedo: redoStack.current.length > 0,
        }}
        onClear={clearDrawing}
        apply={props.onApply && { pending: dirty, run: () => void apply() }}
      />
      <div
        ref={view.viewport}
        className={`canvas-viewport ${view.panning ? 'panning' : ''} ${spaceHeld ? 'hand' : ''}`}
        onMouseDown={(event) => {
          // 가운데 버튼 자동 스크롤 대신 끌어서 옮기기
          if (event.button === 1) event.preventDefault();
        }}
      >
        <div className="canvas-stack" style={view.stackStyle}>
          <canvas ref={baseRef} width={width} height={height} />
          <canvas
            ref={(node) => {
              if (node) layerRef.current = node;
            }}
            className="draw-overlay"
            width={width}
            height={height}
          />
          <canvas
            ref={strokeRef}
            width={width}
            height={height}
            className={`draw-overlay ${tool === 'fill' || tool === 'picker' ? 'pick-cursor' : ''}`}
            style={{ opacity: opacity / 100 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onPointerLeave={() => moveCursor(null)}
            aria-label="그리기 캔버스"
          />
          <div
            ref={cursorRef}
            className={`brush-cursor ${tip === 'square' ? 'square' : 'circle'} ${tool === 'eraser' ? 'erase' : ''}`}
          />
        </div>
      </div>
      <div className="canvas-status">
        <span>
          캔버스 {width}×{height}
        </span>
        {props.onApply && dirty && <span>합치지 않은 그림이 있습니다</span>}
      </div>
    </section>
  );
}
