import { create } from 'zustand';
import type { FocusLevel } from '../core/domain/types';
import type { PanelId } from './panelWidths';
import { readUiState, saveUiState, useStore } from './store';

export type PanelStage = 'open' | 'icons' | 'hidden';

/** 왼쪽 패널은 프롬프트 패널과 라이브러리 목록이다. */
export type FocusPart = 'sidebar' | 'leftPanel' | 'history' | 'topBar' | 'sidePanel' | 'queueBar';

export const FOCUS_PARTS: Record<FocusLevel, FocusPart[]> = {
  panels: ['sidebar', 'leftPanel', 'history'],
  inputs: ['sidebar', 'leftPanel', 'history', 'topBar', 'sidePanel'],
  all: ['sidebar', 'leftPanel', 'history', 'topBar', 'sidePanel', 'queueBar'],
};

type StagePanel = 'sidebarStage' | 'libraryListStage' | 'promptPanelStage';
type FoldPanel = 'filmstripCollapsed' | 'historyCollapsed' | 'sidePanelCollapsed' | 'topBarCollapsed';

/** 저장 키는 예전 접기 키 그대로다. 예전 '1'(접힘)은 지금의 아이콘만이다. */
const STAGES: Record<
  StagePanel,
  { key: string; order: PanelStage[]; part: FocusPart; iconsAs?: PanelStage }
> = {
  sidebarStage: { key: 'sidebar-collapsed', order: ['open', 'icons', 'hidden'], part: 'sidebar' },
  // 아이콘만 남은 목록은 이제 단계가 아니라 폭이다(panelWidths).
  libraryListStage: { key: 'library-list-collapsed', order: ['open', 'hidden'], part: 'leftPanel' },
  promptPanelStage: {
    key: 'prompt-panel-collapsed',
    order: ['open', 'hidden'],
    part: 'leftPanel',
    iconsAs: 'hidden',
  },
};

const FOLDS: Record<FoldPanel, { key: string; part?: FocusPart }> = {
  filmstripCollapsed: { key: 'filmstrip-collapsed' },
  historyCollapsed: { key: 'history-collapsed', part: 'history' },
  sidePanelCollapsed: { key: 'side-panel-collapsed', part: 'sidePanel' },
  topBarCollapsed: { key: 'top-bar-collapsed', part: 'topBar' },
};

export type LayoutState = {
  sidebarStage: PanelStage;
  libraryListStage: PanelStage;
  /** 작업·자유 생성 화면이 함께 쓴다. */
  promptPanelStage: PanelStage;
  filmstripCollapsed: boolean;
  historyCollapsed: boolean;
  /** 씬 상세·자유 생성·인페인트 편집이 함께 쓴다. */
  sidePanelCollapsed: boolean;
  /** 설정 칩 줄과 씬 이동 줄 */
  topBarCollapsed: boolean;
  /** 집중 모드가 덮어 숨긴 곳. 저장하지 않는다. */
  focusHidden: FocusPart[];
  peek?: 'left' | 'right';
  /** 아이콘 폭까지 줄인 패널 */
  compactPanels: PanelId[];
};

function readStage(panel: StagePanel): PanelStage {
  const { key, order, iconsAs = 'open' } = STAGES[panel];
  const stage = readUiState<PanelStage>(
    key,
    (raw) => (raw === '1' || raw === 'icons' ? 'icons' : raw === 'hidden' ? 'hidden' : 'open'),
    'open',
  );
  return order.includes(stage) ? stage : iconsAs;
}

const readFold = (panel: FoldPanel) => readUiState(FOLDS[panel].key, (raw) => raw === '1', false);

export const useLayout = create<LayoutState>(() => ({
  sidebarStage: readStage('sidebarStage'),
  libraryListStage: readStage('libraryListStage'),
  promptPanelStage: readStage('promptPanelStage'),
  filmstripCollapsed: readFold('filmstripCollapsed'),
  historyCollapsed: readFold('historyCollapsed'),
  sidePanelCollapsed: readFold('sidePanelCollapsed'),
  topBarCollapsed: readFold('topBarCollapsed'),
  focusHidden: [],
  compactPanels: [],
}));

const set = useLayout.setState;
const get = useLayout.getState;

function nextStage(panel: StagePanel, stage: PanelStage): PanelStage {
  const { order } = STAGES[panel];
  return order[(order.indexOf(stage) + 1) % order.length];
}

const hiddenByFocus = (state: LayoutState, part?: FocusPart) =>
  part !== undefined && state.focusHidden.includes(part);

// 화면에 보이는 모습. 저장한 상태 위에 집중 모드가 덮어쓴다.
const shownStage = (state: LayoutState, panel: StagePanel): PanelStage =>
  hiddenByFocus(state, STAGES[panel].part) ? 'hidden' : state[panel];
const unfolded = (state: LayoutState, panel: FoldPanel) =>
  !state[panel] && !hiddenByFocus(state, FOLDS[panel].part);

export const sidebarStageOf = (state: LayoutState) => shownStage(state, 'sidebarStage');
export const libraryListStageOf = (state: LayoutState) => shownStage(state, 'libraryListStage');
export const promptPanelStageOf = (state: LayoutState) => shownStage(state, 'promptPanelStage');
export const historyShownOf = (state: LayoutState) => unfolded(state, 'historyCollapsed');
export const sidePanelShownOf = (state: LayoutState) => unfolded(state, 'sidePanelCollapsed');
export const topBarShownOf = (state: LayoutState) => unfolded(state, 'topBarCollapsed');
export const queueBarShownOf = (state: LayoutState) => !hiddenByFocus(state, 'queueBar');
export const focusingOf = (state: LayoutState) => state.focusHidden.length > 0;

/** 누르면 바뀔 단계를 말한다. 예: 사이드바 숨기기 (Ctrl+B) */
export function stageTitle(
  name: string,
  panel: StagePanel,
  stage: PanelStage,
  shortcut?: string,
): string {
  const action = { open: '펼치기', icons: '아이콘만 남기기', hidden: '숨기기' }[
    nextStage(panel, stage)
  ];
  return `${name} ${action}${shortcut ? ` (${shortcut})` : ''}`;
}

/** 집중 모드가 숨긴 곳을 열면 그곳만 돌아온다. */
function revealFromFocus(part?: FocusPart): boolean {
  const state = get();
  if (!hiddenByFocus(state, part)) return false;
  set({ focusHidden: state.focusHidden.filter((item) => item !== part) });
  return true;
}

function setStage(panel: StagePanel, stage: PanelStage): void {
  set({ [panel]: stage });
  saveUiState(STAGES[panel].key, stage);
}

/** 집중 모드에서 다시 열 때 저장한 단계가 숨김이면 펼친다. */
function cycleStage(panel: StagePanel): void {
  if (revealFromFocus(STAGES[panel].part)) {
    if (get()[panel] === 'hidden') setStage(panel, 'open');
    return;
  }
  setStage(panel, nextStage(panel, get()[panel]));
}

function toggleFold(panel: FoldPanel): void {
  if (revealFromFocus(FOLDS[panel].part) && !get()[panel]) return;
  const collapsed = !get()[panel];
  set({ [panel]: collapsed });
  saveUiState(FOLDS[panel].key, collapsed ? '1' : '0');
}

export function cycleSidebar(): void {
  cycleStage('sidebarStage');
}

export function cycleLibraryList(): void {
  cycleStage('libraryListStage');
}

export function cyclePromptPanel(): void {
  cycleStage('promptPanelStage');
}

export function toggleFilmstrip(): void {
  toggleFold('filmstripCollapsed');
}

export function toggleHistory(): void {
  toggleFold('historyCollapsed');
}

export function toggleSidePanel(): void {
  toggleFold('sidePanelCollapsed');
}

export function toggleTopBar(): void {
  toggleFold('topBarCollapsed');
}

/** 다시 누르면 숨기기 전으로 돌아온다. */
export function toggleFocusMode(): void {
  if (focusingOf(get())) return set({ focusHidden: [] });
  const level = useStore.getState().library?.settings.layout.focusLevel ?? 'panels';
  set({ focusHidden: FOCUS_PARTS[level] });
}

export function setPeek(peek?: 'left' | 'right'): void {
  set({ peek });
}

export function setPanelCompact(panel: PanelId, compact: boolean): void {
  const { compactPanels } = get();
  if (compactPanels.includes(panel) === compact) return;
  set({
    compactPanels: compact
      ? [...compactPanels, panel]
      : compactPanels.filter((item) => item !== panel),
  });
}
