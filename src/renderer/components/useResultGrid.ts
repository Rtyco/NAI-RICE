import { useEffect } from 'react';
import { setFreeResultGrid, setResultGrid, useStore } from '../store';
import { isTypingTarget } from '../useShortcut';

export function useResultGrid(options: {
  scope: 'detail' | 'free';
  hasRecords: boolean;
  /** 소스·그리기 화면 등 결과를 가린 상태면 false */
  visible: boolean;
  /** 그리기 캔버스의 G(채우기)와 겹칠 때 단축키를 막는다. */
  shortcutEnabled?: boolean;
  onShowResult: () => void;
}) {
  const { scope, hasRecords, visible, onShowResult } = options;
  const shortcutEnabled = options.shortcutEnabled ?? true;
  const grid = useStore((state) => (scope === 'free' ? state.freeResultGrid : state.resultGrid));
  const showGrid = grid && hasRecords && visible;
  const toggleGrid = () => {
    onShowResult();
    if (scope === 'free') setFreeResultGrid(!showGrid);
    else setResultGrid(!showGrid);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shortcutEnabled || event.defaultPrevented || isTypingTarget(event.target)) return;
      const plain = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
      const dialogOpen = Boolean(document.querySelector('.modal-backdrop'));
      // 한글 입력 상태에서도 받으려고 code로 본다.
      if (plain && event.code === 'KeyG' && hasRecords && !dialogOpen) toggleGrid();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return { showGrid, toggleGrid };
}
