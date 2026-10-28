import { useEffect, useRef, type ReactNode } from 'react';
import { ContextMenuHost } from './components/ContextMenu';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogHost } from './components/Dialogs';
import { openDialog } from './components/dialogStack';
import { FREE_PROJECT_ID } from '../core/model/defaults';
import { DropZone } from './components/DropImport';
import { HistoryPanel } from './components/HistoryPanel';
import { Icon, type IconName } from './components/Icon';
import { QueueBar } from './components/QueueBar';
import { NewProjectDialog, Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { EmptyState } from './components/ui';
import { importJsonFromPicker } from './importers';
import { PROJECT_SECTIONS } from './sections';
import { applyAppearance } from './theme';
import {
  dismissToast,
  initialize,
  openLibrary,
  setSettingsOpen,
  subscribeToMain,
  useStore,
} from './store';
import {
  hasSidePanel,
  historyShownOf,
  sidebarStageOf,
  sidePanelShownOf,
  useLayout,
} from './layout';
import { LibraryView } from './views/LibraryView';
import { FreeView } from './views/FreeView';
import { ProjectView } from './views/ProjectView';
import { FindPanel } from './components/FindPanel';
import { EdgePeek } from './components/EdgePeek';
import { FloatingPalette } from './components/FloatingPalette';
import { PanelResizer } from './components/PanelResizer';
import { FreePromptPanel, ProjectPromptPanel, PromptPanelLayout } from './components/PromptPanel';
import { SettingsModal } from './views/SettingsModal';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { useMiddleClickScroll } from './useMiddleClickScroll';
import { checkForUpdate } from './updates';
import { showWhatsNewOnce } from './whatsNew';

function Toasts() {
  const toasts = useStore((state) => state.toasts);
  const busy = useStore((state) => state.busy);
  const hasPanel = useStore(hasSidePanel);
  const hasHistory = useStore(
    (state) => state.view.kind === 'project' || state.view.kind === 'free',
  );
  const panelShown = useLayout(sidePanelShownOf);
  const historyShown = useLayout(historyShownOf);
  const besidePanel = hasPanel && panelShown;
  const besideHistory = besidePanel && hasHistory && historyShown;
  return (
    <div
      className={`toast-stack ${besidePanel ? 'beside-panel' : ''} ${besideHistory ? 'beside-history' : ''}`}
      role="status"
    >
      {busy && <div className="toast busy">{busy}…</div>}
      {toasts.map((item) => (
        <div key={item.id} className={`toast ${item.kind}`}>
          <span>{item.message}</span>
          <button className="icon-button" onClick={() => dismissToast(item.id)} aria-label="닫기">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** 작업 화면 설정 줄의 칩. 줄이 좁아지면 아이콘만 남아 여기서 아이콘을 익힌다. */
const CHAIN_CHIPS: Array<{ icons: IconName[]; label: string; role: string }> = [
  { icons: ['preset'], label: '생성 설정', role: '모델 · 공통 프롬프트 · Steps' },
  { icons: ['character'], label: '캐릭터', role: '외형 · 의상 프롬프트' },
  { icons: ['pin'], label: '위치', role: '캐릭터 위치 (AI · 직접 지정)' },
  { icons: ['expand'], label: '해상도', role: '이미지 크기 (일반 생성)' },
  { icons: ['reference'], label: '인페인트', role: '참고 이미지 · 캔버스 (인페인트 모드)' },
  { icons: ['portrait', 'vibe'], label: '참고', role: '캐릭터 레퍼런스 ⇄ 바이브 (V4.5)' },
  { icons: ['emotion'], label: '씬 모음', role: '씬 프롬프트' },
  {
    icons: ['border-line', 'upscale'],
    label: '자동 후처리',
    role: '생성할 때마다 구분선 지우기 · 다듬기',
  },
];

function Welcome() {
  return (
    <EmptyState title="작업을 만들어 시작하십시오">
      <div className="welcome-chain">
        {PROJECT_SECTIONS.map((section, index) => (
          <button key={section.id} onClick={() => openLibrary(section.id)}>
            <Icon name={section.icon} size={20} />
            <b>
              {index + 1}. {section.label}
            </b>
            {section.role && <small>{section.role}</small>}
          </button>
        ))}
      </div>
      <div className="button-row center">
        <button
          className="accent"
          onClick={() => void openDialog((close) => <NewProjectDialog close={close} />)}
        >
          ＋ 새 작업
        </button>
        <button onClick={() => void importJsonFromPicker()}>JSON 가져오기</button>
        <button className="with-icon" onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" /> 프로그램 설정 (NovelAI 토큰)
        </button>
      </div>
      <section className="welcome-chips" aria-label="설정 줄 칩">
        <h3>설정 줄 칩</h3>
        <div>
          {CHAIN_CHIPS.map((chip) => (
            <div key={chip.label} className="welcome-chip">
              <span>
                {chip.icons.map((icon) => (
                  <Icon key={icon} name={icon} size={15} />
                ))}
                <b>{chip.label}</b>
              </span>
              <small>{chip.role}</small>
            </div>
          ))}
        </div>
      </section>
    </EmptyState>
  );
}

/** 패널을 접고 펴도 안의 화면까지 다시 그리지 않게 레이아웃은 바깥 틀만 구독한다. */
function AppShell({ children }: { children: ReactNode }) {
  const sidebar = useLayout(sidebarStageOf);
  const peek = useLayout((state) => state.peek);
  const peekPart = useLayout((state) => state.peekPart);
  return (
    <main
      className={`app-shell sidebar-${sidebar} ${peek ? `peek-${peek}` : ''} ${peekPart ? `peek-only-${peekPart}` : ''}`}
    >
      {children}
    </main>
  );
}

function SidebarResizer() {
  const open = useLayout((state) => sidebarStageOf(state) === 'open');
  return open ? <PanelResizer panel="sidebar" /> : null;
}

export default function App() {
  const ready = useStore((state) => state.ready);
  const view = useStore((state) => state.view);
  const hasLibrary = useStore((state) => Boolean(state.library));
  const settingsOpen = useStore((state) => state.settingsOpen);
  const appearance = useStore((state) => state.library?.settings.appearance);
  const autoCheck = useStore((state) => state.library?.settings.update.autoCheck);
  const projectExists = useStore(
    (state) =>
      view.kind === 'project' &&
      Boolean(state.library?.projects.some((item) => item.id === view.projectId)),
  );

  useEffect(() => subscribeToMain(), []);
  useEffect(() => {
    void initialize();
  }, []);
  useGlobalShortcuts();
  useMiddleClickScroll();

  const checkedUpdate = useRef(false);
  useEffect(() => {
    if (!ready || autoCheck === undefined || checkedUpdate.current) return;
    checkedUpdate.current = true;
    // 두 창이 겹치지 않게 안내를 닫은 뒤 업데이트를 확인한다.
    void showWhatsNewOnce().then(() => (autoCheck ? checkForUpdate() : undefined));
  }, [ready, autoCheck]);

  useEffect(() => {
    if (appearance) applyAppearance(appearance);
  }, [appearance]);

  const viewKey =
    view.kind === 'project'
      ? `project:${view.projectId}`
      : view.kind === 'library'
        ? `library:${view.section}:${view.itemId ?? ''}`
        : view.kind;
  // 라이브러리 안에서 항목만 바꿀 때는 전환 효과를 주지 않는다.
  const transitionKey = view.kind === 'library' ? `library:${view.section}` : viewKey;

  return (
    <>
      <TitleBar />
      <AppShell>
        {hasLibrary ? <Sidebar /> : <aside className="sidebar" />}
        <SidebarResizer />
        <div className="main-area">
          <ErrorBoundary resetKey={viewKey}>
            <div className="view-transition" key={transitionKey}>
              {!ready || !hasLibrary ? (
                <p className="hint pad">
                  {ready ? '작업 폴더를 열 수 없습니다.' : '작업 폴더를 여는 중…'}
                </p>
              ) : view.kind === 'project' && projectExists ? (
                <PromptPanelLayout
                  panel={<ProjectPromptPanel projectId={view.projectId} />}
                  history={<HistoryPanel projectId={view.projectId} />}
                >
                  <ProjectView projectId={view.projectId} />
                </PromptPanelLayout>
              ) : view.kind === 'free' ? (
                <PromptPanelLayout
                  panel={<FreePromptPanel />}
                  history={<HistoryPanel projectId={FREE_PROJECT_ID} />}
                >
                  <FreeView />
                </PromptPanelLayout>
              ) : view.kind === 'library' ? (
                <LibraryView section={view.section} itemId={view.itemId} />
              ) : (
                <Welcome />
              )}
            </div>
          </ErrorBoundary>
        </div>
        <QueueBar />
        <EdgePeek />
        <FloatingPalette />
        <Toasts />
        {settingsOpen && hasLibrary && <SettingsModal />}
        <DialogHost />
        <FindPanel />
        <ContextMenuHost />
        <DropZone />
      </AppShell>
    </>
  );
}
