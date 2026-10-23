import { libraryApi } from '../desktop';
import { sectionInfo } from '../sections';
import {
  cycleSidebar,
  focusingOf,
  sidebarStageOf,
  stageTitle,
  toggleFocusMode,
  useLayout,
} from '../layout';
import { run, setSettingsOpen, useStore, type StoreState } from '../store';
import { Icon } from './Icon';

/** 예: 작업 › 리나 › 기쁨 */
function locationOf({ library, view, detailEmotionId }: StoreState): string {
  if (!library) return '';
  if (view.kind === 'free') return '자유 생성';
  if (view.kind === 'project') {
    const project = library.projects.find((item) => item.id === view.projectId);
    if (!project) return '';
    const emotion = detailEmotionId
      ? library.emotionSets
          .find((item) => item.id === project.emotionSetId)
          ?.emotions.find((item) => item.id === detailEmotionId)
      : undefined;
    return ['작업', project.name, emotion?.name].filter(Boolean).join(' › ');
  }
  if (view.kind === 'library') {
    const items = library[view.section] as Array<{ id: string; name: string }>;
    const item = items.find((entry) => entry.id === view.itemId) ?? items[0];
    return ['라이브러리', sectionInfo(view.section).label, item?.name].filter(Boolean).join(' › ');
  }
  return '';
}

/** 오른쪽 끝에는 Windows 창 버튼이 겹친다(`titleBarOverlay`). */
export function TitleBar() {
  const sidebar = useLayout(sidebarStageOf);
  const focusing = useLayout(focusingOf);
  const saveState = useStore((state) => state.saveState);
  const location = useStore(locationOf);
  const version = useStore((state) => state.version);
  const update = useStore((state) => state.update);
  return (
    <div className="titlebar">
      <button
        className="icon-button titlebar-toggle"
        title={stageTitle('사이드바', 'sidebarStage', sidebar, 'Ctrl+B')}
        aria-label={stageTitle('사이드바', 'sidebarStage', sidebar)}
        onClick={cycleSidebar}
      >
        <Icon name="sidebar" size={16} />
      </button>
      <strong className="titlebar-brand">NAI RICE</strong>
      {update?.newer ? (
        <button
          className="update-badge"
          title="새 버전 보기"
          onClick={() => setSettingsOpen(true, 'info')}
        >
          새 버전 {update.latest}
        </button>
      ) : (
        version && <small className="titlebar-version">v{version}</small>
      )}
      {saveState === 'error' && (
        <span className="save-indicator error" title="작업 폴더에 저장하지 못했습니다">
          저장 실패
        </span>
      )}
      {location && (
        <span className="titlebar-location" title={location}>
          {location}
        </span>
      )}
      <div className="titlebar-actions">
        <button
          className={`titlebar-action ${focusing ? 'active' : ''}`}
          title={focusing ? '집중 모드 끝내기 (Tab)' : '집중 모드 (Tab)'}
          aria-label="집중 모드"
          aria-pressed={focusing}
          onClick={toggleFocusMode}
        >
          <Icon name="focus" size={16} />
        </button>
        <button
          className="titlebar-action"
          title="작업 폴더 열기"
          aria-label="작업 폴더 열기"
          onClick={() =>
            void run('폴더를 여는 중', () => libraryApi().openInExplorer({ kind: 'root' }))
          }
        >
          <Icon name="folder" size={16} />
        </button>
        <button
          className="titlebar-action"
          title="프로그램 설정 (Ctrl+,)"
          aria-label="프로그램 설정"
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" size={16} />
        </button>
      </div>
    </div>
  );
}
