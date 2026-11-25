import { zipSync } from 'fflate';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Library as LibraryData, Reference } from '../../src/core/domain/types';
import {
  exportLibrary,
  exportProject,
  exportReference,
  projectLibrary,
  type ProjectLibrary,
  type ReferenceImagesData,
} from '../../src/core/backup/Backups';
import { exportFileNames, sanitizeFilenameStem } from '../../src/core/output/OutputFilename';
import type {
  ExportRequest,
  ExportResult,
  PackageImageFormat,
  ProjectPackageRequest,
  SDStudioPackageRequest,
  SheetExportRequest,
} from '../../src/shared/ipc';
import { atomicWrite, exists } from './fsUtils';
import { convertImage, formatFromExtension, toPngWithText } from './Images';
import type { ExportSource, FileDialogs } from './ports';
import { writeTar } from './TarFile';

type FileFilters = Array<{ name: string; extensions: string[] }>;

const FILTERS: FileFilters = [
  { name: 'PNG (메타데이터 유지)', extensions: ['png'] },
  { name: 'WebP', extensions: ['webp'] },
  { name: 'AVIF', extensions: ['avif'] },
];

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

export class Exporter {
  constructor(
    private readonly library: ExportSource,
    private readonly dialog: FileDialogs,
  ) {}

  private exportsDir(): string {
    return path.join(this.library.root, 'exports');
  }

  /** 취소하면 null */
  private async pickSavePath(
    title: string,
    fileName: string,
    filters: FileFilters,
  ): Promise<string | null> {
    await fs.mkdir(this.exportsDir(), { recursive: true });
    const result = await this.dialog.showSaveDialog({
      title,
      defaultPath: path.join(this.exportsDir(), fileName),
      filters,
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  }

  private async packageImage(
    projectId: string,
    file: string,
    format: PackageImageFormat,
    quality: number,
  ): Promise<{ data: Buffer; extension: string }> {
    const source = await fs.readFile(await this.library.resolveProjectReal(projectId, file));
    if (format === 'png') return { data: await toPngWithText(source), extension: '.png' };
    if (format === 'webp')
      return { data: await convertImage(source, 'webp', quality), extension: '.webp' };
    return { data: source, extension: path.extname(file) };
  }

  /** 이름 끝의 .json은 있어도 된다. */
  async saveJson(data: unknown, name: string, title: string): Promise<string | null> {
    const stem = sanitizeFilenameStem(name.replace(/\.json$/i, ''));
    const filePath = await this.pickSavePath(title, `${stem}.json`, [
      { name: 'JSON', extensions: ['json'] },
    ]);
    if (!filePath) return null;
    await atomicWrite(filePath, `${JSON.stringify(data, null, 2)}\n`);
    return filePath;
  }

  async saveText(text: string, name: string, title: string): Promise<string | null> {
    const stem = sanitizeFilenameStem(name.replace(/\.txt$/i, ''));
    const filePath = await this.pickSavePath(title, `${stem}.txt`, [
      { name: '텍스트', extensions: ['txt'] },
    ]);
    if (!filePath) return null;
    await atomicWrite(filePath, `${text}\n`);
    return filePath;
  }

  async saveImageAs(
    projectId: string,
    generationId: string,
    suggestedName: string,
    quality: number,
  ): Promise<string | null> {
    const record = await this.library.findGeneration(projectId, generationId);
    const filePath = await this.pickSavePath(
      '이미지 다른 이름으로 저장',
      `${sanitizeFilenameStem(suggestedName)}.png`,
      FILTERS,
    );
    if (!filePath) return null;
    const source = await fs.readFile(await this.library.resolveProjectReal(projectId, record.file));
    await atomicWrite(filePath, await convertImage(source, formatFromExtension(filePath), quality));
    return filePath;
  }

  async exportSheet(request: SheetExportRequest): Promise<string | null> {
    const filePath = await this.pickSavePath(
      '한 장으로 모은 이미지 저장',
      `${sanitizeFilenameStem(request.name)}_${dateStamp()}.${request.format}`,
      [{ name: request.format.toUpperCase(), extensions: [request.format] }],
    );
    if (!filePath) return null;
    await atomicWrite(
      filePath,
      await convertImage(Buffer.from(request.png), formatFromExtension(filePath), request.quality),
    );
    return filePath;
  }

  async pngOf(projectId: string, generationId: string): Promise<Buffer> {
    const record = await this.library.findGeneration(projectId, generationId);
    return toPngWithText(
      await fs.readFile(await this.library.resolveProjectReal(projectId, record.file)),
    );
  }

  async exportImages(request: ExportRequest): Promise<ExportResult> {
    if (!request.items.length) throw new Error('내보낼 이미지가 없습니다.');
    const records = await this.library.listGenerations(request.projectId);
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = request.items.map((item) => {
      const record = byId.get(item.generationId);
      if (!record) throw new Error(`생성 기록을 찾을 수 없습니다: ${item.name}`);
      return { ...item, record };
    });
    const names = exportFileNames(
      items.map((item) => item.name),
      request.format,
    );
    const stem = sanitizeFilenameStem(request.name);
    await fs.mkdir(this.exportsDir(), { recursive: true });
    const convert = async (index: number) => {
      const source = await fs.readFile(
        await this.library.resolveProjectReal(request.projectId, items[index].record.file),
      );
      return convertImage(source, request.format, request.quality);
    };

    if (request.mode === 'zip') {
      const filePath = await this.pickSavePath('씬 이미지 ZIP 저장', `${stem}_${dateStamp()}.zip`, [
        { name: 'ZIP', extensions: ['zip'] },
      ]);
      if (!filePath) return null;
      const files: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (let index = 0; index < items.length; index += 1)
        files[names[index]] = [await convert(index), { level: 0 }];
      await atomicWrite(filePath, zipSync(files));
      return { path: filePath, count: items.length };
    }

    const result = await this.dialog.showOpenDialog({
      title: '씬 이미지를 저장할 폴더 선택',
      defaultPath: this.exportsDir(),
      buttonLabel: '이 폴더에 저장',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    let target = path.join(result.filePaths[0], `${stem}_${dateStamp()}`);
    for (let suffix = 2; await exists(target); suffix += 1) {
      target = path.join(result.filePaths[0], `${stem}_${dateStamp()}_${suffix}`);
    }
    await fs.mkdir(target, { recursive: true });
    for (let index = 0; index < items.length; index += 1) {
      await atomicWrite(path.join(target, names[index]), await convert(index));
    }
    return { path: target, count: items.length };
  }

  private async imagesOf(reference: Reference): Promise<ReferenceImagesData | undefined> {
    const images = await this.library.readReferenceImages(reference).catch(() => null);
    return images
      ? {
          original: images.originalDataUrl,
          canvas: images.canvasDataUrl,
          mask: images.maskDataUrl,
          ...(images.paintDataUrl ? { paint: images.paintDataUrl } : {}),
        }
      : undefined;
  }

  async exportReference(reference: Reference): Promise<string | null> {
    return this.saveJson(
      exportReference(reference, await this.imagesOf(reference)),
      `${reference.name}__reference`,
      '인페인트 내보내기',
    );
  }

  private async mediaOf(library: ProjectLibrary) {
    const images: Record<string, ReferenceImagesData> = {};
    for (const reference of library.references) {
      const data = await this.imagesOf(reference);
      if (data) images[reference.id] = data;
    }
    const pictures: Record<string, string> = {};
    for (const item of [...library.characterReferences, ...library.vibes]) {
      if (!item.image || pictures[item.image.file]) continue;
      const data = await this.library
        .readImageDataUrl({ kind: 'picture', file: item.image.file })
        .catch(() => undefined);
      if (data) pictures[item.image.file] = data;
    }
    return { images, pictures };
  }

  /** 인페인트 이미지는 포함하고 생성 결과는 뺀다. */
  async exportLibrary(library: LibraryData): Promise<string | null> {
    const { images, pictures } = await this.mediaOf(library);
    return this.saveJson(
      exportLibrary(library, images, pictures),
      `전체백업_${dateStamp()}`,
      '전체 백업 저장',
    );
  }

  /** 결과 기록의 `file`은 묶음 안 경로로 바꾼다. */
  async exportProjectPackage(request: ProjectPackageRequest): Promise<string | null> {
    const part = projectLibrary(request.library, request.projectId);
    const records = await this.library.listGenerations(request.projectId);
    const byId = new Map(records.map((record) => [record.id, record]));
    const picked = request.generationIds.flatMap((id) => byId.get(id) ?? []);
    const pickedIds = new Set(picked.map((record) => record.id));
    const favorites =
      request.library.projects.find((item) => item.id === request.projectId)?.favorites ?? {};
    part.projects[0] = {
      ...part.projects[0],
      favorites: Object.fromEntries(
        Object.entries(favorites).filter(([, id]) => pickedIds.has(id)),
      ),
    };
    const filePath = await this.pickSavePath(
      '작업 내보내기 (이미지 포함)',
      `${sanitizeFilenameStem(part.projects[0].name)}_${dateStamp()}.tar`,
      [{ name: 'NAI RICE 작업 묶음', extensions: ['tar'] }],
    );
    if (!filePath) return null;
    const { images, pictures } = await this.mediaOf(part);
    await writeTar(filePath, async (writer) => {
      const results = [];
      for (const record of picked) {
        const { data, extension } = await this.packageImage(
          request.projectId,
          record.file,
          request.imageFormat,
          request.quality,
        );
        const stem = record.file.slice(0, record.file.length - path.extname(record.file).length);
        const file = `results/${stem}${extension}`;
        await writer.add(file, data);
        results.push({
          ...record,
          file,
          thumbFile: undefined,
          canvasFile: undefined,
          inputFile: undefined,
        });
      }
      const manifest = { ...exportProject(part, images, pictures), results };
      await writer.add('project.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    });
    return filePath;
  }

  /** SD Studio 프로젝트 백업 구성: project.json, outs/<씬 이름>/<파일>. 대표 이미지는 씬의 `mains`. */
  async exportSDStudioPackage(request: SDStudioPackageRequest): Promise<string | null> {
    const records = await this.library.listGenerations(request.projectId);
    const byId = new Map(records.map((record) => [record.id, record]));
    const picked = request.generationIds.flatMap((id) => {
      const record = byId.get(id);
      return record && request.sceneNames[record.emotionId] ? [record] : [];
    });
    const filePath = await this.pickSavePath(
      'SD Studio 프로젝트로 내보내기 (이미지 포함)',
      `${sanitizeFilenameStem(request.name)} (SD Studio)_${dateStamp()}.tar`,
      [{ name: 'SD Studio 프로젝트 백업', extensions: ['tar'] }],
    );
    if (!filePath) return null;
    const scenes = (request.project.scenes ?? {}) as Record<string, Record<string, unknown>>;
    const files = new Map<string, string[]>();
    const exported = new Map<string, string>();
    await writeTar(filePath, async (writer) => {
      for (const record of picked) {
        const scene = request.sceneNames[record.emotionId];
        const { data, extension } = await this.packageImage(
          request.projectId,
          record.file,
          request.imageFormat,
          request.quality,
        );
        const taken = files.get(scene) ?? [];
        const stem = path.basename(record.file, path.extname(record.file));
        let name = `${stem}${extension}`;
        for (let suffix = 2; taken.includes(name); suffix += 1)
          name = `${stem}_${suffix}${extension}`;
        files.set(scene, [...taken, name]);
        exported.set(record.id, name);
        await writer.add(`outs/${scene}/${name}`, data);
      }
      for (const [emotionId, scene] of Object.entries(request.sceneNames)) {
        if (!scenes[scene]) continue;
        const main = exported.get(request.favorites[emotionId] ?? '');
        scenes[scene] = {
          ...scenes[scene],
          imageMap: files.get(scene) ?? [],
          mains: main ? [main] : [],
        };
      }
      await writer.add(
        'project.json',
        Buffer.from(JSON.stringify({ ...request.project, scenes }, null, 2)),
      );
    });
    return filePath;
  }

  async exportProject(library: LibraryData, projectId: string): Promise<string | null> {
    const part = projectLibrary(library, projectId);
    const { images, pictures } = await this.mediaOf(part);
    return this.saveJson(
      exportProject(part, images, pictures),
      part.projects[0].name,
      '작업 내보내기',
    );
  }
}
