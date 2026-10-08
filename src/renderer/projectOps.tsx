import type { Project } from '../core/domain/types';
import { confirmDialog } from './components/Dialogs';
import { openProject, run, updateLibrary, useStore } from './store';
import { libraryApi } from './desktop';

/** 작업과 그 생성 결과를 삭제한다. 라이브러리 항목은 그대로 둔다. 작업 화면과 사이드바 우클릭이 함께 쓴다. */
export async function deleteProject(project: Pick<Project, 'id' | 'name'>): Promise<void> {
  const ok = await confirmDialog({
    title: '작업 삭제',
    message: (
      <p>
        <b>{project.name}</b> 작업과 생성 결과를 삭제합니다. 결과 폴더는 Windows 휴지통으로
        이동합니다.
        <br />
        생성 설정·캐릭터·감정 모음·인페인트는 라이브러리에 그대로 남습니다.
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  await run('작업을 삭제하는 중', async () => {
    await libraryApi().deleteProjectFiles(project.id);
    updateLibrary((current) => ({
      ...current,
      projects: current.projects.filter((item) => item.id !== project.id),
    }));
    // 지운 작업을 보고 있었으면 다른 작업(없으면 처음 화면)으로 옮긴다.
    const { view, library } = useStore.getState();
    if (view.kind !== 'project' || view.projectId !== project.id) return;
    const next = library?.projects[0];
    if (next) openProject(next.id);
    else useStore.setState({ view: { kind: 'home' } });
  });
}

/** 여러 작업을 한 번에 삭제한다. 사이드바에서 상자·Ctrl·Shift로 고른 작업에 쓴다. */
export async function deleteProjects(projects: Array<Pick<Project, 'id' | 'name'>>): Promise<void> {
  if (!projects.length) return;
  if (projects.length === 1) return deleteProject(projects[0]);
  const names = projects.slice(0, 5).map((project) => project.name);
  const ok = await confirmDialog({
    title: `작업 ${projects.length}개 삭제`,
    message: (
      <p>
        {names.join(', ')}
        {projects.length > names.length ? ` 외 ${projects.length - names.length}개` : ''} 작업과
        생성 결과를 삭제합니다. 결과 폴더는 Windows 휴지통으로 이동합니다.
        <br />
        생성 설정·캐릭터·감정 모음·인페인트는 라이브러리에 그대로 남습니다.
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  const ids = new Set(projects.map((project) => project.id));
  await run('작업을 삭제하는 중', async () => {
    const removed = new Set<string>();
    try {
      for (const id of ids) {
        await libraryApi().deleteProjectFiles(id);
        removed.add(id);
      }
    } finally {
      // 중간에 실패해도 이미 폴더를 지운 작업은 목록에서 뺀다.
      updateLibrary((current) => ({
        ...current,
        projects: current.projects.filter((item) => !removed.has(item.id)),
      }));
      const { view, library } = useStore.getState();
      if (view.kind === 'project' && removed.has(view.projectId)) {
        const next = library?.projects[0];
        if (next) openProject(next.id);
        else useStore.setState({ view: { kind: 'home' } });
      }
    }
  });
}
