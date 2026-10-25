import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  hasSidePanel,
  historyShownOf,
  libraryListStageOf,
  promptPanelStageOf,
  setPeek,
  sidebarStageOf,
  sidePanelShownOf,
  useLayout,
  type LayoutState,
} from '../layout';
import { useStore, type View } from '../store';

type Side = 'left' | 'right';

// 스쳐 지나갈 때 튀어나오지 않게 조금 머문 뒤 열고, 벗어나도 잠깐 기다렸다 닫는다.
const OPEN_DELAY = 150;
const CLOSE_DELAY = 300;

/** 겹쳐 보이는 패널, 가장자리 띠, 그 안에서 연 메뉴 위에서는 닫지 않는다. */
const KEEP_OPEN =
  '.edge-peek, .sidebar, .prompt-panel, .library-list, .history-panel, .detail-side, .canvas-settings, .menu-popup, .context-menu, .modal-backdrop';

/** 띠는 숨긴 패널이 있던 자리의 바깥 끝에 둔다. 보이는 사이드바·히스토리 위에는 두지 않는다. */
function edges(
  kind: View['kind'],
  sidePanel: boolean,
  state: LayoutState,
): { left?: string; right?: string } {
  const results = kind === 'project' || kind === 'free';
  const leftHidden =
    kind === 'library'
      ? libraryListStageOf(state) === 'hidden'
      : results && promptPanelStageOf(state) === 'hidden';
  const sidebar = sidebarStageOf(state);
  let left: string | undefined;
  if (sidebar === 'hidden') left = '0px';
  // 보이는 패널 경계의 폭 조절 손잡이(±3px)를 가리지 않게 조금 띄운다.
  else if (leftHidden)
    left = sidebar === 'icons' ? '60px' : 'calc(var(--sidebar-column, 240px) + 4px)';
  let right: string | undefined;
  if (results && !historyShownOf(state)) right = '0px';
  else if (sidePanel && !sidePanelShownOf(state))
    right = kind === 'library' ? '0px' : 'calc(var(--history-panel-column, 220px) + 4px)';
  return { left, right };
}

export function EdgePeek() {
  const enabled = useStore((state) => state.library?.settings.layout.edgePeek ?? false);
  const kind = useStore((state) => state.view.kind);
  const sidePanel = useStore(hasSidePanel);
  const { left, right } = useLayout(useShallow((state) => edges(kind, sidePanel, state)));
  const peek = useLayout((state) => state.peek);
  const pinned = useLayout((state) => Boolean(state.peekPinned));
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if ((!enabled && !pinned) || (peek === 'left' && !left) || (peek === 'right' && !right))
      setPeek();
  }, [enabled, pinned, peek, left, right]);

  useEffect(() => () => clearTimeout(openTimer.current), []);

  useEffect(() => {
    if (!peek || !pinned) return;
    const onDown = (event: PointerEvent) => {
      // 패널 버튼은 눌렀을 때 직접 닫는다.
      const target = event.target as Element | null;
      if (!target?.closest?.(`${KEEP_OPEN}, [data-panel-toggle]`)) setPeek();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPeek();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [peek, pinned]);

  useEffect(() => {
    if (!peek || pinned) return;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const onMove = (event: PointerEvent) => {
      clearTimeout(closeTimer);
      if ((event.target as Element | null)?.closest?.(KEEP_OPEN)) return;
      closeTimer = setTimeout(() => setPeek(), CLOSE_DELAY);
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      clearTimeout(closeTimer);
    };
  }, [peek, pinned]);

  if (!enabled) return null;
  const strip = (side: Side, offset: string) => (
    <div
      className={`edge-peek ${side}`}
      style={{ [side]: offset }}
      onPointerEnter={() => {
        clearTimeout(openTimer.current);
        openTimer.current = setTimeout(() => setPeek(side), OPEN_DELAY);
      }}
      onPointerLeave={() => clearTimeout(openTimer.current)}
    />
  );
  return (
    <>
      {left && strip('left', left)}
      {right && strip('right', right)}
    </>
  );
}
