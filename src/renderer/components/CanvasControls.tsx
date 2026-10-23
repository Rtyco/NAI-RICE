import type { useCanvasViewport } from './canvasViewport';
import { Icon } from './Icon';
import { ZOOM_STEP } from './zoom';

export type ZoomView = Pick<ReturnType<typeof useCanvasViewport>, 'scale' | 'zoomTo' | 'fit'>;

export function CanvasZoom({ view }: { view: ZoomView }) {
  return (
    <span className="canvas-zoom">
      <button
        className="icon-button"
        aria-label="축소"
        title="축소 (휠)"
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
        title="확대 (휠)"
        onClick={() => view.zoomTo(view.scale * ZOOM_STEP)}
      >
        <Icon name="zoom-in" size={15} />
      </button>
      <button className="zoom-level" title="원본 크기 (1:1)" onClick={() => view.zoomTo(1)}>
        1:1
      </button>
    </span>
  );
}

export function UndoRedoButtons(props: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <>
      <button
        className="icon-button"
        onClick={props.onUndo}
        disabled={!props.canUndo}
        aria-label="실행 취소"
        title="실행 취소 (Ctrl+Z)"
      >
        <Icon name="undo" size={15} />
      </button>
      <button
        className="icon-button redo"
        onClick={props.onRedo}
        disabled={!props.canRedo}
        aria-label="다시 실행"
        title="다시 실행 (Ctrl+Y)"
      >
        <Icon name="undo" size={15} />
      </button>
    </>
  );
}
