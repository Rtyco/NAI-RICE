import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OpenImageResult, OpenTextFileResult } from '../../src/shared/ipc';
import { imageMime, MAX_IMPORT_BYTES, toDataUrl } from './fsUtils';
import type { FileDialogs } from './ports';

type PickedFile = { filePath: string; buffer: Buffer };

/** 사용자가 고른 파일을 읽어 렌더러에 넘긴다. 너무 큰 파일은 읽지 않는다. */
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

  async pickJson(title: string): Promise<OpenTextFileResult | null> {
    const picked = await this.pick(
      title,
      { name: 'JSON', extensions: ['json'] },
      '100MB를 초과하는 JSON은 가져올 수 없습니다.',
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
