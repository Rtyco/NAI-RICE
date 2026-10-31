import path from 'node:path';
import type { QueueSnapshot } from '../../src/core/domain/types';
import type {
  MovedWorkspace,
  WorkspaceLocationInfo,
  WorkspaceMovePlan,
  WorkspaceMoveProgress,
} from '../../src/shared/ipc';
import { exists } from './fsUtils';
import type { DesktopShell, FileDialogs } from './ports';
import {
  copyWorkspace,
  isSameOrInside,
  planMove,
  readLocation,
  writeLocation,
  type WorkspaceLocation,
} from './WorkspaceLocation';

type Dependencies = {
  userData: string;
  root: string;
  defaultRoot: string;
  /** 개발용 임시 데이터 실행은 옮기지 않는다. */
  movable: boolean;
  queue: { getSnapshot(): QueueSnapshot; pause(): Promise<QueueSnapshot> };
  dialog: FileDialogs;
  shell: Pick<DesktopShell, 'trashItem'>;
  progress: (progress: WorkspaceMoveProgress) => void;
  /** 다른 작업 폴더로 서비스를 모두 다시 만들기보다 앱을 다시 시작한다. */
  restart: () => void;
};

export class WorkspaceMover {
  constructor(private readonly deps: Dependencies) {}

  info(): WorkspaceLocationInfo {
    return { root: this.deps.root, defaultRoot: this.deps.defaultRoot, movable: this.deps.movable };
  }

  async pickFolder(): Promise<string | null> {
    const result = await this.deps.dialog.showOpenDialog({
      title: '작업 폴더 위치',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
  }

  plan(folder: string): Promise<WorkspaceMovePlan> {
    if (!this.deps.movable) throw new Error('이 실행에서는 작업 폴더를 옮길 수 없습니다.');
    return planMove(this.deps.root, folder);
  }

  /** 끝나면 앱을 다시 시작한다. */
  async move(folder: string): Promise<void> {
    const plan = await this.plan(folder);
    if (this.deps.queue.getSnapshot().jobs.some((job) => job.status === 'generating'))
      throw new Error(
        '생성 중에는 옮길 수 없습니다. 생성이 끝나거나 큐를 멈춘 뒤 다시 시도하십시오.',
      );
    await this.deps.queue.pause();
    if (plan.mode === 'copy') await copyWorkspace(this.deps.root, plan.root, this.deps.progress);
    const atDefault =
      isSameOrInside(plan.root, this.deps.defaultRoot) &&
      isSameOrInside(this.deps.defaultRoot, plan.root);
    const location: WorkspaceLocation = {
      ...(atDefault ? {} : { root: plan.root }),
      ...(plan.mode === 'copy' ? { previousRoot: this.deps.root } : {}),
    };
    await writeLocation(this.deps.userData, location);
    this.deps.restart();
  }

  moved(): MovedWorkspace | null {
    const { previousRoot } = readLocation(this.deps.userData);
    return previousRoot ? { root: this.deps.root, previousRoot } : null;
  }

  /** 작업 폴더처럼 보이는(library.json이 있는) 이전 폴더만 지운다. */
  async finishMove(trash: boolean): Promise<void> {
    const location = readLocation(this.deps.userData);
    const previous = location.previousRoot;
    if (!previous) return;
    await writeLocation(this.deps.userData, { ...location, previousRoot: undefined });
    if (
      !trash ||
      isSameOrInside(previous, this.deps.root) ||
      isSameOrInside(this.deps.root, previous)
    )
      return;
    if (!(await exists(path.join(previous, 'library.json')))) return;
    await this.deps.shell.trashItem(previous);
  }
}
