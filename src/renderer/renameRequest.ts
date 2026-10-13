import { useEffect, useRef } from 'react';

const RENAME_EVENT = 'rice:rename';

export function requestRename(): void {
  window.dispatchEvent(new Event(RENAME_EVENT));
}

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
