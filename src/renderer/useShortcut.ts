import { useEffect, useRef } from 'react';

const TYPING = 'input, textarea, select, [contenteditable="true"]';

/** 창(window)에 보낸 키 이벤트는 target이 요소가 아니다. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING) !== null;
}

/** 글자 키는 대소문자를 가리지 않는다. */
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

/** 입력 칸(`inFields`면 받는다)과 대화상자에서는 무시한다. `action`은 늘 최신 값을 부른다. */
export function useShortcut(
  combo: string,
  action: () => void,
  enabled = true,
  { inFields = false } = {},
): void {
  const latest = useRef(action);
  latest.current = action;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !matchesKey(event, combo)) return;
      if (!inFields && isTypingTarget(event.target)) return;
      if (document.querySelector('.modal-backdrop')) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled, inFields]);
}
