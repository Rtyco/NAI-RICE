import { exportSDStudioProject } from '../core/backup/SDStudioFiles';
import type { Project } from '../core/domain/types';
import { readableId } from '../core/model/defaults';
import { uniqueName } from '../core/model/mutations';
import { confirmDialog } from './components/dialogStack';
import { openProject, run, toast, updateLibrary, useStore } from './store';
import { fileApi, libraryApi } from './desktop';
import { dropSourceFiles } from './freeImageOps';

/** 생성 결과와 대표 이미지는 가져오지 않는다. */
export function duplicateProject(project: Project): void {
  const library = useStore.getState().library!;
  const name = uniqueName(
    `${project.name} 복사본`,
    library.projects.map((item) => item.name),
  );
  const now = new Date().toISOString();
  const copy: Project = {
    ...structuredClone(project),
    id: readableId(name, 'project'),
    name,
    favorites: {},
    createdAt: now,
    updatedAt: now,
  };
  updateLibrary((current) => ({ ...current, projects: [...current.projects, copy] }));
  openProject(copy.id);
  toast(
    `${name}을(를) 만들었습니다. 같은 생성 설정·캐릭터·씬 모음·인페인트를 사용하며 생성 결과는 따로 쌓입니다.`,
  );
}

export function openProjectFolder(projectId: string): void {
  void run('폴더를 여는 중', () => libraryApi().openInExplorer({ kind: 'project', projectId }));
}

export function exportProjectFile(project: Project, format: 'sdstudio' | 'rice'): void {
  void run('내보내는 중', async () => {
    const library = useStore.getState().library!;
    if (format === 'rice') {
      const saved = await fileApi().exportProject(library, project.id);
      if (saved) toast(`저장했습니다: ${saved}`);
      return;
    }
    const { file, omitted } = exportSDStudioProject(project, library);
    const saved = await fileApi().saveJsonFile(
      file,
      `${project.name} (SD Studio).json`,
      'SD Studio 프로젝트로 내보내기',
    );
    if (saved) toast([`저장했습니다: ${saved}`, ...omitted].join(' '));
  });
}

function sceneImages(projectId: string) {
  const project = useStore.getState().library?.projects.find((item) => item.id === projectId);
  return Object.values(project?.sceneImg2Img ?? {}).map((scene) => scene.image);
}

/** 라이브러리 항목은 그대로 둔다. */
export async function deleteProject(project: Pick<Project, 'id' | 'name'>): Promise<void> {
  const ok = await confirmDialog({
    title: '작업 삭제',
    message: (
      <p>
        <b>{project.name}</b> 작업과 생성 결과를 삭제합니다. 결과 폴더는 Windows 휴지통으로
        이동합니다.
        <br />
        생성 설정·캐릭터·씬 모음·인페인트는 라이브러리에 그대로 남습니다.
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  await run('작업을 삭제하는 중', async () => {
    await libraryApi().deleteProjectFiles(project.id);
    const images = sceneImages(project.id);
    updateLibrary((current) => ({
      ...current,
      projects: current.projects.filter((item) => item.id !== project.id),
    }));
    dropSourceFiles(...images);
    const { view, library } = useStore.getState();
    if (view.kind !== 'project' || view.projectId !== project.id) return;
    const next = library?.projects[0];
    if (next) openProject(next.id);
    else useStore.setState({ view: { kind: 'home' } });
  });
}

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
        생성 설정·캐릭터·씬 모음·인페인트는 라이브러리에 그대로 남습니다.
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
      // 중간에 실패해도 이미 지운 작업은 목록에서 뺀다.
      const images = [...removed].flatMap(sceneImages);
      updateLibrary((current) => ({
        ...current,
        projects: current.projects.filter((item) => !removed.has(item.id)),
      }));
      dropSourceFiles(...images);
      const { view, library } = useStore.getState();
      if (view.kind === 'project' && removed.has(view.projectId)) {
        const next = library?.projects[0];
        if (next) openProject(next.id);
        else useStore.setState({ view: { kind: 'home' } });
      }
    }
  });
}
