import { MASK_CELL, type BrushShape } from '../../core/imaging/MaskBrush';
import { CanvasToolbar, CanvasZoom, UndoRedoButtons, type ZoomView } from './CanvasControls';
import { Icon } from './Icon';

export type MaskTool = 'reference' | 'output' | 'generate' | 'keep' | 'transform';

const BRUSH_SHAPES: Array<{ id: BrushShape; label: string; icon: 'circle' | 'square' }> = [
  { id: 'circle', label: '둥근 붓', icon: 'circle' },
  { id: 'square', label: '네모 붓', icon: 'square' },
];

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
    <CanvasToolbar
      label="마스크 도구"
      view={props.view}
      history={props.history}
      more={[
        {
          fold: 1,
          items: [
            { label: '반전', onSelect: props.onInvert },
            { label: '모두 지우기', onSelect: props.onClear, disabled: !props.canClear },
          ],
        },
        {
          fold: 2,
          items: [
            { heading: '붓 모양' },
            ...BRUSH_SHAPES.map((shape) => ({
              label: shape.label,
              hint: brushShape === shape.id ? '사용 중' : undefined,
              onSelect: () => onBrushShape(shape.id),
            })),
          ],
        },
      ]}
    >
      {!props.maskOnly && (
        <>
          <div className="segmented" role="group" aria-label="영역 상자">
            <button
              className={tool === 'reference' ? 'active green' : ''}
              aria-pressed={tool === 'reference'}
              title="참고 영역"
              onClick={() => onTool('reference')}
            >
              <i className="green-dot" /> <span className="tool-label">참고 영역</span>
            </button>
            <button
              className={tool === 'output' ? 'active blue' : ''}
              aria-pressed={tool === 'output'}
              title="결과 영역"
              onClick={() => onTool('output')}
            >
              <i className="blue-dot" /> <span className="tool-label">결과 영역</span>
            </button>
          </div>
          {props.transform && (
            <button
              className={`with-icon ${props.transform.active ? 'active' : ''}`}
              aria-pressed={props.transform.active}
              title="이미지 변형 (Ctrl+T)"
              onClick={props.transform.toggle}
            >
              <Icon name="transform" size={14} /> <span className="tool-label">이미지 변형</span>
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
          <i className="teal-dot" /> <span className="tool-label">칠하기</span>
        </button>
        <button
          className={tool === 'keep' ? 'active' : ''}
          aria-pressed={tool === 'keep'}
          title="지우기 (E)"
          onClick={() => onTool('keep')}
        >
          <Icon name="eraser" size={14} /> <span className="tool-label">지우기</span>
        </button>
      </div>
      <div className={`brush-settings ${brushing ? '' : 'idle'}`}>
        <div className="segmented" role="group" aria-label="붓 모양" data-fold="2">
          {BRUSH_SHAPES.map((shape) => (
            <button
              key={shape.id}
              className={brushShape === shape.id ? 'active' : ''}
              aria-pressed={brushShape === shape.id}
              title={shape.label}
              onClick={() => onBrushShape(shape.id)}
            >
              <Icon name={shape.icon} size={14} />
            </button>
          ))}
        </div>
        <label className="range-field" title="크기 ([ / ])">
          <span className="range-name">크기</span>
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
      <button data-fold="1" onClick={props.onInvert}>
        반전
      </button>
      <button data-fold="1" onClick={props.onClear} disabled={!props.canClear}>
        모두 지우기
      </button>
      <UndoRedoButtons {...props.history} />
      <div className="toolbar-zone view-zone">
        <label className="range-field" title="생성 영역 표시 불투명도">
          <span className="range-name">불투명도</span>
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
    </CanvasToolbar>
  );
}
