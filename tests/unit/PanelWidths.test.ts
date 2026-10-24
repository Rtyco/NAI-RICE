import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as PanelWidthsModule from '../../src/renderer/panelWidths';

let widths: typeof PanelWidthsModule;

beforeAll(async () => {
  // store는 창이 닫힐 때 저장하려고 처음부터 window에 귀를 기울인다.
  vi.stubGlobal('window', { addEventListener: () => undefined });
  widths = await import('../../src/renderer/panelWidths');
});

describe('라이브러리 목록 폭', () => {
  it('최소 폭보다 많이 줄이면 아이콘 폭으로 붙고, 그 사이 폭은 없다', () => {
    expect(widths.snapWidth('library-list', 120)).toBe(60);
    expect(widths.snapWidth('library-list', 140)).toBe(200);
    expect(widths.snapWidth('library-list', 600)).toBe(480);
  });

  it('키보드로는 아이콘 폭과 최소 폭 사이를 한 번에 건너', () => {
    expect(widths.stepWidth('library-list', 200, -16)).toBe(60);
    expect(widths.stepWidth('library-list', 60, 16)).toBe(200);
    expect(widths.stepWidth('library-list', 60, -16)).toBe(60);
    expect(widths.stepWidth('library-list', 260, -16)).toBe(244);
  });

  it('아이콘 폭이 없는 패널은 최소 폭에서 멈춰', () => {
    expect(widths.snapWidth('prompt-panel', 60)).toBe(240);
  });
});

describe('창에 맞춘 패널 폭', () => {
  const widest = {
    sidebar: 400,
    'library-list': 480,
    'prompt-panel': 600,
    'side-panel': 640,
    'history-panel': 420,
  };
  const detail = {
    panels: ['sidebar', 'prompt-panel', 'history-panel', 'side-panel'] as const,
    fixed: 0,
  };
  const shown = (fit: typeof detail) => ({ ...fit, panels: [...fit.panels] });
  const center = (available: number, fitted: typeof widest) =>
    available - detail.panels.reduce((sum, panel) => sum + fitted[panel], 0);

  it('패널을 모두 넓혀도 가운데 칸을 남기고, 사이드바·히스토리부터 줄인다', () => {
    const fitted = widths.fitWidths(1920, widest, shown(detail));
    expect(center(1920, fitted)).toBe(widths.CENTER_MIN);
    expect(fitted).toMatchObject({
      sidebar: 200,
      'history-panel': 160,
      'prompt-panel': 600,
      'side-panel': 640,
    });
  });

  it('자리가 남으면 그대로 둔다', () => {
    const fitted = widths.fitWidths(2560, widest, shown(detail));
    expect(fitted).toEqual(widest);
  });

  it('끄는 패널이 먼저 줄어 다른 패널을 밀지 않는다', () => {
    const fitted = widths.fitWidths(2200, widest, shown(detail), 'side-panel');
    expect(fitted['side-panel']).toBe(460);
    expect(fitted.sidebar).toBe(400);
  });

  it('모든 패널이 최소 폭이면 더 줄이지 않는다', () => {
    const fitted = widths.fitWidths(1000, widest, shown(detail));
    expect(fitted).toMatchObject({
      sidebar: 200,
      'prompt-panel': 240,
      'side-panel': 280,
      'history-panel': 160,
    });
  });

  it('숨긴 패널과 아이콘 폭인 목록은 줄이지 않는다', () => {
    const fitted = widths.fitWidths(
      900,
      { ...widest, 'library-list': 60 },
      { panels: ['library-list', 'side-panel'], fixed: 60 },
    );
    expect(fitted['library-list']).toBe(60);
    expect(fitted['side-panel']).toBe(460);
    expect(fitted.sidebar).toBe(400);
  });
});
