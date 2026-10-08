import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Rect } from '../../core/domain/types';
import {
  buildGenerationMask,
  inferSavedExpansion,
  invertMask,
  manualOverrides,
} from '../../core/imaging/MaskBuilder';
import { clampRect, contains } from '../../core/imaging/rects';
import { loadHtmlImage, maskToDataUrl } from '../lib/image';

type Tool = 'reference' | 'output' | 'generate' | 'keep';
type RectHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

type Props = {
  imageDataUrl: string;
  width: number;
  height: number;
  backgroundMask: Uint8Array;
  referenceRect: Rect;
  outputRect: Rect;
  expansionPx: number;
  initialMask?: Uint8Array;
  detectionLabel: string;
  onReferenceRectChange: (rect: Rect) => void;
  onOutputRectChange: (rect: Rect) => void;
  onMaskChange: (mask: Uint8Array, dataUrl: string) => void;
  onRedetect: () => void;
};

type DragState = {
  kind: 'rect' | 'brush';
  startX: number;
  startY: number;
  originalRect?: Rect;
  handle?: RectHandle;
};

const HISTORY_LIMIT = 40;

type OverrideBase = Pick<Props, 'width' | 'height' | 'backgroundMask' | 'referenceRect' | 'expansionPx'>;

/**
 * 저장된 마스크에서 붓으로 고친 픽셀만 수동 보정으로 남긴다. 나머지는 자동 계산을 따르므로
 * 보호 영역 확장 값을 바꾸면 바로 반영된다. 예전 버전의 두 배 확장으로 저장된 마스크도 알아본다.
 */
function createOverrides(base: OverrideBase, initialMask?: Uint8Array): Int8Array {
  const length = base.width * base.height;
  if (!initialMask || initialMask.length !== length) return new Int8Array(length).fill(-1);
  const input = {
    width: base.width,
    height: base.height,
    backgroundMask: base.backgroundMask,
    referenceRect: base.referenceRect,
  };
  return manualOverrides(initialMask, [
    buildGenerationMask({ ...input, expansionPx: base.expansionPx }),
    buildGenerationMask({ ...input, expansionPx: inferSavedExpansion(initialMask, input) }),
  ]);
}

function rectHandle(rect: Rect, x: number, y: number, radius: number): RectHandle | null {
  const points: Array<[RectHandle, number, number]> = [
    ['nw', rect.x, rect.y],
    ['ne', rect.x + rect.width, rect.y],
    ['sw', rect.x, rect.y + rect.height],
    ['se', rect.x + rect.width, rect.y + rect.height],
  ];
  for (const [handle, hx, hy] of points) {
    if (Math.hypot(x - hx, y - hy) <= radius) return handle;
  }
  return contains(rect, x, y) ? 'move' : null;
}

function resizedRect(original: Rect, handle: RectHandle, dx: number, dy: number): Rect {
  if (handle === 'move') return { ...original, x: original.x + dx, y: original.y + dy };
  let left = original.x;
  let top = original.y;
  let right = original.x + original.width;
  let bottom = original.y + original.height;
  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;
  if (right < left) [left, right] = [right, left];
  if (bottom < top) [top, bottom] = [bottom, top];
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function ReferenceCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  /** 붓질 중에는 같은 버퍼를 직접 고치고, 프레임마다 한 번만 다시 그린다. */
  const strokeRef = useRef<Int8Array | null>(null);
  const frameRef = useRef(0);
  const [tool, setTool] = useState<Tool>('reference');
  const [zoom, setZoom] = useState(70);
  const [opacity, setOpacity] = useState(42);
  const [brushSize, setBrushSize] = useState(24);
  const [overrides, setOverrides] = useState<Int8Array>(() =>
    createOverrides(props, props.initialMask),
  );
  const [undoStack, setUndoStack] = useState<Int8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Int8Array[]>([]);
  const { onMaskChange, width, height } = props;

  // 영역·확장 값은 처음 불러올 때의 값으로만 수동 보정을 가려낸다. 이후 바뀌면 자동 계산이 따라간다.
  const baseRef = useRef<OverrideBase>(props);
  baseRef.current = props;
  useEffect(() => {
    setOverrides(createOverrides(baseRef.current, props.initialMask));
    setUndoStack([]);
    setRedoStack([]);
  }, [props.width, props.height, props.imageDataUrl, props.initialMask]);

  useEffect(() => {
    let active = true;
    void loadHtmlImage(props.imageDataUrl).then((image) => {
      if (active) {
        imageRef.current = image;
        setOverrides((current) => Int8Array.from(current));
      }
    });
    return () => {
      active = false;
    };
  }, [props.imageDataUrl]);

  const mask = useMemo(
    () =>
      buildGenerationMask({
        width: props.width,
        height: props.height,
        backgroundMask: props.backgroundMask,
        referenceRect: props.referenceRect,
        expansionPx: props.expansionPx,
        // 해상도가 바뀐 직후 한 번은 이전 크기의 수동 마스크가 남아 있을 수 있다. 크기가 다르면 무시한다.
        overrides: overrides.length === props.width * props.height ? overrides : undefined,
      }),
    [
      props.width,
      props.height,
      props.backgroundMask,
      props.referenceRect,
      props.expansionPx,
      overrides,
    ],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const image = imageRef.current;
    if (!canvas || !context || !image) return;
    context.clearRect(0, 0, props.width, props.height);
    context.drawImage(image, 0, 0, props.width, props.height);
    // putImageData는 합성 없이 픽셀을 덮어쓰므로 별도 캔버스에 그린 뒤 drawImage로 겹친다.
    let overlayCanvas = overlayRef.current;
    if (!overlayCanvas || overlayCanvas.width !== props.width || overlayCanvas.height !== props.height) {
      overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = props.width;
      overlayCanvas.height = props.height;
      overlayRef.current = overlayCanvas;
    }
    const overlayContext = overlayCanvas.getContext('2d')!;
    const overlay = overlayContext.createImageData(props.width, props.height);
    const alpha = Math.round((opacity / 100) * 255);
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (!mask[pixel]) continue;
      overlay.data[pixel * 4] = 23;
      overlay.data[pixel * 4 + 1] = 208;
      overlay.data[pixel * 4 + 2] = 190;
      overlay.data[pixel * 4 + 3] = alpha;
    }
    overlayContext.putImageData(overlay, 0, 0);
    context.drawImage(overlayCanvas, 0, 0);

    const drawRect = (rect: Rect, color: string, active: boolean) => {
      context.save();
      context.strokeStyle = color;
      context.lineWidth = active ? 5 : 3;
      context.setLineDash(active ? [] : [12, 8]);
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      if (active) {
        context.fillStyle = color;
        for (const [x, y] of [
          [rect.x, rect.y],
          [rect.x + rect.width, rect.y],
          [rect.x, rect.y + rect.height],
          [rect.x + rect.width, rect.y + rect.height],
        ]) {
          context.fillRect(x - 7, y - 7, 14, 14);
        }
      }
      context.restore();
    };
    drawRect(props.referenceRect, '#3ee089', tool === 'reference');
    drawRect(props.outputRect, '#36a3ff', tool === 'output');
  }, [mask, opacity, props.width, props.height, props.referenceRect, props.outputRect, tool]);

  useEffect(draw, [draw]);

  // PNG 인코딩은 무거우므로 붓질이 끝난 뒤에만 상위로 알린다.
  useEffect(() => {
    if (strokeRef.current) return;
    onMaskChange(mask, maskToDataUrl(mask, width, height));
  }, [mask, width, height, onMaskChange]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(props.width - 1, ((event.clientX - bounds.left) / bounds.width) * props.width),
      ),
      y: Math.max(
        0,
        Math.min(props.height - 1, ((event.clientY - bounds.top) / bounds.height) * props.height),
      ),
      scale: props.width / bounds.width,
    };
  };

  const paint = (x: number, y: number, value: 0 | 1) => {
    const buffer = strokeRef.current;
    if (!buffer) return;
    const radius = brushSize / 2;
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(props.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(props.height - 1, Math.ceil(y + radius));
    const radiusSquared = radius * radius;
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        if ((px - x) ** 2 + (py - y) ** 2 <= radiusSquared) buffer[py * props.width + px] = value;
      }
    }
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        // 같은 버퍼를 새 뷰로 감싸 상태 변경으로 인식시킨다(복사 없음).
        if (strokeRef.current) setOverrides(new Int8Array(strokeRef.current.buffer));
      });
    }
  };

  const beginHistory = () => {
    setUndoStack((items) => [...items.slice(-(HISTORY_LIMIT - 1)), Int8Array.from(overrides)]);
    setRedoStack([]);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (tool === 'generate' || tool === 'keep') {
      beginHistory();
      strokeRef.current = Int8Array.from(overrides);
      dragRef.current = { kind: 'brush', startX: point.x, startY: point.y };
      paint(point.x, point.y, tool === 'generate' ? 1 : 0);
      return;
    }
    const rect = tool === 'reference' ? props.referenceRect : props.outputRect;
    const handle = rectHandle(rect, point.x, point.y, Math.max(8, 12 * point.scale));
    if (handle) {
      dragRef.current = {
        kind: 'rect',
        startX: point.x,
        startY: point.y,
        originalRect: { ...rect },
        handle,
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    if (drag.kind === 'brush') {
      paint(point.x, point.y, tool === 'generate' ? 1 : 0);
      return;
    }
    if (!drag.originalRect || !drag.handle) return;
    const candidate = resizedRect(
      drag.originalRect,
      drag.handle,
      point.x - drag.startX,
      point.y - drag.startY,
    );
    const next = clampRect(candidate, props.width, props.height, 16);
    if (tool === 'reference') props.onReferenceRectChange(next);
    else props.onOutputRectChange(next);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    const stroke = strokeRef.current;
    if (stroke) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      strokeRef.current = null;
      setOverrides(new Int8Array(stroke.buffer));
    }
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((items) => [...items, Int8Array.from(overrides)]);
    setOverrides(Int8Array.from(previous));
    setUndoStack((items) => items.slice(0, -1));
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((items) => [...items, Int8Array.from(overrides)]);
    setOverrides(Int8Array.from(next));
    setRedoStack((items) => items.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const invert = () => {
    beginHistory();
    setOverrides(Int8Array.from(invertMask(mask), (value) => (value ? 1 : 0)));
  };

  return (
    <section className="canvas-card">
      <div className="canvas-toolbar">
        <div className="segmented" aria-label="캔버스 도구">
          <button
            className={tool === 'reference' ? 'active green' : ''}
            onClick={() => setTool('reference')}
          >
            참고 영역 보호
          </button>
          <button
            className={tool === 'output' ? 'active blue' : ''}
            onClick={() => setTool('output')}
          >
            결과 크롭
          </button>
          <button
            className={tool === 'generate' ? 'active teal' : ''}
            onClick={() => setTool('generate')}
          >
            생성 마스크
          </button>
          <button className={tool === 'keep' ? 'active' : ''} onClick={() => setTool('keep')}>
            보호 마스크
          </button>
        </div>
        <button onClick={undo} disabled={!undoStack.length} title="Ctrl+Z">
          실행 취소
        </button>
        <button onClick={redo} disabled={!redoStack.length} title="Ctrl+Y">
          다시 실행
        </button>
        <button onClick={invert}>반전</button>
        <button onClick={props.onRedetect}>영역 재감지</button>
      </div>
      <div className="canvas-meta">
        <span>
          {props.width} × {props.height}px
        </span>
        <span>{props.detectionLabel}</span>
        <label>
          브러시 크기{' '}
          <input
            type="range"
            min="4"
            max="128"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />{' '}
          {brushSize}px
        </label>
        <label>
          마스크 불투명도{' '}
          <input
            type="range"
            min="0"
            max="80"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />{' '}
          {opacity}%
        </label>
        <label>
          줌{' '}
          <input
            type="range"
            min="35"
            max="150"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />{' '}
          {zoom}%
        </label>
      </div>
      <div className="canvas-scroll">
        <canvas
          ref={canvasRef}
          width={props.width}
          height={props.height}
          style={{ width: `${zoom}%`, aspectRatio: `${props.width} / ${props.height}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          aria-label="참고 이미지와 인페인트 마스크 편집 캔버스"
        />
      </div>
      <div className="legend">
        <span>
          <i className="green-dot" /> 참고 영역 (보호)
        </span>
        <span>
          <i className="blue-dot" /> 최종 결과 크롭
        </span>
        <span>
          <i className="teal-dot" /> NovelAI 생성 영역
        </span>
      </div>
    </section>
  );
}
