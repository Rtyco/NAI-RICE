import {
  hasSidePanel,
  historyShownOf,
  libraryListStageOf,
  promptPanelStageOf,
  setPanelCompact,
  sidebarStageOf,
  sidePanelShownOf,
  useLayout,
} from './layout';
import { readUiState, removeUiState, saveUiState, useStore } from './store';

type PanelSpec = {
  /** 사용자가 정한 폭 */
  variable: string;
  /** 창에 맞춰 줄인 실제 칸 폭. grid와 손잡이는 이것을 쓴다. */
  column: string;
  initial: number;
  min: number;
  max: number;
  side: 'left' | 'right';
  /** 최소 폭보다 더 줄이면 이 폭의 아이콘만 남은 모양으로 붙는다. */
  compact?: number;
};

/** 폭은 `:root` CSS 변수라 같은 패널을 쓰는 화면이 함께 바뀌고, 다음 실행에도 기억한다. */
export const PANELS = {
  sidebar: {
    variable: '--sidebar-width',
    column: '--sidebar-column',
    initial: 240,
    min: 200,
    max: 400,
    side: 'left',
  },
  'library-list': {
    variable: '--library-list-width',
    column: '--library-list-column',
    initial: 260,
    min: 200,
    max: 480,
    side: 'left',
    compact: 60,
  },
  'prompt-panel': {
    variable: '--prompt-panel-width',
    column: '--prompt-panel-column',
    initial: 300,
    min: 240,
    max: 600,
    side: 'left',
  },
  'side-panel': {
    variable: '--side-panel-width',
    column: '--side-panel-column',
    initial: 360,
    min: 280,
    max: 640,
    side: 'right',
  },
  'history-panel': {
    variable: '--history-panel-width',
    column: '--history-panel-column',
    initial: 220,
    min: 160,
    max: 420,
    side: 'right',
  },
} satisfies Record<string, PanelSpec>;

export type PanelId = keyof typeof PANELS;

const PANEL_IDS = Object.keys(PANELS) as PanelId[];

const spec = (panel: PanelId): PanelSpec => PANELS[panel];

const storageKey = (panel: PanelId) => `panel-width:${panel}`;

export const lowestWidth = (panel: PanelId) => spec(panel).compact ?? spec(panel).min;

/** 최소 폭과 아이콘 폭의 가운데보다 좁히면 아이콘 폭으로 붙고, 그 사이 폭은 없다. */
export function snapWidth(panel: PanelId, width: number): number {
  const { min, max, compact } = spec(panel);
  if (compact !== undefined && width < (min + compact) / 2) return compact;
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** 키보드로 한 칸씩 움직일 때. 아이콘 폭과 최소 폭 사이는 한 번에 건넌다. */
export function stepWidth(panel: PanelId, width: number, delta: number): number {
  const { min, compact } = spec(panel);
  if (compact !== undefined && width === compact) return delta > 0 ? min : compact;
  if (compact !== undefined && width === min && delta < 0) return compact;
  return snapWidth(panel, width + delta);
}

/** 이미지·편집 칸이 이보다 좁아지면 패널이 양보한다. 모든 패널이 최소 폭이면 더 좁아진다. */
export const CENTER_MIN = 320;

/** 창이 좁을 때 앞에서부터 줄인다. */
const YIELD_ORDER: PanelId[] = [
  'sidebar',
  'history-panel',
  'library-list',
  'prompt-panel',
  'side-panel',
];

export type ShownPanels = {
  panels: PanelId[];
  /** 폭을 조절하지 않는 칸(아이콘만 남은 사이드바) */
  fixed: number;
};

/** 보이는 패널이 가운데 칸을 `CENTER_MIN`보다 좁히면 넘친 만큼 줄인다. `first`가 먼저 줄어든다. */
export function fitWidths(
  available: number,
  widths: Record<PanelId, number>,
  shown: ShownPanels,
  first?: PanelId,
): Record<PanelId, number> {
  const fitted = { ...widths };
  let over =
    shown.fixed +
    shown.panels.reduce((sum, panel) => sum + widths[panel], 0) +
    CENTER_MIN -
    available;
  const order = first ? [first, ...YIELD_ORDER.filter((panel) => panel !== first)] : YIELD_ORDER;
  for (const panel of order) {
    if (over <= 0) break;
    if (!shown.panels.includes(panel)) continue;
    const cut = Math.min(over, Math.max(0, widths[panel] - spec(panel).min));
    fitted[panel] -= cut;
    over -= cut;
  }
  return fitted;
}

function shownPanels(): ShownPanels {
  const layout = useLayout.getState();
  const state = useStore.getState();
  const panels: PanelId[] = [];
  const sidebar = sidebarStageOf(layout);
  if (sidebar === 'open') panels.push('sidebar');
  if (state.view.kind === 'library') {
    if (libraryListStageOf(layout) === 'open') panels.push('library-list');
  } else if (state.view.kind === 'project' || state.view.kind === 'free') {
    if (promptPanelStageOf(layout) === 'open') panels.push('prompt-panel');
    if (historyShownOf(layout)) panels.push('history-panel');
  }
  if (hasSidePanel(state) && sidePanelShownOf(layout)) panels.push('side-panel');
  return { panels, fixed: sidebar === 'icons' ? 60 : 0 };
}

const widths = Object.fromEntries(PANEL_IDS.map((panel) => [panel, spec(panel).initial])) as Record<
  PanelId,
  number
>;
let fitted: Partial<Record<PanelId, number>> = {};

function fitPanels(first?: PanelId): void {
  const next = fitWidths(window.innerWidth, widths, shownPanels(), first);
  for (const panel of PANEL_IDS) {
    if (next[panel] === fitted[panel]) continue;
    document.documentElement.style.setProperty(spec(panel).column, `${next[panel]}px`);
  }
  fitted = next;
}

export function watchPanelFit(): void {
  fitPanels();
  window.addEventListener('resize', () => fitPanels());
  useLayout.subscribe(() => fitPanels());
  useStore.subscribe((state, prev) => {
    if (state.view !== prev.view || state.detailEmotionId !== prev.detailEmotionId) fitPanels();
  });
}

/** 폭은 CSS 변수라 React가 모르므로 아이콘 폭인지만 상태로 둔다. */
export function usePanelCompact(panel: PanelId): boolean {
  return useLayout((state) => state.compactPanels.includes(panel));
}

/** 끄는 패널이 먼저 줄어들어, 넓히면 다른 패널을 밀지 않고 거기서 멈춘다. */
export function setWidth(panel: PanelId, width: number): number {
  const value = snapWidth(panel, width);
  widths[panel] = value;
  document.documentElement.style.setProperty(spec(panel).variable, `${value}px`);
  setPanelCompact(panel, value === spec(panel).compact);
  fitPanels(panel);
  return value;
}

/** 창에 맞춰 줄어 있으면 보이는 폭 */
export function currentWidth(panel: PanelId): number {
  return fitted[panel] ?? widths[panel];
}

/** 첫 화면을 그리기 전에 부른다. */
export function restorePanelWidths(): void {
  for (const panel of PANEL_IDS) {
    const saved = readUiState(storageKey(panel), (raw) => Number(raw), NaN);
    if (Number.isFinite(saved) && saved > 0) setWidth(panel, saved);
  }
}

export function resetPanelWidths(): void {
  for (const panel of PANEL_IDS) {
    removeUiState(storageKey(panel));
    setWidth(panel, spec(panel).initial);
  }
}

/** 놓았을 때 보이던 폭을 저장한다. */
export function commitWidth(panel: PanelId, width: number): void {
  setWidth(panel, width);
  saveUiState(storageKey(panel), String(setWidth(panel, currentWidth(panel))));
}
