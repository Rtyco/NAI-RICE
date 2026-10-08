import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  GenerationRecord,
  Library as LibraryData,
  Reference,
} from '../../src/core/domain/types';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import { sanitizeFilenameStem } from '../../src/core/output/OutputFilename';
import { FOLDER_ID, generationIndexSchema, librarySchema } from '../../src/core/validation/schemas';
import type {
  GenerationMeasure,
  LibrarySnapshot,
  PreparedInputs,
  ProjectInspection,
  ProjectUsage,
  StorageUsage,
  ReferenceImages,
  ReferenceImageSave,
} from '../../src/shared/ipc';
import {
  atomicWrite,
  decodeDataUrl,
  directorySize,
  exists,
  fileSize,
  listFiles,
  extensionForMime,
  imageMime,
  assertRealInside,
  KeyedMutex,
  resolveInside,
  sha256,
  toDataUrl,
  toPosix,
} from './fsUtils';
import { migrateV1Workspace } from './LegacyMigration';
import type { ExportSource, GenerationStore, WorkspaceFolders } from './ports';

export type ReferenceImageWrite = Omit<ReferenceImageSave, 'referenceId'>;

const KEEP_BACKUPS = 20;
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

/**
 * 문서 폴더 아래의 전용 작업 폴더.
 *
 * NAI RICE/
 *   library.json                 프리셋·캐릭터·감정 모음·레퍼런스·작업 정보
 *   backups/                     library.json 자동 백업
 *   references/<id>/             레퍼런스 원본·캔버스·마스크
 *   projects/<id>/               generations.json, inputs/, outputs/<감정>/, thumbs/, diagnostic/
 *   exports/
 */
export class Library implements GenerationStore, ExportSource, WorkspaceFolders {
  private readonly mutex = new KeyedMutex();
  /** 작업별로 마지막에 읽거나 쓴 생성 기록과 그때 파일의 수정 시각·크기. */
  private readonly indexCache = new Map<
    string,
    { mtimeMs: number; size: number; records: GenerationRecord[] }
  >();
  /** 마지막으로 읽거나 저장한 라이브러리. 생성 큐가 요청 지연 같은 설정을 읽는다. */
  private latest?: LibraryData;

  constructor(readonly root: string) {}

  get settings(): LibraryData['settings'] | undefined {
    return this.latest?.settings;
  }

  private get libraryFile(): string {
    return path.join(this.root, 'library.json');
  }

  referenceDir(id: string): string {
    if (!FOLDER_ID.test(id)) throw new Error('잘못된 인페인트 ID입니다.');
    return resolveInside(path.join(this.root, 'references'), id);
  }

  projectDir(id: string): string {
    if (!FOLDER_ID.test(id)) throw new Error('잘못된 작업 ID입니다.');
    return resolveInside(path.join(this.root, 'projects'), id);
  }

  resolveProject(projectId: string, relative: string): string {
    return resolveInside(this.projectDir(projectId), relative);
  }

  resolveReference(referenceId: string, relative: string): string {
    return resolveInside(this.referenceDir(referenceId), relative);
  }

  /** 미디어 프로토콜용: 작업 폴더 기준 상대 경로를 절대 경로로. */
  resolveMedia(relative: string): string {
    return resolveInside(this.root, relative);
  }

  /** 링크·정션을 따라가도 작업 폴더 안인지 확인한 뒤 그대로 돌려준다. 읽기·삭제 직전에 쓴다. */
  async verifyReal(absolute: string): Promise<string> {
    await assertRealInside(this.root, absolute);
    return absolute;
  }

  resolveProjectReal(projectId: string, relative: string): Promise<string> {
    return this.verifyReal(this.resolveProject(projectId, relative));
  }

  resolveReferenceReal(referenceId: string, relative: string): Promise<string> {
    return this.verifyReal(this.resolveReference(referenceId, relative));
  }

  // ── 불러오기·저장 ─────────────────────────────────

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

  // ── 레퍼런스 파일 ─────────────────────────────────

  async saveReferenceImages(
    referenceId: string,
    payload: ReferenceImageWrite,
  ): Promise<{ originalFile?: string }> {
    const directory = await this.verifyReal(this.referenceDir(referenceId));
    const canvas = decodeDataUrl(payload.canvasDataUrl);
    const mask = decodeDataUrl(payload.maskDataUrl);
    const writes = [
      atomicWrite(path.join(directory, 'canvas.png'), canvas.buffer),
      atomicWrite(path.join(directory, 'mask.png'), mask.buffer),
    ];
    let originalFile: string | undefined;
    if (payload.originalDataUrl) {
      const original = decodeDataUrl(payload.originalDataUrl);
      originalFile = `original${extensionForMime(original.mimeType)}`;
      for (const entry of await fs.readdir(directory).catch(() => [] as string[])) {
        if (entry.startsWith('original.') && entry !== originalFile)
          await fs.rm(path.join(directory, entry), { force: true });
      }
      writes.push(atomicWrite(path.join(directory, originalFile), original.buffer));
    }
    await Promise.all(writes);
    return { originalFile };
  }

  async readReferenceImages(reference: Reference): Promise<ReferenceImages | null> {
    const image = reference.image;
    if (!image) return null;
    const read = async (relative: string) => {
      const file = await this.resolveReferenceReal(reference.id, relative);
      return toDataUrl(await fs.readFile(file), imageMime(file));
    };
    const [originalDataUrl, canvasDataUrl, maskDataUrl] = await Promise.all([
      read(image.originalFile),
      read(image.canvasFile),
      read(image.maskFile),
    ]);
    return { originalDataUrl, canvasDataUrl, maskDataUrl };
  }

  async copyReferenceFiles(fromId: string, toId: string): Promise<void> {
    const from = await this.verifyReal(this.referenceDir(fromId));
    const to = await this.verifyReal(this.referenceDir(toId));
    if (await exists(from)) await fs.cp(from, to, { recursive: true });
  }

  /**
   * 레퍼런스의 현재 캔버스·마스크를 작업 폴더에 해시 이름으로 복사해 불변 입력으로 만든다.
   * 대기 중에 레퍼런스를 고쳐도 이미 등록한 작업은 원래 입력으로 생성된다.
   */
  async prepareInputs(projectId: string, reference: Reference): Promise<PreparedInputs> {
    const image = reference.image;
    if (!image) throw new Error('인페인트에 참고 이미지가 없습니다.');
    const canvas = await fs.readFile(
      await this.resolveReferenceReal(reference.id, image.canvasFile),
    );
    const mask = await fs.readFile(await this.resolveReferenceReal(reference.id, image.maskFile));
    const imageSha256 = sha256(canvas);
    const maskSha256 = sha256(mask);
    const imagePath = `inputs/${imageSha256}.png`;
    const maskPath = `inputs/${maskSha256}.png`;
    for (const [relative, buffer] of [
      [imagePath, canvas],
      [maskPath, mask],
    ] as const) {
      const target = await this.resolveProjectReal(projectId, relative);
      if (!(await exists(target))) await atomicWrite(target, buffer);
    }
    return { imagePath, maskPath, imageSha256, maskSha256 };
  }

  // ── 생성 기록 ─────────────────────────────────────

  private indexPath(projectId: string): string {
    return path.join(this.projectDir(projectId), 'generations.json');
  }

  /**
   * 생성 기록을 읽는다. 결과가 한 장 생길 때마다 기록 전체(수 MB)를 읽고 검증하던 것을 줄이려고, 파일의
   * 수정 시각과 크기가 그대로면 지난번에 읽은 것을 쓴다. 돌려준 배열은 복사본이라 고쳐도 캐시는 그대로다.
   */
  private async readIndex(projectId: string): Promise<GenerationRecord[]> {
    const file = this.indexPath(projectId);
    let stat: { mtimeMs: number; size: number };
    try {
      stat = await fs.stat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.indexCache.delete(projectId);
      return [];
    }
    const cached = this.indexCache.get(projectId);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size)
      return [...cached.records];
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    const records = (generationIndexSchema.parse(raw).records as GenerationRecord[]).map(
      (record) => ({ ...record, projectId }),
    );
    this.indexCache.set(projectId, { mtimeMs: stat.mtimeMs, size: stat.size, records });
    return [...records];
  }

  private async writeIndex(projectId: string, records: GenerationRecord[]): Promise<void> {
    const file = this.indexPath(projectId);
    await atomicWrite(file, `${JSON.stringify({ schemaVersion: 2, records }, null, 2)}\n`);
    const stat = await fs.stat(file);
    this.indexCache.set(projectId, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      records: [...records],
    });
  }

  listGenerations(projectId: string): Promise<GenerationRecord[]> {
    return this.mutex.run(`index:${projectId}`, () => this.readIndex(projectId));
  }

  addGeneration(record: GenerationRecord): Promise<void> {
    return this.mutex.run(`index:${record.projectId}`, async () => {
      const records = await this.readIndex(record.projectId);
      records.push(record);
      await this.writeIndex(record.projectId, records);
    });
  }

  async findGeneration(projectId: string, generationId: string): Promise<GenerationRecord> {
    const record = (await this.listGenerations(projectId)).find((item) => item.id === generationId);
    if (!record) throw new Error('생성 기록을 찾을 수 없습니다.');
    return record;
  }

  /**
   * 지울 생성 결과(이미지·썸네일·진단 캔버스)를 작업 폴더 안의 `.trash/<시각>` 폴더로 옮기고
   * 기록에서 뺀다. 같은 드라이브 안의 이름 바꾸기라 수천 장도 금방 끝나고, 옮긴 폴더는 휴지통에 한 번에
   * 보낼 수 있다. 옮긴 파일이 없으면 null.
   */
  stageGenerations(projectId: string, generationIds: string[]): Promise<string | null> {
    const targets = new Set(generationIds);
    return this.mutex.run(`index:${projectId}`, async () => {
      const records = await this.readIndex(projectId);
      const removed = records.filter((item) => targets.has(item.id));
      if (!removed.length) return null;
      const staging = await this.moveToStaging(projectId, removed.flatMap(recordFiles));
      await this.writeIndex(
        projectId,
        records.filter((item) => !targets.has(item.id)),
      );
      return staging;
    });
  }

  /** 작업 폴더 기준 상대 경로의 파일을 새 `.trash/<시각>` 폴더로 옮긴다. 옮긴 것이 없으면 null. */
  private async moveToStaging(projectId: string, relatives: string[]): Promise<string | null> {
    if (!relatives.length) return null;
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const staging = this.resolveProject(projectId, `${TRASH_DIR}/${stamp}`);
    let moved = 0;
    for (const relative of relatives) {
      const source = await this.resolveProjectReal(projectId, relative);
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
    const records = (await this.listGenerations(projectId)).filter((item) => targets.has(item.id));
    let bytes = 0;
    for (const relative of records.flatMap(recordFiles))
      bytes += await fileSize(this.resolveProject(projectId, relative));
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
    return this.mutex.run(`index:${projectId}`, async () => {
      const directory = this.projectDir(projectId);
      const records = await this.readIndex(projectId);
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
        if (!(await exists(this.resolveProject(projectId, record.file)))) missing.push(record);
      const report = { orphanFiles: orphans.length, orphanBytes, missingRecords: missing.length };
      if (!fix || (!orphans.length && !missing.length)) return { ...report, staging: null };
      const staging = await this.moveToStaging(projectId, [
        ...orphans,
        ...missing.flatMap(recordFiles),
      ]);
      if (missing.length) {
        const gone = new Set(missing.map((record) => record.id));
        await this.writeIndex(
          projectId,
          records.filter((record) => !gone.has(record.id)),
        );
      }
      return { ...report, staging };
    });
  }

  /** 작업 폴더별 사용량과 레퍼런스·백업·내보내기 폴더 크기. */
  async usage(): Promise<Omit<StorageUsage, 'app'>> {
    const projectsRoot = path.join(this.root, 'projects');
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
      const records = await this.listGenerations(projectId).catch(() => []);
      projects.push({
        projectId,
        records: records.length,
        bytes,
        total: Object.values(bytes).reduce((sum, value) => sum + value, 0),
      });
    }
    return {
      projects,
      references: await directorySize(path.join(this.root, 'references')),
      backups: await directorySize(path.join(this.root, 'backups')),
      exports: await directorySize(path.join(this.root, 'exports')),
    };
  }

  /** 지난번에 휴지통으로 보내지 못하고 남은 `.trash/<시각>` 폴더. */
  async leftoverStaging(): Promise<string[]> {
    const projects = path.join(this.root, 'projects');
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
    const folders = [this.root, path.join(this.root, 'backups')];
    for (const parent of ['projects', 'references']) {
      const directory = path.join(this.root, parent);
      for (const entry of await fs.readdir(directory).catch(() => [] as string[]))
        folders.push(path.join(directory, entry));
    }
    return folders;
  }

  /** 감정별 결과 폴더. 이름이 바뀌면 이후 결과는 새 이름 폴더에 저장된다. */
  emotionOutputDir(projectId: string, emotionName: string): string {
    return path.join(this.projectDir(projectId), 'outputs', sanitizeFilenameStem(emotionName));
  }

  toProjectRelative(projectId: string, absolute: string): string {
    return toPosix(path.relative(this.projectDir(projectId), absolute));
  }
}
