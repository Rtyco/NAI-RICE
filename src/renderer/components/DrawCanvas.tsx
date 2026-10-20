import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasImage } from '../lib/image';
import { useCanvasViewport } from './canvasViewport';
import { Icon } from './Icon';
import { ZOOM_STEP } from './zoom';

type Tool = 'pen' | 'eraser' | 'fill' | 'picker';
type Tip = 'round' | 'soft' | 'square';

const TOOLS: Array<{
  id: Tool;
  label: string;
  key: string;
  icon: 'pen' | 'eraser' | 'bucket' | 'eyedropper';
}> = [
  { id: 'pen', label: '펜', key: 'b', icon: 'pen' },
  { id: 'eraser', label: '지우개', key: 'e', icon: 'eraser' },
  { id: 'fill', label: '채우기', key: 'g', icon: 'bucket' },
  { id: 'picker', label: '스포이트', key: 'c', icon: 'eyedropper' },
];

const TIPS: Array<{ id: Tip; label: string }> = [
  { id: 'round', label: '둥근' },
  { id: 'soft', label: '부드러운' },
  { id: 'square', label: '네모' },
];

const PALETTE = [
  '#000000',
  '#ffffff',
  '#808080',
  '#f5d0b5',
  '#e53935',
  '#fb8c00',
  '#fdd835',
  '#43a047',
  '#00acc1',
  '#1e88e5',
  '#5e35b1',
  '#d81b60',
  '#6d4c41',
];

/** 한 장이 1216×832 기준 약 4MB의 GPU 메모리다. */
const HISTORY_LIMIT = 20;
const MAX_SIZE = 300;

type Point = { x: number; y: number; pressure: number };

/** `willReadFrequently`(CPU)면 보일 때마다 통째로 GPU에 올려 붓이 늦게 따라온다. 픽셀은 `readable` 사본에서 읽는다. */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d')!;
}

function readable(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d', { willReadFrequently: true })!;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function stamp(
  context: CanvasRenderingContext2D,
  point: Point,
  size: number,
  tip: Tip,
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

/** 채널마다 차이가 `tolerance` 이하인 4방향 연결 영역. `pixels`는 바탕과 그린 것을 합친 색. */
function floodRegion(
  pixels: Uint32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number,
): Uint8Array {
  const region = new Uint8Array(width * height);
  const seed = pixels[startY * width + startX];
  const near = (value: number) =>
    Math.abs((value & 255) - (seed & 255)) <= tolerance &&
    Math.abs(((value >> 8) & 255) - ((seed >> 8) & 255)) <= tolerance &&
    Math.abs(((value >> 16) & 255) - ((seed >> 16) & 255)) <= tolerance &&
    Math.abs(((value >>> 24) & 255) - ((seed >>> 24) & 255)) <= tolerance;
  const stack = [startY * width + startX];
  while (stack.length) {
    const index = stack.pop()!;
    if (region[index] || !near(pixels[index])) continue;
    region[index] = 1;
    const x = index % width;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (index >= width) stack.push(index - width);
    if (index < width * (height - 1)) stack.push(index + width);
  }
  return region;
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
  const [tool, setTool] = useState<Tool>('pen');
  const [tip, setTip] = useState<Tip>('round');
  const [size, setSize] = useState(12);
  const [opacity, setOpacity] = useState(100);
  const [tolerance, setTolerance] = useState(32);
  const [color, setColor] = useState('#000000');
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
    const context = readable(makeCanvas(width, height));
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
    const copy = makeCanvas(width, height);
    context2d(copy).drawImage(layerRef.current!, 0, 0);
    return copy;
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
    setColor(rgbToHex(r, g, b));
  };

  const fill = (point: Point) => {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    pushHistory();
    const pixels = composite().getImageData(0, 0, width, height);
    const region = floodRegion(new Uint32Array(pixels.data.buffer), width, height, x, y, tolerance);
    const paint = new ImageData(width, height);
    const [r, g, b] = hexToRgb(color);
    for (let index = 0; index < region.length; index += 1) {
      if (!region[index]) continue;
      paint.data[index * 4] = r;
      paint.data[index * 4 + 1] = g;
      paint.data[index * 4 + 2] = b;
      paint.data[index * 4 + 3] = 255;
    }
    const temp = makeCanvas(width, height);
    context2d(temp).putImageData(paint, 0, 0);
    const context = layer();
    context.globalAlpha = opacity / 100;
    context.drawImage(temp, 0, 0);
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

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      view.pan.begin(event);
      moveCursor(null);
      return;
    }
    if (event.button !== 0) return;
    const point = pointOf(event);
    // NovelAI 웹처럼 Ctrl+클릭은 어느 도구에서나 스포이트.
    if (event.ctrlKey || tool === 'picker') {
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
    drawSegment(point, point);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (view.pan.move(event)) return;
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
    if (view.pan.end()) return;
    const brush = active.current;
    if (!brush) return;
    active.current = null;
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
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) undo();
        else if (key === 'y' || (key === 'z' && event.shiftKey)) redo();
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      const next = TOOLS.find((item) => item.key === key);
      if (next) setTool(next.id);
      else if (key === '[') setSize((value) => Math.max(1, Math.round(value / 1.2)));
      else if (key === ']') setSize((value) => Math.min(MAX_SIZE, Math.round(value * 1.2) + 1));
      else return;
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  const brushing = tool === 'pen' || tool === 'eraser';

  return (
    <section className="canvas-card draw-canvas">
      <div className="canvas-toolbar">
        <div className="segmented" role="group" aria-label="도구">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              className={tool === item.id ? 'active blue' : ''}
              aria-pressed={tool === item.id}
              title={`${item.label} (${item.key.toUpperCase()})`}
              onClick={() => setTool(item.id)}
            >
              <Icon name={item.icon} size={14} /> {item.label}
            </button>
          ))}
        </div>
        <span className="zone-divider" />
        <label className="draw-color" title="색 (Ctrl+클릭: 그림에서 색 고르기)">
          <input
            type="color"
            value={color}
            aria-label="색"
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <div className="draw-palette" role="group" aria-label="팔레트">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              className={swatch === color ? 'active' : ''}
              style={{ background: swatch }}
              title={swatch}
              aria-label={`색 ${swatch}`}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
        <span className="zone-divider" />
        <div className={`brush-settings ${brushing ? '' : 'idle'}`}>
          <div className="segmented" role="group" aria-label="펜 끝">
            {TIPS.map((item) => (
              <button
                key={item.id}
                className={tip === item.id ? 'active' : ''}
                aria-pressed={tip === item.id}
                onClick={() => setTip(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="range-field" title="[ / ]로 줄이고 키웁니다">
            크기
            <input
              type="range"
              min="1"
              max={MAX_SIZE}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
            <b>{size}px</b>
          </label>
        </div>
        <label className="range-field" title="펜과 채우기의 불투명도">
          불투명도
          <input
            type="range"
            min="5"
            max="100"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
          <b>{opacity}%</b>
        </label>
        {tool === 'fill' && (
          <label className="range-field" title="이 차이 안의 색까지 함께 채웁니다">
            허용 오차
            <input
              type="range"
              min="0"
              max="128"
              value={tolerance}
              onChange={(event) => setTolerance(Number(event.target.value))}
            />
            <b>{tolerance}</b>
          </label>
        )}
        <span className="zone-divider" />
        <button
          className="icon-button"
          onClick={undo}
          disabled={!undoStack.current.length}
          aria-label="실행 취소"
          title="실행 취소 (Ctrl+Z)"
        >
          <Icon name="undo" size={15} />
        </button>
        <button
          className="icon-button redo"
          onClick={redo}
          disabled={!redoStack.current.length}
          aria-label="다시 실행"
          title="다시 실행 (Ctrl+Y)"
        >
          <Icon name="undo" size={15} />
        </button>
        <button onClick={clearDrawing} title="그린 것을 모두 지웁니다. 바탕 이미지는 그대로입니다.">
          그린 것 지우기
        </button>
        <div className="toolbar-zone view-zone">
          <span
            className="canvas-zoom"
            title="휠: 확대·축소 · 가운데 버튼(휠)이나 Space를 누른 채 끌기: 화면 이동"
          >
            <button
              className="icon-button"
              aria-label="축소"
              onClick={() => view.zoomTo(view.scale / ZOOM_STEP)}
            >
              <Icon name="zoom-out" size={15} />
            </button>
            <button className="zoom-level" title="화면에 맞추고 가운데로" onClick={view.fit}>
              {Math.round(view.scale * 100)}%
            </button>
            <button
              className="icon-button"
              aria-label="확대"
              onClick={() => view.zoomTo(view.scale * ZOOM_STEP)}
            >
              <Icon name="zoom-in" size={15} />
            </button>
            <button className="zoom-level" title="원본 크기 (1:1)" onClick={() => view.zoomTo(1)}>
              1:1
            </button>
          </span>
          {props.onApply && (
            <button
              className="accent"
              disabled={!dirty}
              title="그린 것을 이미지에 합쳐 i2i 이미지로 씁니다. 생성하거나 다른 탭으로 가면 자동으로 합칩니다."
              onClick={() => void apply()}
            >
              이미지에 합치기
            </button>
          )}
        </div>
      </div>
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
        {props.onApply && (
          <span>{dirty ? '합치지 않은 그림이 있습니다' : '바탕 이미지와 같습니다'}</span>
        )}
        <span>B 펜 · E 지우개 · G 채우기 · C 스포이트 · [ ] 크기 · Ctrl+클릭 색 고르기</span>
      </div>
    </section>
  );
}
