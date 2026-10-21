import { readUiState, saveUiState } from './store';

/** 폭은 `:root` CSS 변수라 같은 패널을 쓰는 화면이 함께 바뀌고, 다음 실행에도 기억한다. */
export const PANELS = {
  sidebar: { variable: '--sidebar-width', initial: 240, min: 200, max: 400, side: 'left' },
  'library-list': {
    variable: '--library-list-width',
    initial: 260,
    min: 200,
    max: 480,
    side: 'left',
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
    initial: 150,
    min: 110,
    max: 400,
    side: 'right',
  },
} as const;

export type PanelId = keyof typeof PANELS;

const storageKey = (panel: PanelId) => `panel-width:${panel}`;
const clamp = (panel: PanelId, width: number) =>
  Math.round(Math.min(PANELS[panel].max, Math.max(PANELS[panel].min, width)));

export function setWidth(panel: PanelId, width: number): number {
  const value = clamp(panel, width);
  document.documentElement.style.setProperty(PANELS[panel].variable, `${value}px`);
  return value;
}

export function currentWidth(panel: PanelId): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(PANELS[panel].variable);
  return Number.parseFloat(raw) || PANELS[panel].initial;
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
