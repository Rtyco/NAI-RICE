import { sidePanelShownOf, toggleSidePanel, useStore } from '../store';
import { Icon } from './Icon';

/** 씬 상세·자유 생성·인페인트 편집의 오른쪽 입력 패널 */
export function SidePanelToggle() {
  const shown = useStore(sidePanelShownOf);
  const label = shown ? '입력 패널 숨기기' : '입력 패널 보이기';
  return (
    <button
      className={`icon-button ${shown ? 'active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={shown}
      onClick={toggleSidePanel}
    >
      <Icon name="sliders" size={18} />
    </button>
  );
}
