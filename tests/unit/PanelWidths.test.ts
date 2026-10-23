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
