import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Rect } from '../../core/domain/types';
import {
  buildGenerationMask,
  inferSavedExpansion,
  invertMask,
  manualOverrides,
  maskHasGeneratePixels,
} from '../../core/imaging/MaskBuilder';
import {
  fillCell,
  forEachStampCell,
  MASK_CELL,
  strokeStamps,
  type BrushShape,
} from '../../core/imaging/MaskBrush';
import { clampRect, contains } from '../../core/imaging/rects';
import type { CanvasImage } from '../lib/image';
import { Icon } from './Icon';
import { useCanvasViewport } from './canvasViewport';
import { ZOOM_STEP } from './zoom';

type Tool = 'reference' | 'output' | 'generate' | 'keep';
type RectHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

type Props = {
  image: CanvasImage;
  /** `image`를 그 자리에서 다시 칠할 때마다 바뀐다(배경색). 이때는 마스크 보정을 그대로 둔다. */
  imageVersion?: number;
  width: number;
  height: number;
  backgroundMask: Uint8Array;
  referenceRect: Rect;
  outputRect: Rect;
  expansionPx: number;
  initialMask?: Uint8Array;
  detectionLabel: string;
  /** 캔버스 아래 상태 줄 끝에 덧붙일 내용(저장 크기, 경고 등). */
  status?: ReactNode;
  onReferenceRectChange: (rect: Rect) => void;
  onOutputRectChange: (rect: Rect) => void;
  onMaskChange: (mask: Uint8Array) => void;
  /** 자유 인페인팅: 참고 영역·결과 영역 없이 다시 그릴 곳만 칠한다. */
  maskOnly?: boolean;
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
 * 참고 영역 여백 값을 바꾸면 바로 반영된다. 예전 버전의 두 배 확장으로 저장된 마스크도 알아본다.
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
  const dragRef = useRef<DragState | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  /** 붓질 중에는 같은 버퍼를 직접 고치고, 프레임마다 한 번만 다시 그린다. */
  const strokeRef = useRef<Int8Array | null>(null);
  const frameRef = useRef(0);
  const [tool, setTool] = useState<Tool>(props.maskOnly ? 'generate' : 'reference');
  /** 붓이 지나간 마지막 위치(칸 좌표). 다음 이벤트까지의 사이를 채운다. */
  const lastStampRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  /** Space를 누르고 있는 동안은 왼쪽 버튼으로도 화면을 옮긴다(손 도구). */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [opacity, setOpacity] = useState(42);
  /** 붓 크기(칸 수). NovelAI 웹 기본값 4칸 = 32px. */
  const [brushSize, setBrushSize] = useState(4);
  const [brushShape, setBrushShape] = useState<BrushShape>('circle');
  const [overrides, setOverrides] = useState<Int8Array>(() =>
    createOverrides(props, props.initialMask),
  );
  const [undoStack, setUndoStack] = useState<Int8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Int8Array[]>([]);
  const { onMaskChange } = props;

  // 영역·확장 값은 처음 불러올 때의 값으로만 수동 보정을 가려낸다. 이후 바뀌면 자동 계산이 따라간다.
  const baseRef = useRef<OverrideBase>(props);
  baseRef.current = props;
  useEffect(() => {
    setOverrides(createOverrides(baseRef.current, props.initialMask));
    setUndoStack([]);
    setRedoStack([]);
  }, [props.width, props.height, props.image, props.initialMask]);

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

  const hasGeneratePixels = useMemo(() => maskHasGeneratePixels(mask), [mask]);

  const view = useCanvasViewport(props.width, props.height);
  const scale = view.scale;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, props.width, props.height);
    context.drawImage(props.image, 0, 0, props.width, props.height);
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
    // 픽셀마다 네 바이트를 따로 쓰지 않고 한 번에 쓴다. Windows(x86)는 리틀 엔디언이라 RGBA가 ABGR 순서다.
    const pixels = new Uint32Array(overlay.data.buffer);
    const color = ((alpha << 24) | (190 << 16) | (208 << 8) | 23) >>> 0;
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (mask[pixel]) pixels[pixel] = color;
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
    if (props.maskOnly) return;
    drawRect(props.referenceRect, '#3ee089', tool === 'reference');
    drawRect(props.outputRect, '#36a3ff', tool === 'output');
  }, [
    mask,
    props.maskOnly,
    opacity,
    props.image,
    props.width,
    props.height,
    props.referenceRect,
    props.outputRect,
    tool,
  ]);

  useEffect(draw, [draw, props.imageVersion]);

  useEffect(() => onMaskChange(mask), [mask, onMaskChange]);

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
    const to = { x: x / MASK_CELL, y: y / MASK_CELL };
    const from = lastStampRef.current;
    lastStampRef.current = to;
    for (const stamp of from ? strokeStamps(from, to, brushSize) : [to]) {
      forEachStampCell(stamp.x, stamp.y, brushSize, brushShape, (cellX, cellY) =>
        fillCell(buffer, props.width, props.height, cellX, cellY, value),
      );
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

  /** 붓이 찍힐 칸을 마우스 위치에 겹쳐 보여 준다. 다시 그리지 않도록 상태 대신 스타일을 바로 고친다. */
  const moveCursor = (event: ReactPointerEvent<HTMLCanvasElement> | null) => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    if (!event || (tool !== 'generate' && tool !== 'keep')) {
      cursor.style.display = 'none';
      return;
    }
    const point = pointFromEvent(event);
    const cell = MASK_CELL * scale;
    const left = Math.round(point.x / MASK_CELL - brushSize / 2) * cell;
    const top = Math.round(point.y / MASK_CELL - brushSize / 2) * cell;
    cursor.style.display = 'block';
    cursor.style.transform = `translate(${left}px, ${top}px)`;
    cursor.style.width = cursor.style.height = `${brushSize * cell}px`;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      view.pan.begin(event);
      moveCursor(null);
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (tool === 'generate' || tool === 'keep') {
      beginHistory();
      lastStampRef.current = null;
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
    if (view.pan.move(event)) return;
    moveCursor(event);
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
    // Chromium이 pointermove를 이미 프레임에 맞춰 보내므로 바로 반영한다.
    // rAF로 한 번 더 미루면 한 프레임 늦게 따라와 딱딱하게 느껴진다.
    const next = clampRect(candidate, props.width, props.height, 16);
    if (tool === 'reference') props.onReferenceRectChange(next);
    else props.onOutputRectChange(next);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (view.pan.end()) return;
    dragRef.current = null;
    lastStampRef.current = null;
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
      if (
        event.code === 'Space' &&
        !event.repeat &&
        !document.querySelector('.modal-backdrop .modal:not(.large)')
      ) {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
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

  const invert = () => {
    beginHistory();
    setOverrides(Int8Array.from(invertMask(mask), (value) => (value ? 1 : 0)));
  };

  // 모든 픽셀을 보호로 고정한다. 자동 계산이 다시 칠하지 않으므로 마스크가 빈 채로 남는다.
  const clearMask = () => {
    beginHistory();
    setOverrides(new Int8Array(props.width * props.height).fill(0));
  };

  const brushing = tool === 'generate' || tool === 'keep';

  return (
    <section className="canvas-card">
      <div className="canvas-toolbar">
        {!props.maskOnly && (
          <>
            <div className="segmented" role="group" aria-label="영역 상자">
              <button
                className={tool === 'reference' ? 'active green' : ''}
                aria-pressed={tool === 'reference'}
                title="참고 그림이 있는 곳입니다. 이 안은 다시 그리지 않습니다. 끌어서 옮기고 모서리로 크기를 바꿉니다."
                onClick={() => setTool('reference')}
              >
                <i className="green-dot" /> 참고 영역
              </button>
              <button
                className={tool === 'output' ? 'active blue' : ''}
                aria-pressed={tool === 'output'}
                title="생성한 뒤 잘라서 저장할 곳입니다. 끌어서 옮기고 모서리로 크기를 바꿉니다."
                onClick={() => setTool('output')}
              >
                <i className="blue-dot" /> 결과 영역
              </button>
            </div>
            <span className="zone-divider" />
          </>
        )}
        <div className="segmented" role="group" aria-label="붓">
          <button
            className={tool === 'generate' ? 'active teal' : ''}
            aria-pressed={tool === 'generate'}
            title="생성 영역(청록색)을 칠합니다. NovelAI가 이곳을 새로 그립니다."
            onClick={() => setTool('generate')}
          >
            <i className="teal-dot" /> 칠하기
          </button>
          <button
            className={tool === 'keep' ? 'active' : ''}
            aria-pressed={tool === 'keep'}
            title="생성 영역을 지웁니다. 지운 곳은 그대로 남습니다."
            onClick={() => setTool('keep')}
          >
            <Icon name="eraser" size={14} /> 지우기
          </button>
        </div>
        <div className={`brush-settings ${brushing ? '' : 'idle'}`}>
          <div className="segmented" role="group" aria-label="붓 모양">
            <button
              className={brushShape === 'circle' ? 'active' : ''}
              aria-pressed={brushShape === 'circle'}
              title="둥근 붓"
              onClick={() => setBrushShape('circle')}
            >
              <Icon name="circle" size={14} />
            </button>
            <button
              className={brushShape === 'square' ? 'active' : ''}
              aria-pressed={brushShape === 'square'}
              title="네모 붓"
              onClick={() => setBrushShape('square')}
            >
              <Icon name="square" size={14} />
            </button>
          </div>
          <label className="range-field" title="NovelAI 웹처럼 8px 칸 단위로 칠합니다">
            크기
            <input
              type="range"
              min="1"
              max="32"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
            <b>{brushSize * MASK_CELL}px</b>
          </label>
        </div>
        <span className="zone-divider" />
        <button onClick={invert} title="생성 영역과 나머지를 맞바꿉니다">
          반전
        </button>
        <button
          onClick={clearMask}
          disabled={!hasGeneratePixels}
          title="생성 영역(청록색)을 모두 지웁니다. Ctrl+Z로 되돌릴 수 있습니다."
        >
          모두 지우기
        </button>
        <button
          className="icon-button"
          onClick={undo}
          disabled={!undoStack.length}
          aria-label="실행 취소"
          title="실행 취소 (Ctrl+Z)"
        >
          <Icon name="undo" size={15} />
        </button>
        <button
          className="icon-button redo"
          onClick={redo}
          disabled={!redoStack.length}
          aria-label="다시 실행"
          title="다시 실행 (Ctrl+Y)"
        >
          <Icon name="undo" size={15} />
        </button>
        <div className="toolbar-zone view-zone">
          <label
            className="range-field"
            title="생성 영역(청록색)을 화면에 얼마나 진하게 보일지 정합니다"
          >
            불투명도
            <input
              type="range"
              min="0"
              max="80"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
            <b>{opacity}%</b>
          </label>
          <span
            className="canvas-zoom"
            title="휠: 확대·축소 · 가운데 버튼(휠)이나 Space를 누른 채 끌기: 화면 이동"
          >
            <button
              className="icon-button"
              aria-label="축소"
              title="축소 (휠)"
              onClick={() => view.zoomTo(scale / ZOOM_STEP)}
            >
              <Icon name="zoom-out" size={15} />
            </button>
            <button className="zoom-level" title="화면에 맞추고 가운데로" onClick={view.fit}>
              {Math.round(scale * 100)}%
            </button>
            <button
              className="icon-button"
              aria-label="확대"
              title="확대 (휠)"
              onClick={() => view.zoomTo(scale * ZOOM_STEP)}
            >
              <Icon name="zoom-in" size={15} />
            </button>
            <button className="zoom-level" title="원본 크기 (1:1)" onClick={() => view.zoomTo(1)}>
              1:1
            </button>
          </span>
        </div>
      </div>
      <div
        ref={view.viewport}
        className={`canvas-viewport ${view.panning ? 'panning' : ''} ${spaceHeld ? 'hand' : ''}`}
        onMouseDown={(event) => {
          // 가운데 버튼의 자동 스크롤 대신 끌어서 옮기기를 쓴다.
          if (event.button === 1) event.preventDefault();
        }}
      >
        <div className="canvas-stack" style={view.stackStyle}>
          <canvas
            ref={canvasRef}
            width={props.width}
            height={props.height}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onPointerLeave={() => moveCursor(null)}
            aria-label="참고 이미지와 인페인트 마스크 편집 캔버스"
          />
          <div
            ref={cursorRef}
            className={`brush-cursor ${brushShape} ${tool === 'keep' ? 'erase' : ''}`}
          />
        </div>
      </div>
      <div className="canvas-status">
        <span>
          캔버스 {props.width}×{props.height}
        </span>
        {props.detectionLabel && <span>{props.detectionLabel}</span>}
        {props.status}
      </div>
    </section>
  );
}
