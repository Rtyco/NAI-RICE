import { useRef, type MouseEvent, type ReactNode } from 'react';
import type { useCanvasViewport } from './canvasViewport';
import { showContextMenu, type MenuItem } from './contextMenuStore';
import { Icon } from './Icon';
import { fitLevel, useCanvasToolbarFit } from './useHeaderFit';
import { ZOOM_STEP } from './zoom';

export type ZoomView = Pick<ReturnType<typeof useCanvasViewport>, 'scale' | 'zoomTo' | 'fit'>;

/** `data-fold`이 같은 막대 항목을 ⋯ 메뉴에서 대신한다. */
export type ToolbarFold = { fold: 1 | 2 | 3; items: MenuItem[] };

/** 글자를 빼고 줄인 뒤의 단계부터 `fold` 순서로 접는다(canvas.css). */
const FOLD_AFTER = 3;

/** 확대 1:1과 실행 취소는 막대마다 같아 여기서 메뉴에 더한다. */
export function CanvasToolbar(props: {
  label: string;
  view: ZoomView;
  history: UndoRedo;
  more: ToolbarFold[];
  children: ReactNode;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useCanvasToolbarFit(bar);
  const showFolded = (event: MouseEvent) => {
    const level = fitLevel(bar.current);
    showContextMenu(
      event,
      [...props.more, zoomFold(props.view), undoFold(props.history)]
        .filter((group) => group.fold <= level - FOLD_AFTER)
        .flatMap((group, index): MenuItem[] => (index ? ['divider', ...group.items] : group.items)),
    );
  };
  return (
    <div ref={bar} className="canvas-toolbar" role="toolbar" aria-label={props.label}>
      {props.children}
      <button
        className="icon-button canvas-more"
        title="더 보기"
        aria-label="더 보기"
        onClick={showFolded}
      >
        ⋯
      </button>
    </div>
  );
}

function zoomFold(view: ZoomView): ToolbarFold {
  return { fold: 1, items: [{ label: '원본 크기 (1:1)', onSelect: () => view.zoomTo(1) }] };
}

function undoFold(history: UndoRedo): ToolbarFold {
  return {
    fold: 3,
    items: [
      { label: '실행 취소', hint: 'Ctrl+Z', onSelect: history.onUndo, disabled: !history.canUndo },
      { label: '다시 실행', hint: 'Ctrl+Y', onSelect: history.onRedo, disabled: !history.canRedo },
    ],
  };
}

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
      <button
        className="zoom-level"
        data-fold="1"
        title="원본 크기 (1:1)"
        onClick={() => view.zoomTo(1)}
      >
        1:1
      </button>
    </span>
  );
}

type UndoRedo = {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function UndoRedoButtons(props: UndoRedo) {
  return (
    <>
      <button
        className="icon-button"
        data-fold="3"
        onClick={props.onUndo}
        disabled={!props.canUndo}
        aria-label="실행 취소"
        title="실행 취소 (Ctrl+Z)"
      >
        <Icon name="undo" size={15} />
      </button>
      <button
        className="icon-button redo"
        data-fold="3"
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
