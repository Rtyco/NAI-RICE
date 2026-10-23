import { useEffect } from 'react';
import {
  historyShownOf,
  libraryListStageOf,
  promptPanelStageOf,
  sidebarStageOf,
  sidePanelShownOf,
  useStore,
  type StoreState,
} from '../store';

type Side = 'left' | 'right';

// 스쳐 지나갈 때 튀어나오지 않게 조금 머문 뒤 열고, 벗어나도 잠깐 기다렸다 닫는다.
const OPEN_DELAY = 150;
const CLOSE_DELAY = 300;
let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

/** 겹쳐 보이는 패널, 가장자리 띠, 그 안에서 연 메뉴 위에서는 닫지 않는다. */
const KEEP_OPEN =
  '.edge-peek, .sidebar, .prompt-panel, .library-list, .history-panel, .detail-side, .canvas-settings, .menu-popup, .context-menu, .modal-backdrop';

const setPeek = (peek?: Side) => useStore.setState({ peek });

const leftPanelHidden = (state: StoreState) =>
  state.view.kind === 'library'
    ? libraryListStageOf(state) === 'hidden'
    : (state.view.kind === 'project' || state.view.kind === 'free') &&
      promptPanelStageOf(state) === 'hidden';

/** 결과 화면(씬 상세·자유 생성)과 인페인트 편집에만 입력 패널이 있다. */
const hasSidePanel = (state: StoreState) =>
  state.view.kind === 'free' ||
  (state.view.kind === 'project' && Boolean(state.detailEmotionId)) ||
  (state.view.kind === 'library' && state.view.section === 'references');

const historyHidden = (state: StoreState) =>
  (state.view.kind === 'project' || state.view.kind === 'free') && !historyShownOf(state);

/** 띠는 숨긴 패널이 있던 자리의 바깥 끝에 둔다. 보이는 사이드바·히스토리 위에는 두지 않는다. */
function edges(state: StoreState): { left?: string; right?: string } {
  const sidebar = sidebarStageOf(state);
  let left: string | undefined;
  if (sidebar === 'hidden') left = '0px';
  // 보이는 패널 경계의 폭 조절 손잡이(±3px)를 가리지 않게 조금 띄운다.
  else if (leftPanelHidden(state))
    left = sidebar === 'icons' ? '60px' : 'calc(var(--sidebar-width, 240px) + 4px)';
  let right: string | undefined;
  if (historyHidden(state)) right = '0px';
  else if (hasSidePanel(state) && !sidePanelShownOf(state))
    right = state.view.kind === 'library' ? '0px' : 'calc(var(--history-panel-width, 220px) + 4px)';
  return { left, right };
}

/** 설정에서 켜면, 숨긴 패널이 창 가장자리에 마우스를 대는 동안 내용 위에 겹쳐 보인다. */
export function EdgePeek() {
  const enabled = useStore((state) => state.library?.settings.layout.edgePeek ?? false);
  const left = useStore((state) => edges(state).left);
  const right = useStore((state) => edges(state).right);
  const peek = useStore((state) => state.peek);

  useEffect(() => {
    if (!enabled || (peek === 'left' && !left) || (peek === 'right' && !right)) setPeek();
  }, [enabled, peek, left, right]);

  useEffect(() => {
    if (!peek) return;
    const onMove = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.(KEEP_OPEN)) {
        clearTimeout(closeTimer);
        return;
      }
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => setPeek(), CLOSE_DELAY);
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      clearTimeout(closeTimer);
    };
  }, [peek]);

  if (!enabled) return null;
  const strip = (side: Side, offset: string) => (
    <div
      className={`edge-peek ${side}`}
      style={{ [side]: offset }}
      onPointerEnter={() => {
        clearTimeout(openTimer);
        openTimer = setTimeout(() => setPeek(side), OPEN_DELAY);
      }}
      onPointerLeave={() => clearTimeout(openTimer)}
    />
  );
  return (
    <>
      {left && strip('left', left)}
      {right && strip('right', right)}
    </>
  );
}
