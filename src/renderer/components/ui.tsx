import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PromptTextarea } from './PromptTextarea';
import { ExpandTextButton } from './TextEditorDialog';

/** 입력 도중 최소값으로 튀지 않도록 범위는 blur·Enter 때 맞춘다. */
export function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  integer?: boolean;
  disabled?: boolean;
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
          disabled={props.disabled}
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
            // 범위 안의 완성된 값은 미리보기가 따라오도록 바로 반영한다.
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
  title?: string;
  /** 크게 편집 창의 제목. 없으면 `label` */
  dialogTitle?: string;
  tone?: 'default' | 'negative';
  value: string;
  rows: number;
  placeholder?: string;
  counter?: boolean;
  markers?: boolean;
  repeated?: ReadonlySet<string>;
  onChange: (value: string) => void;
}) {
  // for가 없으면 앞에 있는 크게 편집 버튼이 라벨의 대상이 되어 행 전체의 hover·클릭을 받는다.
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`prompt-field ${props.tone === 'negative' ? 'negative-field' : ''}`}
      title={props.title}
    >
      <span>
        {props.label}
        <span className="prompt-field-tools">
          {props.hint && <em>{props.hint}</em>}
          <ExpandTextButton
            title={props.dialogTitle ?? props.label}
            value={props.value}
            placeholder={props.placeholder}
            tone={props.tone}
            onApply={props.onChange}
          />
        </span>
      </span>
      <PromptTextarea
        id={id}
        rows={props.rows}
        value={props.value}
        placeholder={props.placeholder}
        markers={props.markers}
        repeated={props.repeated}
        onChange={props.onChange}
      />
      {props.counter !== false && (
        <small>
          {props.value.trim() ? `${props.value.length.toLocaleString()}자` : '비어 있음'}
        </small>
      )}
    </label>
  );
}

export function ScenePlaceNote(props: { name: string; middle?: boolean }) {
  return (
    <p className="prompt-slot">
      {props.middle ? `${props.name} (중간)` : `${props.name}는 캐릭터 프롬프트 뒤`}
    </p>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  sticky,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** 긴 목록 카드: 스크롤해도 머리줄(추가 버튼)이 남는다. */
  sticky?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <header className={`card-head ${sticky ? 'sticky' : ''}`}>
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
  /** `disabled`는 보이지만 고를 수 없다. */
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="stack-field">
      {props.label}
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value as T)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 파일 이름 규칙 칸. 토큰 단추는 끝에 붙인다. */
export function TemplateField(props: {
  label: string;
  value: string;
  /** [토큰, 단추 툴팁] */
  tokens: Array<[string, string?]>;
  initial: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label className="stack-field">
        {props.label}
        <input
          className="template-input"
          value={props.value}
          spellCheck={false}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </label>
      <div className="token-picker">
        {props.tokens.map(([token, title]) => (
          <button
            key={token}
            type="button"
            title={title}
            onClick={() => props.onChange(`${props.value}${token}`)}
          >
            {token}
          </button>
        ))}
        <button type="button" className="link-button" onClick={() => props.onChange(props.initial)}>
          기본값
        </button>
      </div>
    </>
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
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
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
