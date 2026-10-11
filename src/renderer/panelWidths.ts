import { readUiState, saveUiState } from './store';

/**
 * 끌어서 폭을 바꾸는 패널. 폭은 `:root`의 CSS 변수로 두어 같은 패널을 쓰는 화면(오른쪽 입력 패널은 씬 상세·
 * 자유 생성·인페인트 편집)이 함께 바뀌고, 다음 실행에도 기억한다.
 */
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

/** 기억해 둔 폭을 첫 화면을 그리기 전에 넣는다. */
export function restorePanelWidths(): void {
  for (const panel of Object.keys(PANELS) as PanelId[]) {
    const saved = readUiState(storageKey(panel), (raw) => Number(raw), NaN);
    if (Number.isFinite(saved) && saved > 0) setWidth(panel, saved);
  }
}

export function commitWidth(panel: PanelId, width: number): void {
  saveUiState(storageKey(panel), String(setWidth(panel, width)));
}
