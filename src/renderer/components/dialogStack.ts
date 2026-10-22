import type { ReactNode } from 'react';
import { create } from 'zustand';

export type DialogRequest =
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

export const useDialogs = create<{ stack: DialogRequest[] }>(() => ({ stack: [] }));

function push(request: DialogRequest) {
  useDialogs.setState((state) => ({ stack: [...state.stack, request] }));
}

export function popDialog(request: DialogRequest) {
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

export function openDialog(render: (close: () => void) => ReactNode): Promise<void> {
  return new Promise((resolve) => push({ kind: 'custom', render, resolve }));
}
