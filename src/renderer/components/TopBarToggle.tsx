import { toggleTopBar } from '../layout';
import { Icon } from './Icon';

/** 설정 줄 끝에 둔다. 접으면 같은 칩들이 화면 머리줄에 작게 들어간다. */
export function TopBarToggle({ collapsed }: { collapsed: boolean }) {
  const label = collapsed ? '설정 줄 펼치기' : '설정 줄 접기';
  return (
    <button
      className="icon-button top-bar-toggle"
      title={`${label} (F9)`}
      aria-label={label}
      onClick={toggleTopBar}
    >
      <Icon name="chevron" size={14} className={collapsed ? 'rotate-down' : 'rotate-up'} />
    </button>
  );
}
