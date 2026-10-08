import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { create } from 'zustand';

type DialogRequest =
  | {
      kind: 'confirm';
      title: string;
      message: ReactNode;
      confirmLabel: string;
      danger?: boolean;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'prompt';
      title: string;
      label: string;
      initial: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: 'custom';
      render: (close: () => void) => ReactNode;
      resolve: () => void;
    };

const useDialogs = create<{ stack: DialogRequest[] }>(() => ({ stack: [] }));

function push(request: DialogRequest) {
  useDialogs.setState((state) => ({ stack: [...state.stack, request] }));
}

function pop(request: DialogRequest) {
  useDialogs.setState((state) => ({ stack: state.stack.filter((item) => item !== request) }));
}

export function confirmDialog(options: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) =>
    push({ kind: 'confirm', confirmLabel: '확인', ...options, resolve }),
  );
}

export function promptDialog(options: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) =>
    push({ kind: 'prompt', initial: '', confirmLabel: '확인', ...options, resolve }),
  );
}

/** 임의의 내용을 가진 모달. render에 전달되는 close를 호출하면 닫힌다. */
export function openDialog(render: (close: () => void) => ReactNode): Promise<void> {
  return new Promise((resolve) => push({ kind: 'custom', render, resolve }));
}

export function Modal({
  title,
  children,
  footer,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
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
        <input
          ref={ref}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) close(value.trim());
          }}
        />
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
            pop(request);
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
                pop(request);
                request.resolve(value);
              }}
            />
          );
        }
        return (
          <div key={index}>
            {request.render(() => {
              pop(request);
              request.resolve();
            })}
          </div>
        );
      })}
    </>
  );
}
