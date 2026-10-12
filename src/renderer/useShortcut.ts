import { useEffect, useRef } from 'react';

/** `Ctrl+Shift+N`처럼 쓴 키 조합이 눌렸는지. 글자 키는 대소문자를 가리지 않는다. */
export function matchesKey(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+');
  const key = parts.pop()!;
  return (
    event.ctrlKey === parts.includes('Ctrl') &&
    event.shiftKey === parts.includes('Shift') &&
    event.altKey === parts.includes('Alt') &&
    !event.metaKey &&
    event.key.toLowerCase() === key.toLowerCase()
  );
}

/**
 * 화면 하나에서만 쓰는 단축키. 입력 칸에서 누르거나 대화상자가 열려 있으면 무시한다. `action`은 늘 최신 값을
 * 부르므로 화면 상태를 그대로 써도 된다.
 */
export function useShortcut(combo: string, action: () => void, enabled = true): void {
  const latest = useRef(action);
  latest.current = action;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !matchesKey(event, combo)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.modal-backdrop')) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
}
