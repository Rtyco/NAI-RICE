import { useEffect, useRef } from 'react';
import { ContextMenuHost } from './components/ContextMenu';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogHost } from './components/Dialogs';
import { openDialog } from './components/dialogStack';
import { FREE_PROJECT_ID } from '../core/model/defaults';
import { DropZone } from './components/DropImport';
import { HistoryPanel } from './components/HistoryPanel';
import { Icon } from './components/Icon';
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
  queueBarShownOf,
  setSettingsOpen,
  sidebarStageOf,
  subscribeToMain,
  useStore,
} from './store';
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
import { checkForUpdate } from './updates';

function Toasts() {
  const toasts = useStore((state) => state.toasts);
  const busy = useStore((state) => state.busy);
  return (
    <div className="toast-stack" role="status">
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

function Welcome() {
  return (
    <EmptyState title="작업을 만들어 시작하십시오">
      <div className="welcome-chain">
        {PROJECT_SECTIONS.map((section, index) => (
          <button
            key={section.id}
            onClick={() => openLibrary(section.id)}
            title={section.usage || undefined}
          >
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
    </EmptyState>
  );
}

export default function App() {
  const ready = useStore((state) => state.ready);
  const view = useStore((state) => state.view);
  const hasLibrary = useStore((state) => Boolean(state.library));
  const settingsOpen = useStore((state) => state.settingsOpen);
  const sidebar = useStore(sidebarStageOf);
  const queueShown = useStore(queueBarShownOf);
  const peek = useStore((state) => state.peek);
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

  const checkedUpdate = useRef(false);
  useEffect(() => {
    if (!ready || autoCheck === undefined || checkedUpdate.current) return;
    checkedUpdate.current = true;
    if (autoCheck) void checkForUpdate();
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
      <main className={`app-shell sidebar-${sidebar} ${peek ? `peek-${peek}` : ''}`}>
        {hasLibrary ? <Sidebar /> : <aside className="sidebar" />}
        {sidebar === 'open' && <PanelResizer panel="sidebar" />}
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
        {queueShown && <QueueBar />}
        <EdgePeek />
        <FloatingPalette />
        <Toasts />
        {settingsOpen && hasLibrary && <SettingsModal />}
        <DialogHost />
        <FindPanel />
        <ContextMenuHost />
        <DropZone />
      </main>
    </>
  );
}
