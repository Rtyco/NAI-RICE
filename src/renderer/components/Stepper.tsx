import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function Stepper(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const { value, min, max, step } = props;
  const decimals = (String(step).split('.')[1] ?? '').length;
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  // 0.1 + 0.2 같은 부동소수 오차를 step의 자릿수로 자른다.
  const settle = (next: number) => Number(Math.min(max, Math.max(min, next)).toFixed(decimals));
  const change = (next: number) => {
    const settled = settle(next);
    setDraft(String(settled));
    if (settled !== value) props.onChange(settled);
  };
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) setDraft(String(value));
    else change(parsed);
  };

  return (
    <span className="stepper">
      <button
        type="button"
        className="icon-button"
        aria-label={`${props.label} 줄이기`}
        disabled={value <= min}
        onClick={() => change(value - step)}
      >
        <Icon name="minus" size={14} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={props.label}
        value={draft}
        style={{ width: `${Math.max(String(max).length, decimals + 2, draft.length) + 1}ch` }}
        onFocus={(event) => {
          focused.current = true;
          event.target.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focused.current = false;
          if (cancelled.current) setDraft(String(value));
          else commit();
          cancelled.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            cancelled.current = true;
            event.currentTarget.blur();
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            change(value + (event.key === 'ArrowUp' ? step : -step));
          }
        }}
      />
      <button
        type="button"
        className="icon-button"
        aria-label={`${props.label} 늘리기`}
        disabled={value >= max}
        onClick={() => change(value + step)}
      >
        <Icon name="plus" size={14} />
      </button>
    </span>
  );
}
