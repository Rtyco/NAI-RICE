import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { DividerLine, Rect } from '../../core/domain/types';
import { dividerPixels } from '../../core/imaging/Divider';
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
import {
  dragBox,
  handleAt,
  handleDirection,
  handlePoint,
  RESIZE_HANDLES,
  type ImageBox,
  type TransformHandle,
} from '../../core/imaging/FreeTransform';
import { clampRect, contains } from '../../core/imaging/rects';
import { hexToRgb, type CanvasImage } from '../lib/image';
import { Icon } from './Icon';
import { useCanvasViewport } from './canvasViewport';
import { ZOOM_STEP } from './zoom';

type Tool = 'reference' | 'output' | 'generate' | 'keep' | 'transform';
type RectHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

type Props = {
  image: CanvasImage;
  /** 그리기 층. 바탕 위에 그린다. */
  paint?: CanvasImageSource;
  /** 배경색을 다시 칠할 때마다 바뀐다. 이때는 마스크 보정을 유지한다. */
  imageVersion?: number;
  width: number;
  height: number;
  backgroundMask: Uint8Array;
  referenceRect: Rect;
  outputRect: Rect;
  expansionPx: number;
  initialMask?: Uint8Array;
  detectionLabel: string;
  status?: ReactNode;
  onReferenceRectChange: (rect: Rect) => void;
  onOutputRectChange: (rect: Rect) => void;
  onMaskChange: (mask: Uint8Array) => void;
  /** 자유 인페인팅: 참고·결과 영역 없이 칠하기만 한다. */
  maskOnly?: boolean;
  /** 켜져 있을 때만 */
  divider?: DividerLine;
  /** 자동 구성에서만. 바뀐 상자를 받아 다시 칠한다. */
  transform?: {
    box: ImageBox;
    image: CanvasImageSource;
    onBegin: () => void;
    onChange: (box: ImageBox) => void;
    onCancel: () => void;
  };
};

type DragState = {
  kind: 'rect' | 'brush' | 'transform';
  startX: number;
  startY: number;
  originalRect?: Rect;
  handle?: RectHandle;
  startBox?: ImageBox;
  transformHandle?: TransformHandle;
};

const HISTORY_LIMIT = 40;
/** 화면 px */
const TRANSFORM_HANDLE_SIZE = 9;
const TRANSFORM_HIT = 8;

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

type OverrideBase = Pick<Props, 'width' | 'height' | 'backgroundMask' | 'referenceRect' | 'expansionPx'>;

/** 붓으로 고친 픽셀만 남겨 나머지는 여백 값 변경을 따른다. 예전 두 배 확장 마스크도 알아본다. */
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
  /** 붓질 중에는 같은 버퍼를 고치고 프레임마다 한 번 그린다. */
  const strokeRef = useRef<Int8Array | null>(null);
  const frameRef = useRef(0);
  const [tool, setTool] = useState<Tool>(props.maskOnly ? 'generate' : 'reference');
  /** 칸 좌표. 다음 이벤트까지의 사이를 채운다. */
  const lastStampRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  /** 손 도구 */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [opacity, setOpacity] = useState(42);
  /** 칸 수. NovelAI 웹 기본값 4칸 = 32px. */
  const [brushSize, setBrushSize] = useState(4);
  const [brushShape, setBrushShape] = useState<BrushShape>('circle');
  const [overrides, setOverrides] = useState<Int8Array>(() =>
    createOverrides(props, props.initialMask),
  );
  const [undoStack, setUndoStack] = useState<Int8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Int8Array[]>([]);
  const previousToolRef = useRef<Tool>('reference');
  const transformHistory = useRef<ImageBox[]>([]);
  const overlayInputsRef = useRef<unknown[]>([]);
  const { onMaskChange } = props;

  // 수동 보정은 처음 불러올 때의 영역·확장 값으로만 가려낸다.
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
        // 해상도가 바뀐 직후 한 번은 이전 크기의 마스크가 남아 있을 수 있다.
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

  const dividerWidth = props.divider?.widthPx;
  const dividerColor = props.divider?.color;
  const dividerMask = useMemo(
    () =>
      dividerWidth === undefined
        ? undefined
        : dividerPixels(mask, props.width, props.height, dividerWidth),
    [mask, props.width, props.height, dividerWidth],
  );

  const view = useCanvasViewport(props.width, props.height);
  const scale = view.scale;
  const transforming = tool === 'transform' && Boolean(props.transform);
  const ghostBox = transforming ? props.transform?.box : undefined;
  const ghostImage = props.transform?.image;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, props.width, props.height);
    context.drawImage(props.image, 0, 0, props.width, props.height);
    if (props.paint) context.drawImage(props.paint, 0, 0, props.width, props.height);
    if (ghostBox && ghostImage) {
      // 참고 영역 밖으로 나가 잘린 부분도 보이게 한다.
      context.save();
      context.globalAlpha = 0.4;
      context.translate(ghostBox.cx, ghostBox.cy);
      context.rotate((ghostBox.rotation * Math.PI) / 180);
      if (ghostBox.flipX) context.scale(-1, 1);
      context.drawImage(
        ghostImage,
        -ghostBox.width / 2,
        -ghostBox.height / 2,
        ghostBox.width,
        ghostBox.height,
      );
      context.restore();
    }
    // 이미지 변형 중에는 프레임마다 다시 그리므로 마스크 층은 바뀔 때만 만든다.
    const overlayInputs = [mask, dividerMask, dividerColor, opacity];
    let overlayCanvas = overlayRef.current;
    if (!overlayCanvas || overlayCanvas.width !== props.width || overlayCanvas.height !== props.height) {
      overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = props.width;
      overlayCanvas.height = props.height;
      overlayRef.current = overlayCanvas;
      overlayInputsRef.current = [];
    }
    if (overlayInputs.some((value, index) => value !== overlayInputsRef.current[index])) {
      overlayInputsRef.current = overlayInputs;
      // putImageData는 합성하지 않고 덮어쓴다.
      const overlayContext = overlayCanvas.getContext('2d')!;
      const overlay = overlayContext.createImageData(props.width, props.height);
      const alpha = Math.round((opacity / 100) * 255);
      // 리틀 엔디언이라 RGBA가 ABGR 순서다.
      const pixels = new Uint32Array(overlay.data.buffer);
      const color = ((alpha << 24) | (190 << 16) | (208 << 8) | 23) >>> 0;
      if (dividerMask && dividerColor) {
        const [red, green, blue] = hexToRgb(dividerColor);
        const line = ((255 << 24) | (blue << 16) | (green << 8) | red) >>> 0;
        for (let pixel = 0; pixel < mask.length; pixel += 1) {
          if (mask[pixel]) pixels[pixel] = color;
          else if (dividerMask[pixel]) pixels[pixel] = line;
        }
      } else {
        for (let pixel = 0; pixel < mask.length; pixel += 1) {
          if (mask[pixel]) pixels[pixel] = color;
        }
      }
      overlayContext.putImageData(overlay, 0, 0);
    }
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
    dividerMask,
    dividerColor,
    props.maskOnly,
    opacity,
    props.image,
    props.paint,
    props.width,
    props.height,
    props.referenceRect,
    props.outputRect,
    tool,
    ghostBox,
    ghostImage,
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
        // 같은 버퍼를 새 뷰로 감싸 상태 변경으로 알린다(복사 없음).
        if (strokeRef.current) setOverrides(new Int8Array(strokeRef.current.buffer));
      });
    }
  };

  const beginHistory = () => {
    setUndoStack((items) => [...items.slice(-(HISTORY_LIMIT - 1)), Int8Array.from(overrides)]);
    setRedoStack([]);
  };

  /** 다시 그리지 않도록 스타일을 바로 고친다. */
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

  const canvasPoint = (event: { clientX: number; clientY: number }) => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * props.width,
      y: ((event.clientY - bounds.top) / bounds.height) * props.height,
    };
  };

  const beginTransform = () => {
    if (!props.transform || tool === 'transform') return;
    previousToolRef.current = tool;
    transformHistory.current = [];
    props.transform.onBegin();
    moveCursor(null);
    setTool('transform');
  };

  const commitTransform = () => {
    dragRef.current = null;
    setTool(previousToolRef.current);
  };

  const cancelTransform = () => {
    props.transform?.onCancel();
    commitTransform();
  };

  const recordTransform = (box: ImageBox) => {
    transformHistory.current = [...transformHistory.current.slice(-(HISTORY_LIMIT - 1)), box];
  };

  const undoTransform = () => {
    const previous = transformHistory.current.pop();
    if (previous) props.transform?.onChange(previous);
  };

  useEffect(() => {
    if (tool === 'transform' && !props.transform) setTool('reference');
    if (tool !== 'transform' && view.viewport.current) view.viewport.current.style.cursor = '';
  }, [tool, props.transform, view.viewport]);

  // 손잡이가 캔버스 밖에 있어도 잡을 수 있게 화면 전체에서 받는다.
  const onTransformPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!transforming || !props.transform) return;
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      view.pan.begin(event);
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    const box = props.transform.box;
    recordTransform(box);
    dragRef.current = {
      kind: 'transform',
      startX: point.x,
      startY: point.y,
      startBox: box,
      transformHandle: handleAt(box, point.x, point.y, TRANSFORM_HIT / scale),
    };
  };

  const onTransformPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!transforming || !props.transform) return;
    if (view.pan.move(event)) return;
    const point = canvasPoint(event);
    const drag = dragRef.current;
    if (drag?.kind === 'transform' && drag.startBox && drag.transformHandle) {
      props.transform.onChange(
        dragBox(drag.startBox, drag.transformHandle, { x: drag.startX, y: drag.startY }, point, {
          shift: event.shiftKey,
          alt: event.altKey,
        }),
      );
      return;
    }
    const box = props.transform.box;
    event.currentTarget.style.cursor = spaceHeld
      ? ''
      : transformCursor(box, handleAt(box, point.x, point.y, TRANSFORM_HIT / scale));
  };

  const onTransformPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!transforming) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (view.pan.end()) return;
    dragRef.current = null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (transforming) return;
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
    if (transforming) return;
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
    // Chromium이 이미 프레임에 맞춰 보낸다. rAF로 더 미루면 한 프레임 늦게 따라온다.
    const next = clampRect(candidate, props.width, props.height, 16);
    if (tool === 'reference') props.onReferenceRectChange(next);
    else props.onOutputRectChange(next);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (transforming) return;
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
      // 그리기 탭과 같은 포토샵 계열 키
      if (!(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) {
        const key = event.key.toLowerCase();
        if (key === 'b') setTool('generate');
        else if (key === 'e') setTool('keep');
        else if (key === 'x' && brushing) setTool(tool === 'generate' ? 'keep' : 'generate');
        else if (event.code === 'BracketLeft') setBrushSize((value) => Math.max(1, value - 1));
        else if (event.code === 'BracketRight') setBrushSize((value) => Math.min(32, value + 1));
        else return;
        event.preventDefault();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 't' && !event.shiftKey && props.transform) {
        event.preventDefault();
        if (transforming) commitTransform();
        else beginTransform();
      } else if (key === 'z' && !event.shiftKey) {
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

  // 대화상자의 Esc(닫기)와 마스크 Ctrl+Z보다 먼저 받는다.
  useEffect(() => {
    if (!transforming) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      const box = props.transform?.box;
      const step = event.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (event.key === 'Enter') commitTransform();
      else if (event.key === 'Escape') cancelTransform();
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') undoTransform();
      else if (nudge[event.key] && box) {
        const [dx, dy] = nudge[event.key];
        if (!event.repeat) recordTransform(box);
        props.transform?.onChange({ ...box, cx: box.cx + dx, cy: box.cy + dy });
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const invert = () => {
    beginHistory();
    setOverrides(Int8Array.from(invertMask(mask), (value) => (value ? 1 : 0)));
  };

  // 모두 보호로 고정해야 자동 계산이 다시 칠하지 않는다.
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
            {props.transform && (
              <button
                className={`with-icon ${transforming ? 'active' : ''}`}
                aria-pressed={transforming}
                title="Ctrl+T · 안쪽: 이동 · 모서리: 크기(Shift: 비율 무시, Alt: 가운데 기준) · 변: 늘리기 · 바깥: 회전(Shift: 15°) · 방향키: 1px(Shift: 10px)"
                onClick={transforming ? commitTransform : beginTransform}
              >
                <Icon name="transform" size={14} /> 이미지 변형
              </button>
            )}
            <span className="zone-divider" />
          </>
        )}
        <div className="segmented" role="group" aria-label="붓">
          <button
            className={tool === 'generate' ? 'active teal' : ''}
            aria-pressed={tool === 'generate'}
            title="생성 영역(청록색)을 칠합니다. NovelAI가 이곳을 새로 그립니다. (B, X: 칠하기·지우기 바꾸기)"
            onClick={() => setTool('generate')}
          >
            <i className="teal-dot" /> 칠하기
          </button>
          <button
            className={tool === 'keep' ? 'active' : ''}
            aria-pressed={tool === 'keep'}
            title="생성 영역을 지웁니다. 지운 곳은 그대로 남습니다. (E)"
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
          <label className="range-field" title="NovelAI 웹처럼 8px 칸 단위로 칠합니다. [ / ]로 줄이고 키웁니다.">
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
        className={[
          'canvas-viewport',
          view.panning ? 'panning' : '',
          spaceHeld ? 'hand' : '',
          transforming ? 'transforming' : '',
        ].join(' ')}
        onMouseDown={(event) => {
          // 가운데 버튼 자동 스크롤 대신 끌어서 옮기기
          if (event.button === 1) event.preventDefault();
        }}
        onPointerDown={onTransformPointerDown}
        onPointerMove={onTransformPointerMove}
        onPointerUp={onTransformPointerUp}
        onPointerCancel={onTransformPointerUp}
        onDoubleClick={(event) => {
          if (!transforming || !props.transform) return;
          const point = canvasPoint(event);
          if (handleAt(props.transform.box, point.x, point.y, TRANSFORM_HIT / scale) === 'move')
            commitTransform();
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
          {transforming && props.transform && (
            <TransformFrame
              box={props.transform.box}
              width={props.width}
              height={props.height}
              handleSize={TRANSFORM_HANDLE_SIZE / scale}
            />
          )}
        </div>
        {transforming && (
          <div className="transform-actions" onPointerDown={(event) => event.stopPropagation()}>
            <button className="accent" title="Enter · 상자 안 더블클릭" onClick={commitTransform}>
              확정
            </button>
            <button title="Esc · 변형을 시작하기 전으로 되돌립니다" onClick={cancelTransform}>
              취소
            </button>
          </div>
        )}
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

function TransformFrame(props: {
  box: ImageBox;
  width: number;
  height: number;
  handleSize: number;
}) {
  const { box, handleSize } = props;
  const outline = (['nw', 'ne', 'se', 'sw'] as const)
    .map((handle) => handlePoint(box, handle))
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  return (
    <svg
      className="transform-frame"
      viewBox={`0 0 ${props.width} ${props.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon className="shadow" points={outline} />
      <polygon points={outline} />
      {RESIZE_HANDLES.map((handle) => {
        const point = handlePoint(box, handle);
        return (
          <rect
            key={handle}
            x={point.x - handleSize / 2}
            y={point.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            transform={`rotate(${box.rotation} ${point.x} ${point.y})`}
          />
        );
      })}
      <circle cx={box.cx} cy={box.cy} r={handleSize / 3} />
    </svg>
  );
}
