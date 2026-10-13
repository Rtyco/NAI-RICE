import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { GenerationRecord } from '../../src/core/domain/types';
import { FOLDER_ID } from '../../src/core/validation/schemas';
import type {
  GenerationMeasure,
  ProjectInspection,
  ProjectUsage,
  StorageUsage,
} from '../../src/shared/ipc';
import { directorySize, exists, fileSize, listFiles, resolveInside } from './fsUtils';
import type { GenerationIndex } from './GenerationIndex';
import type { WorkspacePaths } from './WorkspacePaths';

/** 지울 생성 결과를 휴지통에 보내기 전에 모아 두는 폴더(작업 폴더 기준). */
const TRASH_DIR = '.trash';
/** 생성 기록이 가리키는 파일이 들어 있는 폴더. 점검할 때 이 안에서 고아 파일을 찾는다. */
const RESULT_FOLDERS = ['outputs', 'thumbs', 'diagnostic'];

/** 생성 기록 하나가 가진 파일(이미지·썸네일·진단 캔버스). */
function recordFiles(record: GenerationRecord): string[] {
  return [record.file, record.thumbFile, record.canvasFile].filter((file): file is string =>
    Boolean(file),
  );
}

/** 결과 지우기 전 대기 폴더, 기록과 파일 점검, 저장 공간 사용량, 지난 실행이 남긴 파일. */
export class WorkspaceMaintenance {
  constructor(
    private readonly paths: WorkspacePaths,
    private readonly generations: GenerationIndex,
  ) {}

  /**
   * 지울 생성 결과(이미지·썸네일·진단 캔버스)를 작업 폴더 안의 `.trash/<시각>` 폴더로 옮기고
   * 기록에서 뺀다. 같은 드라이브 안의 이름 바꾸기라 수천 장도 금방 끝나고, 옮긴 폴더는 휴지통에 한 번에
   * 보낼 수 있다. 옮긴 파일이 없으면 null.
   */
  stageGenerations(projectId: string, generationIds: string[]): Promise<string | null> {
    const targets = new Set(generationIds);
    return this.generations.edit(projectId, async (records, write) => {
      const removed = records.filter((item) => targets.has(item.id));
      if (!removed.length) return null;
      const staging = await this.moveToStaging(projectId, removed.flatMap(recordFiles));
      await write(records.filter((item) => !targets.has(item.id)));
      return staging;
    });
  }

  /** 작업 폴더 기준 상대 경로의 파일을 새 `.trash/<시각>` 폴더로 옮긴다. 옮긴 것이 없으면 null. */
  private async moveToStaging(projectId: string, relatives: string[]): Promise<string | null> {
    if (!relatives.length) return null;
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const staging = this.paths.resolveProject(projectId, `${TRASH_DIR}/${stamp}`);
    let moved = 0;
    for (const relative of relatives) {
      const source = await this.paths.resolveProjectReal(projectId, relative);
      const target = resolveInside(staging, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.rename(source, target);
        moved++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (!moved) {
      await fs.rm(staging, { recursive: true, force: true });
      return null;
    }
    return staging;
  }

  /** 고른 생성 결과가 차지하는 장수와 바이트(이미지·썸네일·진단 캔버스). */
  async measureGenerations(projectId: string, generationIds: string[]): Promise<GenerationMeasure> {
    const targets = new Set(generationIds);
    const records = (await this.generations.list(projectId)).filter((item) => targets.has(item.id));
    let bytes = 0;
    for (const relative of records.flatMap(recordFiles))
      bytes += await fileSize(this.paths.resolveProject(projectId, relative));
    return { count: records.length, bytes };
  }

  /**
   * 기록과 파일이 맞는지 본다. 기록 없이 남은 결과 파일(고아)과 이미지가 없어진 기록을 센다.
   * fix면 고아 파일과 없어진 기록의 남은 썸네일·캔버스를 대기 폴더로 옮기고 그 기록을 뺀다.
   */
  inspectProject(
    projectId: string,
    fix = false,
  ): Promise<ProjectInspection & { staging: string | null }> {
    return this.generations.edit(projectId, async (records, write) => {
      const directory = this.paths.projectDir(projectId);
      const referenced = new Set(records.flatMap(recordFiles));
      const orphans: string[] = [];
      for (const folder of RESULT_FOLDERS) {
        for (const file of await listFiles(path.join(directory, folder), folder))
          if (!referenced.has(file)) orphans.push(file);
      }
      let orphanBytes = 0;
      for (const file of orphans) orphanBytes += await fileSize(path.join(directory, file));
      const missing: GenerationRecord[] = [];
      for (const record of records)
        if (!(await exists(this.paths.resolveProject(projectId, record.file))))
          missing.push(record);
      const report = { orphanFiles: orphans.length, orphanBytes, missingRecords: missing.length };
      if (!fix || (!orphans.length && !missing.length)) return { ...report, staging: null };
      const staging = await this.moveToStaging(projectId, [
        ...orphans,
        ...missing.flatMap(recordFiles),
      ]);
      if (missing.length) {
        const gone = new Set(missing.map((record) => record.id));
        await write(records.filter((record) => !gone.has(record.id)));
      }
      return { ...report, staging };
    });
  }

  /** 작업 폴더별 사용량과 레퍼런스·백업·내보내기 폴더 크기. */
  async usage(): Promise<Omit<StorageUsage, 'app'>> {
    const projectsRoot = path.join(this.paths.root, 'projects');
    const projects: ProjectUsage[] = [];
    for (const projectId of await fs.readdir(projectsRoot).catch(() => [] as string[])) {
      if (!FOLDER_ID.test(projectId)) continue;
      const directory = path.join(projectsRoot, projectId);
      if (!(await fs.stat(directory)).isDirectory()) continue;
      const bytes = { outputs: 0, diagnostic: 0, thumbs: 0, inputs: 0, trash: 0, other: 0 };
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        const size = entry.isDirectory() ? await directorySize(full) : await fileSize(full);
        const key = (
          {
            outputs: 'outputs',
            diagnostic: 'diagnostic',
            thumbs: 'thumbs',
            inputs: 'inputs',
            [TRASH_DIR]: 'trash',
          } as const
        )[entry.name as 'outputs'];
        bytes[key ?? 'other'] += size;
      }
      const records = await this.generations.list(projectId).catch(() => []);
      projects.push({
        projectId,
        records: records.length,
        bytes,
        total: Object.values(bytes).reduce((sum, value) => sum + value, 0),
      });
    }
    return {
      projects,
      references: await directorySize(path.join(this.paths.root, 'references')),
      backups: await directorySize(path.join(this.paths.root, 'backups')),
      exports: await directorySize(path.join(this.paths.root, 'exports')),
    };
  }

  /** 지난번에 휴지통으로 보내지 못하고 남은 `.trash/<시각>` 폴더. */
  async leftoverStaging(): Promise<string[]> {
    const projects = path.join(this.paths.root, 'projects');
    const found: string[] = [];
    for (const project of await fs.readdir(projects).catch(() => [] as string[])) {
      const trash = path.join(projects, project, TRASH_DIR);
      for (const entry of await fs.readdir(trash).catch(() => [] as string[]))
        found.push(path.join(trash, entry));
    }
    return found;
  }

  /** atomicWrite가 쓰다가 남긴 임시 파일이 있을 수 있는 폴더. */
  async temporaryFileFolders(): Promise<string[]> {
    const folders = [this.paths.root, path.join(this.paths.root, 'backups')];
    for (const parent of ['projects', 'references']) {
      const directory = path.join(this.paths.root, parent);
      for (const entry of await fs.readdir(directory).catch(() => [] as string[]))
        folders.push(path.join(directory, entry));
    }
    return folders;
  }
}
