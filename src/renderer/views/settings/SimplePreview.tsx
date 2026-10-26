const CHIPS = 6;
const TILES = 40;

/** 간소화한 뒤의 작은 앱 화면. 카드에 마우스를 올리면 줄인 글자가 돌아온다(CSS). */
export function SimplePreview({ simple }: { simple: boolean }) {
  return (
    <div className={`fp-window sp-window ${simple ? 'simple' : ''}`} aria-hidden="true">
      <div className="fp-titlebar">
        <i />
      </div>
      <div className="sp-head">
        <i className="fp-line" />
        <span className="sp-item sp-mode">
          <i className="sp-icon" />
          <i className="sp-text" />
        </span>
      </div>
      <div className="sp-chips">
        {Array.from({ length: CHIPS }, (_, index) => (
          <span key={index} className="sp-item sp-chip">
            <i className="sp-icon" />
            <i className="sp-text" />
            <i className="sp-text value" />
          </span>
        ))}
      </div>
      <div className="fp-gallery sp-gallery">
        {Array.from({ length: TILES }, (_, index) => (
          <i key={index} className="fp-tile" />
        ))}
      </div>
      <div className="sp-queue">
        <span className="sp-item">
          <i className="sp-icon" />
          <i className="sp-text" />
        </span>
        <span className="sp-item sp-push">
          <i className="sp-icon" />
          <i className="sp-text" />
        </span>
        <span className="sp-item">
          <i className="sp-icon" />
          <i className="sp-text" />
        </span>
        <i className="fp-go sp-go" />
      </div>
    </div>
  );
}
