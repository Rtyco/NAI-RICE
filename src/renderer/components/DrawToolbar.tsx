import { CanvasToolbar, CanvasZoom, UndoRedoButtons, type ZoomView } from './CanvasControls';
import { MAX_SIZE, PALETTE, TIPS, TOOLS, type DrawSettings } from './drawSettings';
import { Icon } from './Icon';

export function DrawToolbar(props: {
  settings: DrawSettings;
  view: ZoomView;
  history: Parameters<typeof UndoRedoButtons>[0];
  onClear: () => void;
  /** 바탕에 합치는 화면에서만 */
  apply?: { pending: boolean; run: () => void };
}) {
  const { settings } = props;
  const { tool, tip, color } = settings;
  const brushing = tool === 'pen' || tool === 'eraser';
  return (
    <CanvasToolbar
      label="그리기 도구"
      view={props.view}
      history={props.history}
      more={[
        {
          fold: 1,
          items: [
            { heading: '펜 끝' },
            ...TIPS.map((item) => ({
              label: item.label,
              hint: tip === item.id ? '사용 중' : undefined,
              onSelect: () => settings.setTip(item.id),
            })),
          ],
        },
        { fold: 1, items: [{ label: '그린 것 지우기', hint: 'Delete', onSelect: props.onClear }] },
        {
          fold: 2,
          items: [
            { heading: '팔레트' },
            {
              swatches: PALETTE.map((swatch) => ({
                id: swatch,
                label: swatch,
                color: swatch,
                active: swatch === color,
              })),
              onPick: settings.setColor,
            },
          ],
        },
      ]}
    >
      <div className="segmented" role="group" aria-label="도구">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            className={tool === item.id ? 'active blue' : ''}
            aria-pressed={tool === item.id}
            title={`${item.label} (${item.key.toUpperCase()})`}
            onClick={() => settings.setTool(item.id)}
          >
            <Icon name={item.icon} size={14} /> <span className="tool-label">{item.label}</span>
          </button>
        ))}
      </div>
      <span className="zone-divider" />
      <div
        className="draw-colors"
        title="전경색·배경색 (X: 바꾸기 · D: 검정·흰색 · Alt+클릭: 스포이트)"
      >
        <input
          type="color"
          className="back"
          value={settings.backColor}
          aria-label="배경색"
          onChange={(event) => settings.setBackColor(event.target.value)}
        />
        <input
          type="color"
          value={color}
          aria-label="전경색"
          onChange={(event) => settings.setColor(event.target.value)}
        />
      </div>
      <div className="draw-palette" role="group" aria-label="팔레트" data-fold="2">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            className={swatch === color ? 'active' : ''}
            style={{ background: swatch }}
            title={swatch}
            aria-label={`색 ${swatch}`}
            onClick={() => settings.setColor(swatch)}
          />
        ))}
      </div>
      <span className="zone-divider" />
      <div className={`brush-settings ${brushing ? '' : 'idle'}`}>
        <div className="segmented" role="group" aria-label="펜 끝" data-fold="1">
          {TIPS.map((item) => (
            <button
              key={item.id}
              className={tip === item.id ? 'active' : ''}
              aria-pressed={tip === item.id}
              onClick={() => settings.setTip(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="range-field" title="크기 ([ / ]) · 끝 모양 (Shift+[ / ])">
          <span className="range-name">크기</span>
          <input
            type="range"
            min="1"
            max={MAX_SIZE}
            value={settings.size}
            onChange={(event) => settings.setSize(Number(event.target.value))}
          />
          <b>{settings.size}px</b>
        </label>
      </div>
      <label className="range-field" title="불투명도 (1~0)">
        <span className="range-name">불투명도</span>
        <input
          type="range"
          min="1"
          max="100"
          value={settings.opacity}
          onChange={(event) => settings.setOpacity(Number(event.target.value))}
        />
        <b>{settings.opacity}%</b>
      </label>
      {tool === 'fill' && (
        <label className="range-field" title="허용 오차">
          <span className="range-name">허용 오차</span>
          <input
            type="range"
            min="0"
            max="128"
            value={settings.tolerance}
            onChange={(event) => settings.setTolerance(Number(event.target.value))}
          />
          <b>{settings.tolerance}</b>
        </label>
      )}
      <span className="zone-divider" />
      <UndoRedoButtons {...props.history} />
      <button data-fold="1" onClick={props.onClear} title="모두 지우기 (Delete)">
        그린 것 지우기
      </button>
      <div className="toolbar-zone view-zone">
        <CanvasZoom view={props.view} />
        {props.apply && (
          <button
            className="accent"
            title="이미지에 합치기"
            disabled={!props.apply.pending}
            onClick={props.apply.run}
          >
            <span className="long-label">이미지에 </span>합치기
          </button>
        )}
      </div>
    </CanvasToolbar>
  );
}
