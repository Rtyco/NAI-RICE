import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ImportFilePick, OpenImageResult, OpenTextFileResult } from '../../src/shared/ipc';
import { imageMime, MAX_IMPORT_BYTES, toDataUrl } from './fsUtils';
import type { FileDialogs } from './ports';

type PickedFile = { filePath: string; buffer: Buffer };

/** 너무 큰 파일은 읽지 않는다. */
export class FilePicker {
  constructor(private readonly dialog: FileDialogs) {}

  private async pick(
    title: string,
    filter: { name: string; extensions: string[] },
    tooLarge: string,
  ): Promise<PickedFile | null> {
    const result = await this.dialog.showOpenDialog({
      title,
      properties: ['openFile'],
      filters: [filter],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const buffer = await fs.readFile(filePath);
    if (buffer.length > MAX_IMPORT_BYTES) throw new Error(tooLarge);
    return { filePath, buffer };
  }

  /** 묶음(tar)은 수백 MB일 수 있어 읽지 않고 경로만 돌려준다. */
  async pickImport(title: string): Promise<ImportFilePick | null> {
    const result = await this.dialog.showOpenDialog({
      title,
      properties: ['openFile'],
      filters: [{ name: 'JSON · 작업 묶음', extensions: ['json', 'tar'] }],
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    const name = path.basename(filePath);
    if (/.tar$/i.test(name)) return { path: filePath, name };
    const buffer = await fs.readFile(filePath);
    if (buffer.length > MAX_IMPORT_BYTES)
      throw new Error('100MB를 초과하는 JSON은 가져올 수 없습니다.');
    return { path: filePath, name, text: buffer.toString('utf8') };
  }

  async pickVibe(): Promise<OpenTextFileResult | null> {
    const picked = await this.pick(
      'NovelAI 바이브 파일 선택',
      { name: 'NovelAI 바이브', extensions: ['naiv4vibe', 'naiv4vibeBundle', 'naiv4vibebundle'] },
      '100MB를 초과하는 파일은 가져올 수 없습니다.',
    );
    if (!picked) return null;
    return {
      path: picked.filePath,
      name: path.basename(picked.filePath),
      text: picked.buffer.toString('utf8'),
    };
  }

  async pickImage(): Promise<OpenImageResult | null> {
    const picked = await this.pick(
      '참고 이미지 선택',
      { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] },
      '100MB를 초과하는 이미지는 가져올 수 없습니다.',
    );
    if (!picked) return null;
    const mimeType = imageMime(picked.filePath);
    return {
      path: picked.filePath,
      name: path.basename(picked.filePath),
      mimeType,
      dataUrl: toDataUrl(picked.buffer, mimeType),
    };
  }
}
