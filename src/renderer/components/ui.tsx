import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PromptTextarea } from './PromptTextarea';
import { ExpandTextButton } from './TextEditorDialog';

export function PanelHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <b>{title}</b>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {actions && <div className="panel-heading-actions">{actions}</div>}
    </div>
  );
}

/**
 * 입력 중에는 자유롭게 타이핑하고, 포커스를 잃거나 Enter를 누를 때 범위를 맞춘다.
 * (입력 도중 최소값으로 튀는 문제 방지)
 */
export function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(props.value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(props.value));
  }, [props.value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(props.value));
      return;
    }
    let next = Math.max(props.min, Math.min(props.max, parsed));
    if (props.integer) next = Math.round(next);
    setDraft(String(next));
    if (next !== props.value) props.onChange(next);
  };

  return (
    <label className="number-field">
      <span>{props.label}</span>
      <span className="number-input">
        <input
          type="number"
          inputMode="decimal"
          value={draft}
          min={props.min}
          max={props.max}
          step={props.step}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = Number(event.target.value);
            // 범위 안의 완성된 값이면 바로 반영해 미리보기가 따라오게 한다.
            if (
              event.target.value.trim() !== '' &&
              Number.isFinite(parsed) &&
              parsed >= props.min &&
              parsed <= props.max &&
              (!props.integer || Number.isInteger(parsed))
            ) {
              props.onChange(parsed);
            }
          }}
        />
        {props.suffix && <em>{props.suffix}</em>}
      </span>
    </label>
  );
}

export function PromptField(props: {
  label: string;
  hint?: string;
  tone?: 'default' | 'negative';
  value: string;
  rows: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`prompt-field ${props.tone === 'negative' ? 'negative-field' : ''}`}>
      <span>
        {props.label}
        <span className="prompt-field-tools">
          {props.hint && <em>{props.hint}</em>}
          <ExpandTextButton
            title={props.label}
            value={props.value}
            placeholder={props.placeholder}
            tone={props.tone}
            onApply={props.onChange}
          />
        </span>
      </span>
      <PromptTextarea
        rows={props.rows}
        value={props.value}
        placeholder={props.placeholder}
        onChange={props.onChange}
      />
      <small>{props.value.trim() ? `${props.value.length.toLocaleString()}자` : '비어 있음'}</small>
    </label>
  );
}

/** 테두리로 감싼 묶음. 설정 화면과 라이브러리 편집기에서 관련된 칸을 한데 모은다. */
export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <b>{title}</b>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {actions && <div className="panel-heading-actions">{actions}</div>}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  /** `disabled`인 항목은 목록에 보이지만 고를 수 없다(이 모델에서 지원하지 않는 값 등). */
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="stack-field">
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as T)}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** 바깥을 클릭하면 닫히는 간단한 드롭다운 메뉴. */
export function Menu({
  label,
  items,
  align = 'right',
}: {
  label: ReactNode;
  items: Array<
    { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean } | 'divider'
  >;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className={`menu ${align}`} ref={ref}>
      <button
        className="menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
      >
        {label}
      </button>
      {open && (
        <div className="menu-popup" role="menu">
          {items.map((item, index) =>
            item === 'divider' ? (
              <hr key={`divider-${index}`} />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                className={item.danger ? 'danger' : ''}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
