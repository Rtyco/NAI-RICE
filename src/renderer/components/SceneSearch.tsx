import { Icon } from './Icon';

export function SceneSearch(props: {
  value: string;
  /** 찾은 수 / 전체 수. 검색어가 있을 때만 보인다. */
  found: number;
  total: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="scene-search">
      <Icon name="search" size={14} />
      <input
        type="search"
        value={props.value}
        placeholder="씬 이름 검색"
        aria-label="씬 이름 검색"
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.value.trim() && (
        <small>
          {props.found}/{props.total}
        </small>
      )}
    </label>
  );
}
