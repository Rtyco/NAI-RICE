import { useEffect, useRef } from 'react';
import { ContextMenuHost, ErrorBoundary } from './components/ContextMenu';
import { DialogHost, openDialog } from './components/Dialogs';
import { DropZone } from './components/DropImport';
import { Icon } from './components/Icon';
import { QueueBar } from './components/QueueBar';
import { NewProjectDialog, Sidebar } from './components/Sidebar';
import { EmptyState } from './components/ui';
import { importJsonFromPicker } from './importers';
import { PROJECT_SECTIONS } from './sections';
import { applyAppearance } from './theme';
import { dismissToast, initialize, openLibrary, setSettingsOpen, useStore } from './store';
import { LibraryView } from './views/LibraryView';
import { ProjectView } from './views/ProjectView';
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
      <p className="hint">이미지·JSON 파일은 창에 끌어다 놓아도 됩니다</p>
    </EmptyState>
  );
}

export default function App() {
  const ready = useStore((state) => state.ready);
  const view = useStore((state) => state.view);
  const library = useStore((state) => state.library);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const collapsed = useStore((state) => state.sidebarCollapsed);

  const appearance = library?.settings.appearance;

  useEffect(() => {
    void initialize();
  }, []);
  useGlobalShortcuts();

  // 작업 폴더를 연 뒤 한 번, 설정에서 켜 두었으면 새 버전을 확인한다.
  const autoCheck = library?.settings.update.autoCheck;
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
        : 'home';
  // 화면 종류가 바뀔 때만 전환 효과를 준다. 라이브러리 안에서 항목만 바꿀 때는 편집기만 바뀐다.
  const transitionKey = view.kind === 'library' ? `library:${view.section}` : viewKey;
  const projectExists =
    view.kind === 'project' && library?.projects.some((item) => item.id === view.projectId);

  return (
    <>
      <div className="titlebar" />
      <main className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {library ? <Sidebar /> : <aside className="sidebar" />}
        <div className="main-area">
          <ErrorBoundary resetKey={viewKey}>
            <div className="view-transition" key={transitionKey}>
              {!ready || !library ? (
                <p className="hint pad">
                  {ready ? '작업 폴더를 열 수 없습니다.' : '작업 폴더를 여는 중…'}
                </p>
              ) : view.kind === 'project' && projectExists ? (
                <ProjectView projectId={view.projectId} />
              ) : view.kind === 'library' ? (
                <LibraryView section={view.section} itemId={view.itemId} />
              ) : (
                <Welcome />
              )}
            </div>
          </ErrorBoundary>
        </div>
        <QueueBar />
        <Toasts />
        {settingsOpen && library && <SettingsModal />}
        <DialogHost />
        <ContextMenuHost />
        <DropZone />
      </main>
    </>
  );
}
