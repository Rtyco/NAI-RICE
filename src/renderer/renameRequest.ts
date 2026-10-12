import { useEffect, useRef } from 'react';

const RENAME_EVENT = 'rice:rename';

/** F2: 지금 고른 작업이나 라이브러리 항목의 이름 바꾸기를 연다. */
export function requestRename(): void {
  window.dispatchEvent(new Event(RENAME_EVENT));
}

/** 이 줄이 고른 줄(`active`)이면 F2를 받아 이름 바꾸기를 연다. */
export function useRenameRequest(active: boolean, start: () => void): void {
  const latest = useRef(start);
  latest.current = start;
  useEffect(() => {
    if (!active) return;
    const onRename = () => latest.current();
    window.addEventListener(RENAME_EVENT, onRename);
    return () => window.removeEventListener(RENAME_EVENT, onRename);
  }, [active]);
}
