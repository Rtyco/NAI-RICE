import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OpenTarget, ProjectInspection } from '../../src/shared/ipc';
import type { DesktopShell, WorkspaceFolders } from './ports';

/** 작업 폴더를 탐색기로 열고, 지울 폴더를 휴지통으로 보낸다. */
export class WorkspaceShell {
  constructor(
    private readonly folders: WorkspaceFolders,
    private readonly shell: DesktopShell,
  ) {}

  async open(target: OpenTarget): Promise<void> {
    let directory = this.folders.root;
    if (target.kind === 'project') directory = this.folders.projectDir(target.projectId);
    if (target.kind === 'outputs')
      directory = path.join(this.folders.projectDir(target.projectId), 'outputs');
    if (target.kind === 'emotion')
      directory = this.folders.emotionOutputDir(target.projectId, target.emotionName);
    if (target.kind === 'reference') directory = this.folders.referenceDir(target.referenceId);
    await fs.mkdir(directory, { recursive: true });
    const error = await this.shell.openPath(directory);
    if (error) throw new Error(error);
  }

  async showGeneration(projectId: string, generationId: string): Promise<void> {
    const record = await this.folders.findGeneration(projectId, generationId);
    this.shell.showItemInFolder(this.folders.resolveProject(projectId, record.file));
  }

  trashReference(referenceId: string): Promise<void> {
    return this.trash(this.folders.referenceDir(referenceId));
  }

  trashProject(projectId: string): Promise<void> {
    return this.trash(this.folders.projectDir(projectId));
  }

  /**
   * 생성 결과를 지운다. 파일을 작업 폴더 안의 대기 폴더로 모은 뒤 휴지통에 한 번에 보낸다(파일마다 보내면
   * 수천 장일 때 몇 분 걸린다). permanent면 휴지통을 거치지 않고 바로 지운다.
   */
  async deleteGenerations(
    projectId: string,
    generationIds: string[],
    permanent = false,
  ): Promise<void> {
    const staging = await this.folders.stageGenerations(projectId, generationIds);
    if (!staging) return;
    if (permanent) {
      await this.folders.verifyReal(staging);
      await fs.rm(staging, { recursive: true, force: true });
      return;
    }
    try {
      await this.trash(staging);
    } catch (error) {
      throw new Error(
        `기록에서는 지웠지만 파일을 휴지통으로 보내지 못했습니다. 파일은 ${staging}에 남아 있고, 다음에 프로그램을 열 때 다시 시도합니다. (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  /** 점검에서 찾은 고아 파일을 휴지통으로 보내고 이미지가 없어진 기록을 뺀다. */
  async repairProject(projectId: string): Promise<ProjectInspection> {
    const { staging, ...report } = await this.folders.inspectProject(projectId, true);
    if (staging) await this.trash(staging);
    return report;
  }

  /** 지난번에 휴지통으로 보내지 못한 대기 폴더를 다시 보낸다. 실패하면 다음 실행 때 또 시도한다. */
  async retryLeftoverTrash(): Promise<void> {
    for (const staging of await this.folders.leftoverStaging()) {
      await this.trash(staging).catch(() => undefined);
    }
  }

  /** 실수로 지워도 복구할 수 있도록 휴지통으로 보낸다. 링크로 작업 폴더 밖을 가리키면 거부한다. */
  private async trash(directory: string): Promise<void> {
    try {
      await fs.access(directory);
    } catch {
      return;
    }
    await this.folders.verifyReal(directory);
    await this.shell.trashItem(directory);
  }
}
