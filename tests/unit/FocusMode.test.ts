import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusLevel } from '../../src/core/domain/types';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import type * as LayoutModule from '../../src/renderer/layout';
import type * as StoreModule from '../../src/renderer/store';

let layout: typeof LayoutModule;
let store: typeof StoreModule;

const saved: Record<string, string> = {
  'sidebar-collapsed': '1',
  'library-list-collapsed': '1',
  'prompt-panel-collapsed': '1',
};

beforeAll(async () => {
  // store는 창이 닫힐 때 저장하려고 처음부터 window에 귀를 기울인다.
  vi.stubGlobal('window', { addEventListener: () => undefined });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => void (saved[key] = value),
  });
  store = await import('../../src/renderer/store');
  layout = await import('../../src/renderer/layout');
});

function reset(focusLevel: FocusLevel = 'panels') {
  const library = createDefaultLibrary();
  library.settings.layout.focusLevel = focusLevel;
  store.useStore.setState({ library });
  layout.useLayout.setState({
    sidebarStage: 'open',
    promptPanelStage: 'open',
    libraryListStage: 'open',
    historyCollapsed: false,
    sidePanelCollapsed: false,
    topBarCollapsed: false,
    focusHidden: [],
  });
}

const state = () => layout.useLayout.getState();

describe('패널 단계', () => {
  it('예전에 접어 둔 값(1)은 사이드바는 아이콘만, 프롬프트 패널은 숨김, 라이브러리 목록은 펼침으로 읽어', () => {
    expect(state().sidebarStage).toBe('icons');
    expect(state().promptPanelStage).toBe('hidden');
    expect(state().libraryListStage).toBe('open');
  });

  it('누를 때마다 펼침 → 아이콘만 → 숨김 → 펼침', () => {
    reset();
    const stages = [1, 2, 3].map(() => {
      layout.cycleSidebar();
      return state().sidebarStage;
    });
    expect(stages).toEqual(['icons', 'hidden', 'open']);
    expect(saved['sidebar-collapsed']).toBe('open');
    expect(layout.stageTitle('사이드바', 'sidebarStage', 'icons', 'Ctrl+B')).toBe(
      '사이드바 숨기기 (Ctrl+B)',
    );
  });

  it('라이브러리 목록도 펼침과 숨김뿐', () => {
    reset();
    layout.cycleLibraryList();
    expect(state().libraryListStage).toBe('hidden');
    layout.cycleLibraryList();
    expect(state().libraryListStage).toBe('open');
  });

  it('프롬프트 패널은 펼침과 숨김뿐', () => {
    reset();
    layout.cyclePromptPanel();
    expect(state().promptPanelStage).toBe('hidden');
    expect(layout.stageTitle('프롬프트 패널', 'promptPanelStage', 'open')).toBe(
      '프롬프트 패널 숨기기',
    );
    layout.cyclePromptPanel();
    expect(state().promptPanelStage).toBe('open');
  });
});

describe('집중 모드', () => {
  beforeEach(() => reset());

  it('고른 범위를 저장한 단계 위에 덮어 숨기고, 다시 누르면 그대로 돌아와', () => {
    layout.toggleFocusMode();
    expect(layout.sidebarStageOf(state())).toBe('hidden');
    expect(layout.promptPanelStageOf(state())).toBe('hidden');
    expect(layout.historyShownOf(state())).toBe(false);
    expect(layout.sidePanelShownOf(state())).toBe(true);
    expect(layout.queueBarShownOf(state())).toBe(true);
    expect(state().sidebarStage).toBe('open');

    layout.toggleFocusMode();
    expect(state().focusHidden).toEqual([]);
    expect(layout.sidebarStageOf(state())).toBe('open');
    expect(layout.libraryListStageOf(state())).toBe('open');
  });

  it('숨긴 곳 하나를 열면 그곳만 돌아오고, 모두 열면 집중 모드가 끝나', () => {
    layout.toggleFocusMode();
    layout.cyclePromptPanel();
    expect(layout.promptPanelStageOf(state())).toBe('open');
    expect(layout.libraryListStageOf(state())).toBe('open');
    expect(layout.sidebarStageOf(state())).toBe('hidden');

    layout.cycleSidebar();
    layout.toggleHistory();
    expect(state().focusHidden).toEqual([]);
    expect(layout.historyShownOf(state())).toBe(true);
  });

  it('원래 숨겨 둔 패널을 집중 모드 중에 열면 펼쳐', () => {
    layout.useLayout.setState({ promptPanelStage: 'hidden', historyCollapsed: true });
    layout.toggleFocusMode();
    layout.cyclePromptPanel();
    layout.toggleHistory();
    expect(state().promptPanelStage).toBe('open');
    expect(layout.historyShownOf(state())).toBe(true);
  });

  it('「모두」는 설정 줄·입력 패널·생성 큐 막대까지 숨겨', () => {
    reset('all');
    layout.toggleFocusMode();
    expect(layout.topBarShownOf(state())).toBe(false);
    expect(layout.sidePanelShownOf(state())).toBe(false);
    expect(layout.queueBarShownOf(state())).toBe(false);
    layout.toggleSidePanel();
    expect(layout.sidePanelShownOf(state())).toBe(true);
    expect(layout.queueBarShownOf(state())).toBe(false);
  });
});
