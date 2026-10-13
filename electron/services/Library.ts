import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  GenerationRecord,
  Library as LibraryData,
  Reference,
} from '../../src/core/domain/types';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import { librarySchema } from '../../src/core/validation/schemas';
import type {
  GenerationMeasure,
  ImageDataSource,
  ImageInputRequest,
  LibrarySnapshot,
  PreparedImage,
  PreparedInputs,
  PreparedSourceInput,
  ProjectInspection,
  ReferenceImages,
  SourceImageAdd,
  SourceInputRequest,
  StorageUsage,
  StoredSource,
} from '../../src/shared/ipc';
import { atomicWrite, exists, KeyedMutex } from './fsUtils';
import { GenerationIndex } from './GenerationIndex';
import { migrateV1Workspace } from './LegacyMigration';
import type { ExportSource, GenerationStore, WorkspaceFolders } from './ports';
import { ProjectInputs } from './ProjectInputs';
import { StoredFiles, type ReferenceImageWrite } from './StoredFiles';
import { WorkspaceMaintenance } from './WorkspaceMaintenance';
import { WorkspacePaths } from './WorkspacePaths';

const KEEP_BACKUPS = 20;

/**
 * 작업 폴더 전체. library.json 읽기·저장과 백업은 여기서 하고, 나머지는 맡은 객체에 넘긴다. 서비스들은
 * `ports.ts`의 좁은 인터페이스로 이 객체를 받는다.
 */
export class Library
  extends WorkspacePaths
  implements GenerationStore, ExportSource, WorkspaceFolders
{
  private readonly mutex = new KeyedMutex();
  private readonly generations = new GenerationIndex((projectId) =>
    path.join(this.projectDir(projectId), 'generations.json'),
  );
  private readonly files = new StoredFiles(this, this.generations);
  private readonly inputs = new ProjectInputs(this, this.files);
  private readonly maintenance = new WorkspaceMaintenance(this, this.generations);
  /** 마지막으로 읽거나 저장한 라이브러리. 생성 큐가 요청 지연 같은 설정을 읽는다. */
  private latest?: LibraryData;

  get settings(): LibraryData['settings'] | undefined {
    return this.latest?.settings;
  }

  private get libraryFile(): string {
    return path.join(this.root, 'library.json');
  }

  async load(): Promise<LibrarySnapshot> {
    await fs.mkdir(this.root, { recursive: true });
    const notices: string[] = [];
    let library: LibraryData;
    if (await exists(this.libraryFile)) {
      const raw = await fs.readFile(this.libraryFile, 'utf8');
      try {
        library = librarySchema.parse(JSON.parse(raw)) as LibraryData;
      } catch (error) {
        const broken = `${this.libraryFile}.broken-${Date.now()}`;
        await fs.copyFile(this.libraryFile, broken);
        throw new Error(
          `library.json을 읽을 수 없습니다. 원본은 ${path.basename(broken)}로 보관했습니다. backups 폴더의 최근 파일로 복원할 수 있습니다. (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      await this.snapshot(raw);
    } else if (await exists(path.join(this.root, 'workspace.json'))) {
      library = await migrateV1Workspace(this, notices);
    } else {
      library = createDefaultLibrary();
      await this.save(library);
    }
    this.latest = library;
    return { root: this.root, library, notices };
  }

  async save(library: LibraryData): Promise<void> {
    const validated = librarySchema.parse(library) as LibraryData;
    this.latest = validated;
    await this.mutex.run('library', () =>
      atomicWrite(this.libraryFile, `${JSON.stringify(validated, null, 2)}\n`),
    );
  }

  /** 앱을 열 때마다 library.json을 backups/에 남기고 최근 것만 보관한다. */
  private async snapshot(raw: string): Promise<void> {
    const directory = path.join(this.root, 'backups');
    await fs.mkdir(directory, { recursive: true });
    const name = `library-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await atomicWrite(path.join(directory, name), raw);
    const files = (await fs.readdir(directory))
      .filter((file) => /^library-.*\.json$/.test(file))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
      await fs.rm(path.join(directory, old), { force: true });
    }
  }

  saveReferenceImages(
    referenceId: string,
    payload: ReferenceImageWrite,
  ): Promise<{ originalFile?: string }> {
    return this.files.saveReferenceImages(referenceId, payload);
  }

  readReferenceImages(reference: Reference): Promise<ReferenceImages | null> {
    return this.files.readReferenceImages(reference);
  }

  copyReferenceFiles(fromId: string, toId: string): Promise<void> {
    return this.files.copyReferenceFiles(fromId, toId);
  }

  addPicture(dataUrl: string): Promise<{ file: string; width: number; height: number }> {
    return this.files.addPicture(dataUrl);
  }

  readPicture(file: string): Promise<Buffer> {
    return this.files.readPicture(file);
  }

  readVibe(key: string): Promise<Buffer | undefined> {
    return this.files.readVibe(key);
  }

  vibeNames(owner: string): Promise<string[]> {
    return this.files.vibeNames(owner);
  }

  writeVibe(key: string, data: Buffer): Promise<void> {
    return this.files.writeVibe(key, data);
  }

  addSourceImage(request: SourceImageAdd): Promise<StoredSource> {
    return this.files.addSourceImage(request);
  }

  addSourceMask(dataUrl: string): Promise<string> {
    return this.files.addSourceMask(dataUrl);
  }

  deleteSource(file: string): Promise<void> {
    return this.files.deleteSource(file);
  }

  readImageDataUrl(source: ImageDataSource): Promise<string> {
    return this.files.readImageDataUrl(source);
  }

  prepareInputs(projectId: string, reference: Reference): Promise<PreparedInputs> {
    return this.inputs.prepareInputs(projectId, reference);
  }

  prepareAidInput(
    projectId: string,
    file: string,
    kind: 'character' | 'vibe',
  ): Promise<PreparedImage> {
    return this.inputs.prepareAidInput(projectId, file, kind);
  }

  prepareSourceInput(request: SourceInputRequest): Promise<PreparedSourceInput> {
    return this.inputs.prepareSourceInput(request);
  }

  prepareImageInput(request: ImageInputRequest): Promise<PreparedImage> {
    return this.inputs.prepareImageInput(request);
  }

  listGenerations(projectId: string): Promise<GenerationRecord[]> {
    return this.generations.list(projectId);
  }

  addGeneration(record: GenerationRecord): Promise<void> {
    return this.generations.add(record);
  }

  findGeneration(projectId: string, generationId: string): Promise<GenerationRecord> {
    return this.generations.find(projectId, generationId);
  }

  stageGenerations(projectId: string, generationIds: string[]): Promise<string | null> {
    return this.maintenance.stageGenerations(projectId, generationIds);
  }

  measureGenerations(projectId: string, generationIds: string[]): Promise<GenerationMeasure> {
    return this.maintenance.measureGenerations(projectId, generationIds);
  }

  inspectProject(
    projectId: string,
    fix = false,
  ): Promise<ProjectInspection & { staging: string | null }> {
    return this.maintenance.inspectProject(projectId, fix);
  }

  usage(): Promise<Omit<StorageUsage, 'app'>> {
    return this.maintenance.usage();
  }

  leftoverStaging(): Promise<string[]> {
    return this.maintenance.leftoverStaging();
  }

  temporaryFileFolders(): Promise<string[]> {
    return this.maintenance.temporaryFileFolders();
  }
}
