import { MASK_CELL, type BrushShape } from '../../core/imaging/MaskBrush';
import { CanvasZoom, UndoRedoButtons, type ZoomView } from './CanvasControls';
import { Icon } from './Icon';

export type MaskTool = 'reference' | 'output' | 'generate' | 'keep' | 'transform';

/** 칸 수 */
export const MAX_BRUSH_CELLS = 32;

export function MaskToolbar(props: {
  tool: MaskTool;
  onTool: (tool: MaskTool) => void;
  maskOnly?: boolean;
  /** 이미지 변형을 쓸 수 있을 때만 */
  transform?: { active: boolean; toggle: () => void };
  brushShape: BrushShape;
  onBrushShape: (shape: BrushShape) => void;
  brushSize: number;
  onBrushSize: (size: number) => void;
  onInvert: () => void;
  onClear: () => void;
  canClear: boolean;
  history: Parameters<typeof UndoRedoButtons>[0];
  opacity: number;
  onOpacity: (opacity: number) => void;
  view: ZoomView;
}) {
  const { tool, onTool, brushShape, onBrushShape } = props;
  const brushing = tool === 'generate' || tool === 'keep';
  return (
    <div className="canvas-toolbar">
      {!props.maskOnly && (
        <>
          <div className="segmented" role="group" aria-label="영역 상자">
            <button
              className={tool === 'reference' ? 'active green' : ''}
              aria-pressed={tool === 'reference'}
              onClick={() => onTool('reference')}
            >
              <i className="green-dot" /> 참고 영역
            </button>
            <button
              className={tool === 'output' ? 'active blue' : ''}
              aria-pressed={tool === 'output'}
              onClick={() => onTool('output')}
            >
              <i className="blue-dot" /> 결과 영역
            </button>
          </div>
          {props.transform && (
            <button
              className={`with-icon ${props.transform.active ? 'active' : ''}`}
              aria-pressed={props.transform.active}
              title="이미지 변형 (Ctrl+T)"
              onClick={props.transform.toggle}
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
          title="칠하기 (B)"
          onClick={() => onTool('generate')}
        >
          <i className="teal-dot" /> 칠하기
        </button>
        <button
          className={tool === 'keep' ? 'active' : ''}
          aria-pressed={tool === 'keep'}
          title="지우기 (E)"
          onClick={() => onTool('keep')}
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
            onClick={() => onBrushShape('circle')}
          >
            <Icon name="circle" size={14} />
          </button>
          <button
            className={brushShape === 'square' ? 'active' : ''}
            aria-pressed={brushShape === 'square'}
            title="네모 붓"
            onClick={() => onBrushShape('square')}
          >
            <Icon name="square" size={14} />
          </button>
        </div>
        <label className="range-field" title="크기 ([ / ])">
          크기
          <input
            type="range"
            min="1"
            max={MAX_BRUSH_CELLS}
            value={props.brushSize}
            onChange={(event) => props.onBrushSize(Number(event.target.value))}
          />
          <b>{props.brushSize * MASK_CELL}px</b>
        </label>
      </div>
      <span className="zone-divider" />
      <button onClick={props.onInvert}>반전</button>
      <button onClick={props.onClear} disabled={!props.canClear}>
        모두 지우기
      </button>
      <UndoRedoButtons {...props.history} />
      <div className="toolbar-zone view-zone">
        <label className="range-field" title="생성 영역 표시 불투명도">
          불투명도
          <input
            type="range"
            min="0"
            max="80"
            value={props.opacity}
            onChange={(event) => props.onOpacity(Number(event.target.value))}
          />
          <b>{props.opacity}%</b>
        </label>
        <CanvasZoom view={props.view} />
      </div>
    </div>
  );
}
