import { useSyncExternalStore } from 'react';
import { readUiState, saveUiState } from './store';

type PanelSpec = {
  variable: string;
  initial: number;
  min: number;
  max: number;
  side: 'left' | 'right';
  /** 최소 폭보다 더 줄이면 이 폭의 아이콘만 남은 모양으로 붙는다. */
  compact?: number;
};

/** 폭은 `:root` CSS 변수라 같은 패널을 쓰는 화면이 함께 바뀌고, 다음 실행에도 기억한다. */
export const PANELS = {
  sidebar: { variable: '--sidebar-width', initial: 240, min: 200, max: 400, side: 'left' },
  'library-list': {
    variable: '--library-list-width',
    initial: 260,
    min: 200,
    max: 480,
    side: 'left',
    compact: 60,
  },
  'prompt-panel': {
    variable: '--prompt-panel-width',
    initial: 300,
    min: 240,
    max: 600,
    side: 'left',
  },
  'side-panel': { variable: '--side-panel-width', initial: 360, min: 280, max: 640, side: 'right' },
  'history-panel': {
    variable: '--history-panel-width',
    initial: 220,
    min: 160,
    max: 420,
    side: 'right',
  },
} satisfies Record<string, PanelSpec>;

export type PanelId = keyof typeof PANELS;

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

const compactPanels = new Set<PanelId>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 아이콘만 남은 폭인지. 폭은 CSS 변수라 React가 모르므로 바뀔 때 알린다. */
export function usePanelCompact(panel: PanelId): boolean {
  return useSyncExternalStore(subscribe, () => compactPanels.has(panel));
}

export function setWidth(panel: PanelId, width: number): number {
  const value = snapWidth(panel, width);
  document.documentElement.style.setProperty(spec(panel).variable, `${value}px`);
  const compact = value === spec(panel).compact;
  if (compact !== compactPanels.has(panel)) {
    if (compact) compactPanels.add(panel);
    else compactPanels.delete(panel);
    for (const listener of listeners) listener();
  }
  return value;
}

export function currentWidth(panel: PanelId): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(spec(panel).variable);
  return Number.parseFloat(raw) || spec(panel).initial;
}

/** 첫 화면을 그리기 전에 부른다. */
export function restorePanelWidths(): void {
  for (const panel of Object.keys(PANELS) as PanelId[]) {
    const saved = readUiState(storageKey(panel), (raw) => Number(raw), NaN);
    if (Number.isFinite(saved) && saved > 0) setWidth(panel, saved);
  }
}

export function commitWidth(panel: PanelId, width: number): void {
  saveUiState(storageKey(panel), String(setWidth(panel, width)));
}
