import { withRo } from '../lib/korean';
import { Icon, type IconName } from './Icon';

export type ModeInfo = { label: string; icon: IconName };

/** 방식이 둘뿐이라 누를 때마다 바뀐다. */
export function ModeToggle(props: {
  current: ModeInfo;
  next: ModeInfo;
  /** 다른 도구를 쓰는 동안 흐리게 둔다. 누르면 그 도구를 끄고 이 방식으로 돌아온다. */
  dimmed?: boolean;
  onToggle: () => void;
}) {
  const { current, next } = props;
  const title = props.dimmed ? `${withRo(current.label)} 돌아가기` : `${withRo(next.label)} 바꾸기`;
  return (
    <button
      className={`mode-toggle ${props.dimmed ? 'dimmed' : ''}`}
      title={title}
      aria-label={`생성 방식: ${current.label}`}
      onClick={props.onToggle}
    >
      <Icon name={current.icon} size={14} />
      <span className="header-label">{current.label}</span>
      <Icon name="swap" size={13} className="mode-toggle-swap" />
    </button>
  );
}
