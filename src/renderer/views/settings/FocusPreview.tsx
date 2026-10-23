import type { FocusPart } from '../../layout';

const TILES = 18;
const HISTORY_TILES = 5;

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => <i key={index} className="fp-line" />);

/**
 * 집중 모드를 켠 뒤의 작은 앱 화면. 숨긴 곳이 빠진 만큼 가운데 이미지 칸이 넓어진다.
 * 카드에 마우스를 올리면 숨는 곳이 파란 칸으로 되돌아와 무엇이 빠지는지 보여 준다(Windows 스냅 레이아웃처럼).
 */
export function FocusPreview({ hidden }: { hidden: FocusPart[] }) {
  const off = (part: FocusPart) => (hidden.includes(part) ? 'off' : '');
  const palette = hidden.includes('sidePanel') || hidden.includes('queueBar');
  return (
    <div
      className={`fp-window ${hidden.map((part) => `hide-${part}`).join(' ')}`}
      aria-hidden="true"
    >
      <div className="fp-titlebar">
        <i />
      </div>
      <div className={`fp-part fp-sidebar ${off('sidebar')}`}>
        <i className="fp-line accent" />
        {lines(4)}
      </div>
      <div className="fp-workspace">
        <div className={`fp-part fp-left ${off('leftPanel')}`}>
          <div className="fp-card">{lines(3)}</div>
          <div className="fp-card">{lines(2)}</div>
        </div>
        <div className="fp-main">
          <div className="fp-head">
            <i className="fp-line" />
            <i className="fp-segment" />
          </div>
          <div className={`fp-part fp-topbar ${off('topBar')}`}>
            <i className="fp-pill" />
            <i className="fp-pill" />
            <i className="fp-pill" />
          </div>
          <div className="fp-content">
            <div className="fp-gallery">
              {Array.from({ length: TILES }, (_, index) => (
                <i key={index} className="fp-tile" />
              ))}
              <div className={`fp-palette ${palette ? 'on' : ''}`}>
                <i className="fp-go" />
                <i />
              </div>
            </div>
            <div className={`fp-part fp-side ${off('sidePanel')}`}>
              <i className="fp-field" />
              {lines(2)}
              <i className="fp-go wide" />
            </div>
          </div>
        </div>
        <div className={`fp-part fp-history ${off('history')}`}>
          {Array.from({ length: HISTORY_TILES }, (_, index) => (
            <i key={index} className="fp-tile" />
          ))}
        </div>
      </div>
      <div className={`fp-part fp-queue ${off('queueBar')}`}>
        <i className="fp-line" />
      </div>
    </div>
  );
}
