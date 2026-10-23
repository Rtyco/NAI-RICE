import { toggleTopBar } from '../store';
import { Icon } from './Icon';

/** 설정 줄 끝에 둔다. */
export function TopBarCollapse() {
  return (
    <button
      className="icon-button top-bar-collapse"
      title="설정 줄 접기 (F9)"
      aria-label="설정 줄 접기"
      onClick={toggleTopBar}
    >
      <Icon name="chevron" size={14} className="rotate-up" />
    </button>
  );
}

/** 접은 설정 줄 대신 화면 머리줄에 남는다. */
export function TopBarSummary({ label }: { label: string }) {
  return (
    <button className="top-bar-summary" title="설정 줄 펼치기 (F9)" onClick={toggleTopBar}>
      <Icon name="preset" size={14} />
      <span>{label}</span>
      <Icon name="chevron" size={12} className="rotate-down" />
    </button>
  );
}
