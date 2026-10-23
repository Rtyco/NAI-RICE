import { useEffect } from 'react';
import { openDialog } from './components/dialogStack';
import { NewProjectDialog } from './components/Sidebar';
import { appApi } from './desktop';
import { importJsonFromPicker } from './importers';
import { groupFromShortcut } from './components/listFolders';
import { FREE_PROJECT_ID } from '../core/model/defaults';
import { openFind } from './find';
import { requestRename } from './renameRequest';
import { SECTIONS } from './sections';
import {
  cycleSidebar,
  flushSaves,
  loadGenerations,
  openLibrary,
  openProject,
  refreshAccount,
  setSettingsOpen,
  toast,
  toggleHistory,
  useStore,
} from './store';

/** 보고 있던 작업, 없으면 마지막으로 연 작업. */
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

/** 사이드바 순서 */
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

async function refreshView(): Promise<void> {
  const { view } = useStore.getState();
  const projectId =
    view.kind === 'project' ? view.projectId : view.kind === 'free' ? FREE_PROJECT_ID : undefined;
  await Promise.all([projectId && loadGenerations(projectId), refreshAccount()]);
  toast('새로 고쳤습니다.');
}

/**
 * 창 단위 단축키(F11, Ctrl +/-/0·휠 확대, Ctrl+W)는 메인 프로세스가 처리한다. 대화상자가 열려 있으면 화면 이동은 하지 않고, Anlas를 쓰는 동작에는 단축키를 두지
 * 않는다.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const dialogOpen = Boolean(document.querySelector('.modal-backdrop'));
      const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
      const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      const key = event.key;
      const typing = (event.target as HTMLElement | null)?.closest?.(
        'input, textarea, select, [contenteditable="true"]',
      );
      let action: (() => void) | undefined;

      // 글을 쓰는 중이면 숫자는 그대로 입력된다.
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1];
      if (plain && digit && !typing) {
        if (digit === '1') action = openLastProject;
        const section = SECTIONS.find((item) => item.shortcut === digit);
        if (section) action = () => openLibrary(section.id);
      }
      if (plain && key === 'F1') action = () => setSettingsOpen(true, 'keys');
      if (plain && key === 'F2') action = requestRename;
      if (plain && key === 'F5') action = () => void refreshView();
      if (plain && key === 'F7') action = toggleHistory;
      if (ctrl && key === 'Tab') action = () => cycleProject(event.shiftKey ? -1 : 1);
      if (ctrl && !event.shiftKey && key.toLowerCase() === 'n')
        action = () => void openDialog((close) => <NewProjectDialog close={close} />);
      if (ctrl && !event.shiftKey && key.toLowerCase() === 'o')
        action = () => void importJsonFromPicker();
      if (ctrl && !event.shiftKey && key === ',') action = () => setSettingsOpen(true);
      if (ctrl && !event.shiftKey && key.toLowerCase() === 'b') action = cycleSidebar;
      if (ctrl && !event.shiftKey && key.toLowerCase() === 'g' && !typing)
        action = () => void groupFromShortcut();
      if (dialogOpen) action = undefined;

      // 찾기는 입력칸·열린 창 안에서도 연다.
      if (ctrl && !event.shiftKey && (key.toLowerCase() === 'f' || key.toLowerCase() === 'h'))
        action = () => openFind(key.toLowerCase() === 'h');

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

  // 캔버스·이미지 보기가 막은 휠은 건너뛴다. 터치패드는 작은 값이 잦게 오므로 휠 한 칸만큼 모일 때마다 한 단계.
  useEffect(() => {
    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.defaultPrevented) return;
      event.preventDefault();
      pending += event.deltaY;
      if (Math.abs(pending) < 50) return;
      appApi().zoomWindow(pending < 0 ? 'in' : 'out');
      pending = 0;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

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
