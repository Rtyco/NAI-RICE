import { useEffect } from 'react';
import { openDialog } from './components/Dialogs';
import { NewProjectDialog } from './components/Sidebar';
import { appApi } from './desktop';
import { importJsonFromPicker } from './importers';
import { SECTIONS } from './sections';
import {
  flushSaves,
  openLibrary,
  openProject,
  setSettingsOpen,
  toast,
  toggleSidebar,
  useStore,
} from './store';

/** 작업 화면으로 간다. 보고 있던 작업이 있으면 그 작업, 없으면 마지막으로 연 작업. */
function openLastProject(): void {
  const { library, view } = useStore.getState();
  if (!library?.projects.length) {
    useStore.setState({ view: { kind: 'home' } });
    return;
  }
  const current = view.kind === 'project' ? view.projectId : library.lastProjectId;
  const project = library.projects.find((item) => item.id === current) ?? library.projects[0];
  openProject(project.id);
}

/** 사이드바 순서대로 다음·이전 작업을 연다. */
function cycleProject(step: 1 | -1): void {
  const { library, view } = useStore.getState();
  const projects = library?.projects ?? [];
  if (!projects.length) return;
  const index =
    view.kind === 'project' ? projects.findIndex((item) => item.id === view.projectId) : -1;
  const next =
    index < 0
      ? step > 0
        ? 0
        : projects.length - 1
      : (index + step + projects.length) % projects.length;
  openProject(projects[next].id);
}

/**
 * 창 어디서나 쓰는 단축키. 창 단위 단축키(F11 전체 화면, Ctrl +/-/0 확대, Ctrl+W)는 메인 프로세스가 처리한다.
 * 대화상자가 열려 있으면 화면 이동은 하지 않는다. 생성처럼 Anlas를 쓰는 동작에는 단축키를 두지 않는다.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const dialogOpen = Boolean(document.querySelector('.modal-backdrop'));
      const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
      const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      const key = event.key;
      let action: (() => void) | undefined;

      if (plain && key === 'F1') action = openLastProject;
      const section = SECTIONS.find((item) => item.shortcut === key);
      if (plain && section) action = () => openLibrary(section.id);
      if (ctrl && key === 'Tab') action = () => cycleProject(event.shiftKey ? -1 : 1);
      if (ctrl && !event.shiftKey && key.toLowerCase() === 'n')
        action = () => void openDialog((close) => <NewProjectDialog close={close} />);
      if (ctrl && !event.shiftKey && key.toLowerCase() === 'o')
        action = () => void importJsonFromPicker();
      if (ctrl && !event.shiftKey && key === ',') action = () => setSettingsOpen(true);
      if (ctrl && !event.shiftKey && key.toLowerCase() === 'b') action = toggleSidebar;
      if (dialogOpen) action = undefined;

      // 저장은 대화상자가 열려 있어도 한다.
      if (ctrl && !event.shiftKey && key.toLowerCase() === 's')
        action = () =>
          void flushSaves().then(() => {
            if (useStore.getState().saveState !== 'error') toast('저장했습니다.');
          });

      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 전체 화면이면 위쪽 제목 줄(창 버튼 자리)을 숨기고, 확대 비율이 바뀌면 알려 준다.
  useEffect(() => {
    let zoom = 100;
    return appApi().onWindowState((state) => {
      document.documentElement.dataset.fullscreen = state.fullScreen ? 'true' : 'false';
      if (state.zoomPercent !== zoom) {
        zoom = state.zoomPercent;
        toast(`화면 크기 ${zoom}%${zoom === 100 ? '' : ' · Ctrl+0으로 되돌리기'}`);
      }
    });
  }, []);
}
