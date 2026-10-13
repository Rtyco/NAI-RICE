import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// 큐 막대 오른쪽 끝. 작업 갤러리가 생성 버튼을 여기에 띄운다.
let target: HTMLElement | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function BottomSlotTarget() {
  return (
    <div
      className="bottom-slot"
      ref={(node) => {
        target = node;
        for (const listener of listeners) listener();
      }}
    />
  );
}

export function BottomSlot({ children }: { children: ReactNode }) {
  const node = useSyncExternalStore(subscribe, () => target);
  return node ? createPortal(children, node) : null;
}
