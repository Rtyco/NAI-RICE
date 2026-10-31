import { useEffect, useRef, type RefObject } from 'react';
import { isTypingTarget } from '../useShortcut';

type ZoomActions = {
  /** 화면에 맞춤 ↔ 원본 크기 */
  toggle: () => void;
  actualSize: () => void;
};

type ZoomTarget = { viewport: RefObject<HTMLElement | null>; actions: RefObject<ZoomActions> };

const targets: ZoomTarget[] = [];

/** 마우스가 올라간 화면, 없으면 마지막에 연 화면. 대화상자가 열려 있으면 그 안의 화면만. */
function activeTarget(): ZoomTarget | undefined {
  const top = [...document.querySelectorAll('.modal-backdrop, .lightbox')].at(-1);
  const shown = targets.filter((target) => {
    const element = target.viewport.current;
    return (
      element?.isConnected && element.getClientRects().length && (!top || top.contains(element))
    );
  });
  return shown.find((target) => target.viewport.current!.matches(':hover')) ?? shown.at(-1);
}

function onKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.repeat) return;
  if (isTypingTarget(event.target)) return;
  const plain = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  const ctrl = event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  // Lightroom의 Z, 포토샵의 Ctrl+1. 한글 입력 상태에서도 받도록 code를 본다.
  const toggle = plain && event.code === 'KeyZ';
  const actualSize = ctrl && (event.code === 'Digit1' || event.code === 'Numpad1');
  if (!toggle && !actualSize) return;
  const target = activeTarget();
  if (!target) return;
  event.preventDefault();
  if (toggle) target.actions.current.toggle();
  else target.actions.current.actualSize();
}

export function useZoomKeys(viewport: RefObject<HTMLElement | null>, actions: ZoomActions): void {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const target = { viewport, actions: latest };
    targets.push(target);
    if (targets.length === 1) window.addEventListener('keydown', onKey);
    return () => {
      targets.splice(targets.indexOf(target), 1);
      if (!targets.length) window.removeEventListener('keydown', onKey);
    };
  }, [viewport]);
}
