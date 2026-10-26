import { create } from 'zustand';
import type { FocusLevel } from '../core/domain/types';
import type { PanelId } from './panelWidths';
import { readUiState, removeUiState, saveUiState, useStore, type StoreState } from './store';

export type PanelStage = 'open' | 'icons' | 'hidden';

/** 왼쪽 패널은 프롬프트 패널과 라이브러리 목록이다. */
export type FocusPart = 'sidebar' | 'leftPanel' | 'history' | 'topBar' | 'sidePanel' | 'queueBar';

export const FOCUS_PARTS: Record<FocusLevel, FocusPart[]> = {
  panels: ['sidebar', 'leftPanel', 'history'],
  inputs: ['sidebar', 'leftPanel', 'history', 'topBar', 'sidePanel'],
  all: ['sidebar', 'leftPanel', 'history', 'topBar', 'sidePanel', 'queueBar'],
};

type StagePanel = 'sidebarStage' | 'libraryListStage' | 'promptPanelStage';
type FoldPanel =
  'filmstripCollapsed' | 'historyCollapsed' | 'sidePanelCollapsed' | 'topBarCollapsed';

/** 저장 키는 예전 접기 키 그대로다. 예전 '1'(접힘)은 지금의 아이콘만이다. */
const STAGES: Record<
  StagePanel,
  { key: string; order: PanelStage[]; part: FocusPart; iconsAs?: PanelStage }
> = {
  sidebarStage: { key: 'sidebar-collapsed', order: ['open', 'icons', 'hidden'], part: 'sidebar' },
  // 목록의 아이콘만 남은 모양은 단계가 아니라 폭이다(panelWidths).
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
  /** 창이 좁아 덮어 접은 곳(`widthFolds`). 저장하지 않고, 다시 열면 그곳만 빠진다. */
  widthHidden: FocusPart[];
  widthSidebar?: Exclude<PanelStage, 'open'>;
  widthClass: WidthClass;
  peek?: 'left' | 'right';
  /** 좁은 창에서 버튼으로 연 겹친 패널. 마우스가 벗어나도 닫지 않고 바깥을 누르거나 Esc로 닫는다. */
  peekPinned?: boolean;
  /** 버튼으로 연 곳. 오른쪽 겹침에서 히스토리와 입력 패널 중 그것만 띄운다. 마우스로 연 겹침은 둘 다다. */
  peekPart?: FocusPart;
  /** 아이콘 폭까지 줄인 패널 */
  compactPanels: PanelId[];
  palettePosition: PalettePosition;
};

export type WidthClass = 'wide' | 'medium' | 'narrow' | 'phone';

/** CSS px라 확대 비율을 따른다(FHD 200%면 960). 패널 최소 폭과 이미지 칸 `CENTER_MIN`의 합에서 정했다. */
export function widthClassOf(width: number): WidthClass {
  return width >= 1280 ? 'wide' : width >= 960 ? 'medium' : width >= 640 ? 'narrow' : 'phone';
}

export function widthFolds(widthClass: WidthClass): {
  hidden: FocusPart[];
  sidebar?: Exclude<PanelStage, 'open'>;
} {
  if (widthClass === 'wide') return { hidden: [] };
  if (widthClass === 'medium') return { hidden: ['history'], sidebar: 'icons' };
  if (widthClass === 'narrow') return { hidden: ['history', 'leftPanel'], sidebar: 'icons' };
  return { hidden: ['history', 'leftPanel', 'sidePanel', 'topBar'], sidebar: 'icons' };
}

/** 창 크기에 대한 가운데 위치(0~1)라 창 크기가 바뀌어도 비슷한 자리에 있다. */
export type PalettePosition = { x: number; y: number };

const PALETTE_POSITION_KEY = 'palette-position';

const DEFAULT_PALETTE_POSITION: PalettePosition = { x: 0.5, y: 0.9 };

const readPalettePosition = () =>
  readUiState<PalettePosition>(
    PALETTE_POSITION_KEY,
    (raw) => {
      const saved = JSON.parse(raw ?? 'null') as Partial<PalettePosition> | null;
      const valid = (value: unknown): value is number =>
        typeof value === 'number' && value >= 0 && value <= 1;
      return saved && valid(saved.x) && valid(saved.y)
        ? { x: saved.x, y: saved.y }
        : DEFAULT_PALETTE_POSITION;
    },
    DEFAULT_PALETTE_POSITION,
  );

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
  widthHidden: [],
  widthClass: 'wide',
  compactPanels: [],
  palettePosition: readPalettePosition(),
}));

const set = useLayout.setState;
const get = useLayout.getState;

function nextStage(panel: StagePanel, stage: PanelStage): PanelStage {
  const { order } = STAGES[panel];
  return order[(order.indexOf(stage) + 1) % order.length];
}

const forcedHidden = (state: LayoutState, part?: FocusPart) =>
  part !== undefined && (state.focusHidden.includes(part) || state.widthHidden.includes(part));

const FOLD_ORDER: PanelStage[] = ['open', 'icons', 'hidden'];

// 화면에 보이는 모습. 저장한 상태 위에 집중 모드와 좁은 창이 덮어쓴다.
function shownStage(state: LayoutState, panel: StagePanel): PanelStage {
  if (forcedHidden(state, STAGES[panel].part)) return 'hidden';
  const width = panel === 'sidebarStage' ? state.widthSidebar : undefined;
  // 휴대폰 폭은 펼친 사이드바(240px)가 프롬프트 칸을 덮어 아이콘만·숨김만 쓴다.
  if (width && state.widthClass === 'phone') return width;
  return width && FOLD_ORDER.indexOf(width) > FOLD_ORDER.indexOf(state[panel])
    ? width
    : state[panel];
}
const unfolded = (state: LayoutState, panel: FoldPanel) =>
  !state[panel] && !forcedHidden(state, FOLDS[panel].part);

export const sidebarStageOf = (state: LayoutState) => shownStage(state, 'sidebarStage');
export const libraryListStageOf = (state: LayoutState) => shownStage(state, 'libraryListStage');
export const promptPanelStageOf = (state: LayoutState) => shownStage(state, 'promptPanelStage');
export const historyShownOf = (state: LayoutState) => unfolded(state, 'historyCollapsed');
export const sidePanelShownOf = (state: LayoutState) => unfolded(state, 'sidePanelCollapsed');
export const topBarShownOf = (state: LayoutState) => unfolded(state, 'topBarCollapsed');
export const queueBarShownOf = (state: LayoutState) => !forcedHidden(state, 'queueBar');
export const focusingOf = (state: LayoutState) => state.focusHidden.length > 0;

/** 결과 화면(씬 상세·자유 생성)과 인페인트 편집에만 입력 패널이 있다. */
export const hasSidePanel = ({ view, detailEmotionId }: StoreState) =>
  view.kind === 'free' ||
  (view.kind === 'project' && Boolean(detailEmotionId)) ||
  (view.kind === 'library' && view.section === 'references');

/** 누르면 바뀔 단계를 말한다. 예: 사이드바 숨기기 (Ctrl+B) */
export function stageTitle(
  name: string,
  panel: StagePanel,
  stage: PanelStage,
  shortcut?: string,
): string {
  const next =
    panel === 'sidebarStage' && get().widthClass === 'phone'
      ? stage === 'icons'
        ? 'hidden'
        : 'icons'
      : nextStage(panel, stage);
  const action = { open: '펼치기', icons: '아이콘만 남기기', hidden: '숨기기' }[next];
  return `${name} ${action}${shortcut ? ` (${shortcut})` : ''}`;
}

/** 집중 모드나 좁은 창이 숨긴 곳을 열면 그곳만 돌아온다. */
function revealForced(part?: FocusPart): boolean {
  const state = get();
  if (!forcedHidden(state, part)) return false;
  set({
    focusHidden: state.focusHidden.filter((item) => item !== part),
    widthHidden: state.widthHidden.filter((item) => item !== part),
  });
  return true;
}

function setStage(panel: StagePanel, stage: PanelStage): void {
  set({ [panel]: stage });
  saveUiState(STAGES[panel].key, stage);
}

const overlaid = (state: LayoutState) =>
  state.widthClass === 'narrow' || state.widthClass === 'phone';

/** 좁은 창이 접은 곳은 레이아웃을 밀지 않도록 위에 겹쳐 연다. 다시 누르면 닫는다. */
function overlayFromWidth(part: FocusPart | undefined, side: 'left' | 'right'): boolean {
  const state = get();
  if (!part || part === 'topBar' || !overlaid(state) || state.focusHidden.includes(part))
    return false;
  if (!state.widthHidden.includes(part)) return false;
  const open = !(state.peek === side && state.peekPinned && state.peekPart === part);
  set({ peek: open ? side : undefined, peekPinned: open, peekPart: open ? part : undefined });
  return true;
}

/** 집중 모드에서 다시 열 때 저장한 단계가 숨김이면 펼친다. 좁은 창이 접은 사이드바는 저장한 단계로 돌아온다. */
function cycleStage(panel: StagePanel): void {
  if (overlayFromWidth(STAGES[panel].part, 'left')) return;
  const state = get();
  if (panel === 'sidebarStage' && state.widthClass === 'phone' && state.widthSidebar) {
    if (revealForced('sidebar')) return;
    return set({ widthSidebar: state.widthSidebar === 'icons' ? 'hidden' : 'icons' });
  }
  const widthFolded =
    panel === 'sidebarStage' &&
    !forcedHidden(state, 'sidebar') &&
    shownStage(state, panel) !== state[panel];
  if (widthFolded) return set({ widthSidebar: undefined });
  if (revealForced(STAGES[panel].part)) {
    if (get()[panel] === 'hidden') setStage(panel, 'open');
    return;
  }
  setStage(panel, nextStage(panel, get()[panel]));
}

function toggleFold(panel: FoldPanel): void {
  if (overlayFromWidth(FOLDS[panel].part, 'right')) return;
  if (revealForced(FOLDS[panel].part) && !get()[panel]) return;
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

/** 창 크기 단계가 바뀔 때만 다시 접어, 같은 단계 안에서 연 패널은 그대로 둔다. */
export function fitToWidth(width: number): void {
  const widthClass = widthClassOf(width);
  if (widthClass === get().widthClass) return;
  set({
    widthClass,
    ...widthState(widthClass),
    peek: undefined,
    peekPinned: false,
    peekPart: undefined,
  });
}

function widthState(widthClass: WidthClass) {
  const folds = widthFolds(widthClass);
  return { widthHidden: folds.hidden, widthSidebar: folds.sidebar };
}

export function setPeek(peek?: 'left' | 'right'): void {
  set({ peek, peekPinned: false, peekPart: undefined });
}

export function movePalette(palettePosition: PalettePosition): void {
  set({ palettePosition });
}

export function savePalettePosition(): void {
  saveUiState(PALETTE_POSITION_KEY, JSON.stringify(get().palettePosition));
}

/** 폭(`resetPanelWidths`)과 사이드바 구역 접기는 따로 되돌린다. */
export function resetLayout(): void {
  for (const { key } of [...Object.values(STAGES), ...Object.values(FOLDS)]) removeUiState(key);
  removeUiState(PALETTE_POSITION_KEY);
  set({
    sidebarStage: 'open',
    libraryListStage: 'open',
    promptPanelStage: 'open',
    filmstripCollapsed: false,
    historyCollapsed: false,
    sidePanelCollapsed: false,
    topBarCollapsed: false,
    focusHidden: [],
    peek: undefined,
    peekPinned: false,
    peekPart: undefined,
    ...widthState(get().widthClass),
    palettePosition: DEFAULT_PALETTE_POSITION,
  });
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
