import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusLevel } from '../../src/core/domain/types';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import type * as StoreModule from '../../src/renderer/store';

let store: typeof StoreModule;

beforeAll(async () => {
  // store는 창이 닫힐 때 저장하려고 처음부터 window에 귀를 기울인다.
  vi.stubGlobal('window', { addEventListener: () => undefined });
  store = await import('../../src/renderer/store');
});

function reset(focusLevel: FocusLevel = 'panels') {
  const library = createDefaultLibrary();
  library.settings.layout.focusLevel = focusLevel;
  store.useStore.setState({
    library,
    sidebarStage: 'open',
    promptPanelStage: 'open',
    libraryListStage: 'open',
    historyCollapsed: false,
    sidePanelCollapsed: false,
    topBarCollapsed: false,
    focusHidden: [],
  });
}

const state = () => store.useStore.getState();

describe('패널 단계', () => {
  beforeEach(() => reset());

  it('누를 때마다 펼침 → 아이콘만 → 숨김 → 펼침', () => {
    const stages = [1, 2, 3].map(() => {
      store.cycleSidebar();
      return state().sidebarStage;
    });
    expect(stages).toEqual(['icons', 'hidden', 'open']);
    expect(store.stageTitle('사이드바', 'sidebarStage', 'icons', 'Ctrl+B')).toBe(
      '사이드바 숨기기 (Ctrl+B)',
    );
  });

  it('라이브러리 목록도 펼침과 숨김뿐', () => {
    store.cycleLibraryList();
    expect(state().libraryListStage).toBe('hidden');
    store.cycleLibraryList();
    expect(state().libraryListStage).toBe('open');
  });

  it('프롬프트 패널은 펼침과 숨김뿐', () => {
    store.cyclePromptPanel();
    expect(state().promptPanelStage).toBe('hidden');
    expect(store.stageTitle('프롬프트 패널', 'promptPanelStage', 'open')).toBe(
      '프롬프트 패널 숨기기',
    );
    store.cyclePromptPanel();
    expect(state().promptPanelStage).toBe('open');
  });
});

describe('집중 모드', () => {
  beforeEach(() => reset());

  it('고른 범위를 저장한 단계 위에 덮어 숨기고, 다시 누르면 그대로 돌아와', () => {
    store.toggleFocusMode();
    expect(store.sidebarStageOf(state())).toBe('hidden');
    expect(store.promptPanelStageOf(state())).toBe('hidden');
    expect(store.historyShownOf(state())).toBe(false);
    expect(store.sidePanelShownOf(state())).toBe(true);
    expect(store.queueBarShownOf(state())).toBe(true);
    expect(state().sidebarStage).toBe('open');

    store.toggleFocusMode();
    expect(state().focusHidden).toEqual([]);
    expect(store.sidebarStageOf(state())).toBe('open');
    expect(store.libraryListStageOf(state())).toBe('open');
  });

  it('숨긴 곳 하나를 열면 그곳만 돌아오고, 모두 열면 집중 모드가 끝나', () => {
    store.toggleFocusMode();
    store.cyclePromptPanel();
    expect(store.promptPanelStageOf(state())).toBe('open');
    expect(store.libraryListStageOf(state())).toBe('open');
    expect(store.sidebarStageOf(state())).toBe('hidden');

    store.cycleSidebar();
    store.toggleHistory();
    expect(state().focusHidden).toEqual([]);
    expect(store.historyShownOf(state())).toBe(true);
  });

  it('원래 숨겨 둔 패널을 집중 모드 중에 열면 펼쳐', () => {
    store.useStore.setState({ promptPanelStage: 'hidden', historyCollapsed: true });
    store.toggleFocusMode();
    store.cyclePromptPanel();
    store.toggleHistory();
    expect(state().promptPanelStage).toBe('open');
    expect(store.historyShownOf(state())).toBe(true);
  });

  it('「모두」는 설정 줄·입력 패널·생성 큐 막대까지 숨겨', () => {
    reset('all');
    store.toggleFocusMode();
    expect(store.topBarShownOf(state())).toBe(false);
    expect(store.sidePanelShownOf(state())).toBe(false);
    expect(store.queueBarShownOf(state())).toBe(false);
    store.toggleSidePanel();
    expect(store.sidePanelShownOf(state())).toBe(true);
    expect(store.queueBarShownOf(state())).toBe(false);
  });
});
