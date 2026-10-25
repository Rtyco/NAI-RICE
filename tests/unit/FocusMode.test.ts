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
    removeItem: (key: string) => void delete saved[key],
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

describe('화면 배치 초기화', () => {
  it('숨기고 접은 곳과 떠 있는 창 위치를 처음으로 되돌리고 저장값도 지워', () => {
    reset();
    layout.cycleSidebar();
    layout.toggleSidePanel();
    layout.toggleFilmstrip();
    layout.toggleFocusMode();
    layout.movePalette({ x: 0.1, y: 0.2 });
    layout.savePalettePosition();
    store.toggleSidebarSection('library');

    layout.resetLayout();
    store.resetSidebarSections();

    expect(state()).toMatchObject({
      sidebarStage: 'open',
      sidePanelCollapsed: false,
      filmstripCollapsed: false,
      focusHidden: [],
      palettePosition: { x: 0.5, y: 0.9 },
    });
    expect(store.useStore.getState().sidebarSections).toEqual({ projects: false, library: false });
    for (const key of [
      'sidebar-collapsed',
      'side-panel-collapsed',
      'filmstrip-collapsed',
      'palette-position',
      'sidebar-sections-collapsed',
    ]) {
      expect(saved[key]).toBeUndefined();
    }
  });
});

describe('좁은 창', () => {
  it('확대 비율을 반영한 폭으로 단계를 나누고 히스토리부터 접어', () => {
    expect([1600, 1280, 1279, 960, 959, 640, 639].map(layout.widthClassOf)).toEqual([
      'wide',
      'wide',
      'medium',
      'medium',
      'narrow',
      'narrow',
      'phone',
    ]);
    expect(layout.widthFolds('medium')).toEqual({ hidden: ['history'], sidebar: 'icons' });
    expect(layout.widthFolds('phone').sidebar).toBe('icons');
  });

  it('저장한 상태는 그대로 두고 덮어 접으며, 다시 열면 그곳만 열리고 넓히면 원래대로', () => {
    reset();
    layout.useLayout.setState({ widthClass: 'wide', widthHidden: [], widthSidebar: undefined });
    layout.fitToWidth(800);
    expect(layout.sidebarStageOf(state())).toBe('icons');
    expect(layout.promptPanelStageOf(state())).toBe('hidden');
    expect(layout.historyShownOf(state())).toBe(false);
    expect(state().sidebarStage).toBe('open');

    // 960~1279에서는 겹치지 않고 그 자리에 다시 연다.
    layout.fitToWidth(1100);
    expect(layout.promptPanelStageOf(state())).toBe('open');
    layout.toggleHistory();
    expect(layout.historyShownOf(state())).toBe(true);
    expect(state().peek).toBeUndefined();
    layout.cycleSidebar();
    expect(layout.sidebarStageOf(state())).toBe('open');
    expect(state().sidebarStage).toBe('open');

    // 같은 단계 안에서 폭이 바뀌면 연 패널을 다시 접지 않는다.
    layout.fitToWidth(1000);
    expect(layout.historyShownOf(state())).toBe(true);
    layout.fitToWidth(1400);
    expect(layout.historyShownOf(state())).toBe(true);
    expect(layout.sidebarStageOf(state())).toBe('open');
  });
});

describe('좁은 창에서 겹쳐 열기', () => {
  it('960px 아래에서 접힌 패널 버튼은 레이아웃을 밀지 않고 겹쳐 열고, 다시 누르면 닫아', () => {
    reset();
    layout.useLayout.setState({ widthClass: 'wide', widthHidden: [], widthSidebar: undefined });
    layout.fitToWidth(800);
    layout.cyclePromptPanel();
    expect(state()).toMatchObject({ peek: 'left', peekPinned: true });
    expect(layout.promptPanelStageOf(state())).toBe('hidden');
    layout.cyclePromptPanel();
    expect(state().peek).toBeUndefined();

    layout.toggleHistory();
    expect(state()).toMatchObject({ peek: 'right', peekPinned: true });
    expect(state().historyCollapsed).toBe(false);
    layout.fitToWidth(1400);
    expect(state().peek).toBeUndefined();
  });

  it('오른쪽 겹침은 누른 패널만 띄우고, 다른 패널 버튼을 누르면 그쪽으로 바꿔', () => {
    reset();
    layout.useLayout.setState({ widthClass: 'wide', widthHidden: [], widthSidebar: undefined });
    layout.fitToWidth(400);
    layout.toggleSidePanel();
    expect(state()).toMatchObject({ peek: 'right', peekPart: 'sidePanel' });
    layout.toggleHistory();
    expect(state()).toMatchObject({ peek: 'right', peekPart: 'history' });
    layout.toggleHistory();
    expect(state().peek).toBeUndefined();
    expect(state().peekPart).toBeUndefined();
  });

  it('휴대폰 폭의 사이드바는 아이콘만으로 시작해 숨김과만 오가고 저장한 단계는 그대로야', () => {
    reset();
    layout.useLayout.setState({ widthClass: 'wide', widthHidden: [], widthSidebar: undefined });
    layout.fitToWidth(400);
    expect(layout.sidebarStageOf(state())).toBe('icons');
    expect(layout.stageTitle('사이드바', 'sidebarStage', 'icons')).toBe('사이드바 숨기기');
    layout.cycleSidebar();
    expect(layout.sidebarStageOf(state())).toBe('hidden');
    expect(layout.stageTitle('사이드바', 'sidebarStage', 'hidden')).toBe(
      '사이드바 아이콘만 남기기',
    );
    layout.cycleSidebar();
    expect(layout.sidebarStageOf(state())).toBe('icons');
    expect(state().peek).toBeUndefined();
    expect(state().sidebarStage).toBe('open');
    layout.fitToWidth(1400);
    expect(layout.sidebarStageOf(state())).toBe('open');
  });
});
