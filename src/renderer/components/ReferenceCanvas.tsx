import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { DividerLine, Rect } from '../../core/domain/types';
import { dividerPixels } from '../../core/imaging/Divider';
import {
  buildGenerationMask,
  invertMask,
  maskHasGeneratePixels,
  savedOverrides,
} from '../../core/imaging/MaskBuilder';
import {
  fillCell,
  forEachStampCell,
  MASK_CELL,
  strokeStamps,
  type BrushShape,
} from '../../core/imaging/MaskBrush';
import { clampRect, rectHandleAt, resizeRect, type RectHandle } from '../../core/imaging/rects';
import {
  canvas2d,
  drawImageBox,
  hexToRgb,
  packedColor,
  paintMask,
  type CanvasImage,
} from '../lib/image';
import { readUiState, saveUiState } from '../store';
import { MAX_BRUSH_CELLS, MaskToolbar, type MaskTool } from './MaskToolbar';
import { useCanvasViewport } from './canvasViewport';
import { TransformActions, TransformFrame } from './TransformFrame';
import { useFreeTransform, type TransformTarget } from './useFreeTransform';

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
  transform?: TransformTarget;
};

type DragState = {
  kind: 'rect' | 'brush';
  startX: number;
  startY: number;
  originalRect?: Rect;
  handle?: RectHandle;
};

const HISTORY_LIMIT = 40;
/** 생성 영역 표시 색(청록) */
const MASK_RGB: [number, number, number] = [23, 208, 190];
const MASK_OPACITY_KEY = 'mask-opacity';
const readMaskOpacity = () =>
  readUiState(
    MASK_OPACITY_KEY,
    (raw) => {
      const value = Number(raw ?? NaN);
      return Number.isFinite(value) && value >= 0 && value <= 80 ? value : 42;
    },
    42,
  );
type OverrideBase = Pick<
  Props,
  'width' | 'height' | 'backgroundMask' | 'referenceRect' | 'expansionPx'
>;

function createOverrides(base: OverrideBase, initialMask?: Uint8Array): Int8Array {
  const { width, height, backgroundMask, referenceRect, expansionPx } = base;
  return savedOverrides({ width, height, backgroundMask, referenceRect, expansionPx }, initialMask);
}

export function ReferenceCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  /** 붓질 중에는 같은 버퍼를 고치고 프레임마다 한 번 그린다. */
  const strokeRef = useRef<Int8Array | null>(null);
  const frameRef = useRef(0);
  const [tool, setTool] = useState<MaskTool>(props.maskOnly ? 'generate' : 'reference');
  /** 칸 좌표. 다음 이벤트까지의 사이를 채운다. */
  const lastStampRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  /** 손 도구 */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [opacity, setOpacity] = useState(readMaskOpacity);
  /** 칸 수. NovelAI 웹 기본값 4칸 = 32px. */
  const [brushSize, setBrushSize] = useState(4);
  const [brushShape, setBrushShape] = useState<BrushShape>('circle');
  const [overrides, setOverrides] = useState<Int8Array>(() =>
    createOverrides(props, props.initialMask),
  );
  const [undoStack, setUndoStack] = useState<Int8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Int8Array[]>([]);
  const previousToolRef = useRef<MaskTool>('reference');
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
  const dividerPlacement = props.divider?.placement;
  const dividerGap = props.divider?.gapPx;
  const dividerColor = props.divider?.color;
  const dividerMask = useMemo(
    () =>
      dividerWidth === undefined || !dividerPlacement
        ? undefined
        : dividerPixels(mask, props.width, props.height, {
            widthPx: dividerWidth,
            placement: dividerPlacement,
            gapPx: dividerGap ?? 0,
          }),
    [mask, props.width, props.height, dividerWidth, dividerPlacement, dividerGap],
  );

  const view = useCanvasViewport(props.width, props.height);
  const scale = view.scale;
  const transform = useFreeTransform({
    target: props.transform,
    active: tool === 'transform',
    canvasRef,
    width: props.width,
    height: props.height,
    view,
    spaceHeld,
    onStart: () => {
      previousToolRef.current = tool;
      moveCursor(null);
      setTool('transform');
    },
    onEnd: () => {
      dragRef.current = null;
      setTool(previousToolRef.current);
    },
  });
  const { transforming } = transform;
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
      drawImageBox(context, ghostImage, ghostBox);
      context.restore();
    }
    // 이미지 변형 중에는 프레임마다 다시 그리므로 마스크 층은 바뀔 때만 만든다.
    const overlayInputs = [mask, dividerMask, dividerColor, opacity];
    let overlayCanvas = overlayRef.current;
    if (
      !overlayCanvas ||
      overlayCanvas.width !== props.width ||
      overlayCanvas.height !== props.height
    ) {
      overlayCanvas = canvas2d(props.width, props.height, false).canvas;
      overlayRef.current = overlayCanvas;
      overlayInputsRef.current = [];
    }
    if (overlayInputs.some((value, index) => value !== overlayInputsRef.current[index])) {
      overlayInputsRef.current = overlayInputs;
      // putImageData는 합성하지 않고 덮어쓴다.
      const overlayContext = overlayCanvas.getContext('2d')!;
      const overlay = overlayContext.createImageData(props.width, props.height);
      const pixels = new Uint32Array(overlay.data.buffer);
      paintMask(
        pixels,
        mask,
        packedColor(MASK_RGB, Math.round((opacity / 100) * 255)),
        dividerMask && dividerColor
          ? { pixels: dividerMask, color: packedColor(hexToRgb(dividerColor)) }
          : undefined,
      );
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

  useEffect(() => {
    if (tool === 'transform' && !props.transform) setTool('reference');
  }, [tool, props.transform]);

  /** 두 번째 손가락이 닿으면 첫 손가락으로 그리던 것을 되돌린다. */
  const cancelDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    lastStampRef.current = null;
    if (drag?.kind === 'rect' && drag.originalRect) {
      if (tool === 'reference') props.onReferenceRectChange(drag.originalRect);
      else props.onOutputRectChange(drag.originalRect);
    }
    if (!strokeRef.current) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    strokeRef.current = null;
    const before = undoStack.at(-1);
    if (before) setOverrides(Int8Array.from(before));
    setUndoStack((items) => items.slice(0, -1));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (transforming) return;
    if (view.touch.down(event)) {
      cancelDrag();
      moveCursor(null);
      return;
    }
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
    const reach = event.pointerType === 'touch' ? 24 : 12;
    const handle = rectHandleAt(rect, point.x, point.y, Math.max(8, reach * point.scale));
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
    if (view.touch.move(event) || view.pan.move(event)) return;
    moveCursor(event);
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    if (drag.kind === 'brush') {
      paint(point.x, point.y, tool === 'generate' ? 1 : 0);
      return;
    }
    if (!drag.originalRect || !drag.handle) return;
    const candidate = resizeRect(
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
    if (view.touch.up(event) || view.pan.end()) return;
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
        else if (event.code === 'BracketRight')
          setBrushSize((value) => Math.min(MAX_BRUSH_CELLS, value + 1));
        else return;
        event.preventDefault();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 't' && !event.shiftKey && props.transform) {
        event.preventDefault();
        if (transforming) transform.commit();
        else transform.begin();
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

  const invert = () => {
    beginHistory();
    setOverrides(Int8Array.from(invertMask(mask), (value) => (value ? 1 : 0)));
  };

  // 모두 보호로 고정해야 자동 계산이 다시 칠하지 않는다.
  const clearMask = () => {
    beginHistory();
    setOverrides(new Int8Array(props.width * props.height).fill(0));
  };

  const fillMask = () => {
    beginHistory();
    setOverrides(new Int8Array(props.width * props.height).fill(1));
  };

  const brushing = tool === 'generate' || tool === 'keep';

  // 라이브러리의 Delete(항목 삭제)보다 먼저 받으려고 캡처 단계에서 막는다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      const dialog = [...document.querySelectorAll('.modal-backdrop')].at(-1);
      if (dialog && !dialog.contains(canvasRef.current)) return;
      const plain = !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);
      // 영역 상자 도구일 때의 Delete는 라이브러리 항목 삭제로 남긴다.
      if (plain && brushing && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (hasGeneratePixels) clearMask();
      } else if (event.altKey && !event.ctrlKey && !event.shiftKey && event.key === 'Backspace')
        fillMask();
      else if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === 'KeyI') invert();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <section className="canvas-card">
      <MaskToolbar
        tool={tool}
        onTool={setTool}
        maskOnly={props.maskOnly}
        transform={
          props.transform && {
            active: transforming,
            toggle: transforming ? transform.commit : transform.begin,
          }
        }
        brushShape={brushShape}
        onBrushShape={setBrushShape}
        brushSize={brushSize}
        onBrushSize={setBrushSize}
        onInvert={invert}
        onClear={clearMask}
        canClear={hasGeneratePixels}
        history={{
          onUndo: undo,
          onRedo: redo,
          canUndo: undoStack.length > 0,
          canRedo: redoStack.length > 0,
        }}
        opacity={opacity}
        onOpacity={(value) => {
          setOpacity(value);
          saveUiState(MASK_OPACITY_KEY, String(value));
        }}
        view={view}
      />
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
        onPointerDown={transform.viewportHandlers.onPointerDown}
        onPointerMove={transform.viewportHandlers.onPointerMove}
        onPointerUp={transform.viewportHandlers.onPointerUp}
        onPointerCancel={transform.viewportHandlers.onPointerUp}
        onDoubleClick={transform.viewportHandlers.onDoubleClick}
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
              scale={scale}
            />
          )}
        </div>
        {transforming && (
          <TransformActions onCommit={transform.commit} onCancel={transform.cancel} />
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
