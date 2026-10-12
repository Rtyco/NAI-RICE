import { libraryApi } from '../desktop';
import { importJsonFromPicker } from '../importers';
import { sectionInfo } from '../sections';
import { run, setSettingsOpen, toggleSidebar, useStore } from '../store';
import { Icon } from './Icon';

/** 지금 보는 화면 이름. 작업 › 리나 › 기쁨, 라이브러리 › 캐릭터 › 아리아처럼 이어 쓴다. */
function useLocation(): string {
  const library = useStore((state) => state.library);
  const view = useStore((state) => state.view);
  const emotionId = useStore((state) => state.detailEmotionId);
  if (!library) return '';
  if (view.kind === 'free') return '자유 생성';
  if (view.kind === 'project') {
    const project = library.projects.find((item) => item.id === view.projectId);
    if (!project) return '';
    const emotion = emotionId
      ? library.emotionSets
          .find((item) => item.id === project.emotionSetId)
          ?.emotions.find((item) => item.id === emotionId)
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

/**
 * 창 맨 위 줄. 끌어서 창을 옮기고, 오른쪽에는 Windows 창 버튼이 겹쳐 그려진다. 왼쪽에 사이드바 접기와 앱
 * 이름·저장 실패 표시를, 가운데에 지금 화면 이름을, 창 버튼 왼쪽에 JSON 가져오기·작업 폴더·프로그램 설정을 둔다.
 */
export function TitleBar() {
  const collapsed = useStore((state) => state.sidebarCollapsed);
  const saveState = useStore((state) => state.saveState);
  const location = useLocation();
  const version = useStore((state) => state.version);
  const update = useStore((state) => state.update);
  return (
    <div className="titlebar">
      <button
        className="icon-button titlebar-toggle"
        title={collapsed ? '사이드바 펼치기 (Ctrl+B)' : '사이드바 접기 (Ctrl+B)'}
        aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        onClick={toggleSidebar}
      >
        <Icon name="sidebar" size={16} />
      </button>
      <strong className="titlebar-brand">NAI RICE</strong>
      {saveState === 'error' && (
        <span
          className="save-indicator error"
          title="작업 폴더에 저장하지 못했습니다. 알림을 확인하십시오."
        >
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
          className="titlebar-action"
          title="백업, 내보낸 항목, SDStudio JSON 가져오기 (Ctrl+O)"
          onClick={() => void importJsonFromPicker()}
        >
          <Icon name="import" size={15} />
          <span>JSON 가져오기</span>
        </button>
        <button
          className="titlebar-action"
          title="작업 폴더 열기"
          onClick={() =>
            void run('폴더를 여는 중', () => libraryApi().openInExplorer({ kind: 'root' }))
          }
        >
          <Icon name="folder" size={15} />
          <span>작업 폴더</span>
        </button>
        <button
          className="titlebar-action settings-entry"
          title="프로그램 설정 (NovelAI 토큰·요청 간격·결과 파일·백업) · Ctrl+,"
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" size={15} />
          <span>프로그램 설정</span>
          {update?.newer ? (
            <small className="update-badge">새 버전 {update.latest}</small>
          ) : (
            <small>v{version}</small>
          )}
        </button>
      </div>
    </div>
  );
}
