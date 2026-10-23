import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { popDialog, useDialogs, type DialogRequest } from './dialogStack';

/** 버튼·여러 줄 글·목록 위의 Enter는 그 요소 몫이다. */
function submitOnEnter(event: KeyboardEvent, modal: HTMLElement | null) {
  if (!modal || event.defaultPrevented || event.isComposing || event.repeat) return;
  if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
  if (![...document.querySelectorAll('.modal-backdrop')].at(-1)?.contains(modal)) return;
  const target = event.target as HTMLElement;
  if (
    modal.contains(target) &&
    target.closest('button, a, textarea, select, [contenteditable="true"]')
  )
    return;
  event.preventDefault();
  const primary = [
    ...modal.querySelectorAll<HTMLButtonElement>(':scope > footer button.accent'),
  ].at(-1);
  // 숫자 칸은 Enter의 blur로 값을 반영하므로 그 렌더가 끝난 뒤에 누른다.
  setTimeout(() => {
    if (primary?.isConnected && !primary.disabled) primary.click();
  });
}

export function Modal({
  title,
  children,
  footer,
  onClose,
  wide,
  large,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** 거의 창 크기 */
  large?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  // 연 버튼에 포커스가 남으면 Enter가 그 버튼을 다시 눌러 같은 창이 또 열린다.
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && !large) submitOnEnter(event, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, large]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? 'wide' : ''} ${large ? 'large' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <b>{title}</b>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

function PromptBody({
  request,
  close,
}: {
  request: Extract<DialogRequest, { kind: 'prompt' }>;
  close: (value: string | null) => void;
}) {
  const [value, setValue] = useState(request.initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <Modal
      title={request.title}
      onClose={() => close(null)}
      footer={
        <>
          <button onClick={() => close(null)}>취소</button>
          <button className="accent" disabled={!value.trim()} onClick={() => close(value.trim())}>
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <label className="stack-field">
        {request.label}
        <input ref={ref} value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
    </Modal>
  );
}

export function DialogHost() {
  const stack = useDialogs((state) => state.stack);
  return (
    <>
      {stack.map((request, index) => {
        if (request.kind === 'confirm') {
          const close = (value: boolean) => {
            popDialog(request);
            request.resolve(value);
          };
          return (
            <Modal
              key={index}
              title={request.title}
              onClose={() => close(false)}
              footer={
                <>
                  <button onClick={() => close(false)}>취소</button>
                  <button
                    className={request.danger ? 'danger-solid' : 'accent'}
                    onClick={() => close(true)}
                    autoFocus
                  >
                    {request.confirmLabel}
                  </button>
                </>
              }
            >
              <div className="dialog-message">{request.message}</div>
            </Modal>
          );
        }
        if (request.kind === 'prompt') {
          return (
            <PromptBody
              key={index}
              request={request}
              close={(value) => {
                popDialog(request);
                request.resolve(value);
              }}
            />
          );
        }
        return (
          <div key={index}>
            {request.render(() => {
              popDialog(request);
              request.resolve();
            })}
          </div>
        );
      })}
    </>
  );
}
