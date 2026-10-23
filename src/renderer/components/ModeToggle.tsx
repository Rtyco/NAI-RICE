import { Icon, type IconName } from './Icon';

export type ModeInfo = { label: string; icon: IconName; title: string };

/** 방식이 둘뿐이라 누를 때마다 바뀐다. 지금 방식만 보이고, 무엇으로 바뀌는지는 설명에 있다. */
export function ModeToggle(props: {
  current: ModeInfo;
  next: ModeInfo;
  /** 다른 도구를 쓰는 동안 흐리게 둔다. 누르면 그 도구를 끄고 이 방식으로 돌아온다. */
  dimmed?: string;
  onToggle: () => void;
}) {
  const { current, next } = props;
  const title = props.dimmed ?? `${current.title} · 누르면 「${next.label}」로 바꿉니다`;
  return (
    <button
      className={`mode-toggle ${props.dimmed ? 'dimmed' : ''}`}
      title={title}
      aria-label={`생성 방식 ${current.label}. ${title}`}
      onClick={props.onToggle}
    >
      <Icon name={current.icon} size={14} />
      <span>{current.label}</span>
      <Icon name="swap" size={13} className="mode-toggle-swap" />
    </button>
  );
}
