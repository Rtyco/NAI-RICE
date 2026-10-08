import { zipSync } from 'fflate';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Library as LibraryData, Reference } from '../../src/core/domain/types';
import { exportLibrary, exportReference, type ReferenceImagesData } from '../../src/core/backup/Backups';
import { exportFileNames, sanitizeFilenameStem } from '../../src/core/output/OutputFilename';
import type { ExportRequest, ExportResult } from '../../src/shared/ipc';
import { atomicWrite, exists } from './fsUtils';
import { convertImage, formatFromExtension } from './Images';
import type { ExportSource, FileDialogs } from './ports';

const FILTERS = [
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

  /** JSON을 저장 위치를 물어 저장한다. 이름 끝의 .json은 있어도 없어도 된다. */
  async saveJson(data: unknown, name: string, title: string): Promise<string | null> {
    await fs.mkdir(this.exportsDir(), { recursive: true });
    const stem = sanitizeFilenameStem(name.replace(/\.json$/i, ''));
    const result = await this.dialog.showSaveDialog({
      title,
      defaultPath: path.join(this.exportsDir(), `${stem}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await atomicWrite(result.filePath, `${JSON.stringify(data, null, 2)}\n`);
    return result.filePath;
  }

  async saveImageAs(projectId: string, generationId: string, suggestedName: string, quality: number): Promise<string | null> {
    const record = await this.library.findGeneration(projectId, generationId);
    await fs.mkdir(this.exportsDir(), { recursive: true });
    const result = await this.dialog.showSaveDialog({
      title: '이미지 다른 이름으로 저장',
      defaultPath: path.join(this.exportsDir(), `${sanitizeFilenameStem(suggestedName)}.png`),
      filters: FILTERS,
    });
    if (result.canceled || !result.filePath) return null;
    const source = await fs.readFile(await this.library.resolveProjectReal(projectId, record.file));
    await atomicWrite(result.filePath, await convertImage(source, formatFromExtension(result.filePath), quality));
    return result.filePath;
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
      const result = await this.dialog.showSaveDialog({
        title: '감정 이미지 ZIP 저장',
        defaultPath: path.join(this.exportsDir(), `${stem}_${dateStamp()}.zip`),
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) return null;
      const files: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (let index = 0; index < items.length; index += 1) files[names[index]] = [await convert(index), { level: 0 }];
      await atomicWrite(result.filePath, zipSync(files));
      return { path: result.filePath, count: items.length };
    }

    const result = await this.dialog.showOpenDialog({
      title: '감정 이미지를 저장할 폴더 선택',
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
    return images ? { original: images.originalDataUrl, canvas: images.canvasDataUrl, mask: images.maskDataUrl } : undefined;
  }

  async exportReference(reference: Reference): Promise<string | null> {
    return this.saveJson(
      exportReference(reference, await this.imagesOf(reference)),
      `${reference.name}__reference`,
      '인페인트 내보내기',
    );
  }

  /** 라이브러리 전체(레퍼런스 이미지 포함)를 JSON 하나로 백업한다. 생성 결과 이미지는 포함하지 않는다. */
  async exportLibrary(library: LibraryData): Promise<string | null> {
    const images: Record<string, ReferenceImagesData> = {};
    for (const reference of library.references) {
      const data = await this.imagesOf(reference);
      if (data) images[reference.id] = data;
    }
    return this.saveJson(exportLibrary(library, images), `전체백업_${dateStamp()}`, '전체 백업 저장');
  }
}
