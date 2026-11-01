import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { Exporter } from '../../electron/services/Exporter';
import { sheetLayout } from '../../src/core/imaging/SceneSheet';

describe('sheetLayout', () => {
  it('왼쪽에서 오른쪽으로 채우고 칸마다 이미지 아래에 이름 줄을 둬', () => {
    const layout = sheetLayout(5, 3, 384, 1.5);
    expect(layout).toMatchObject({ imageHeight: 576, fontSize: 24, labelHeight: 48 });
    expect(layout.cells.map(({ x, y }) => [x, y])).toEqual([
      [16, 16],
      [416, 16],
      [816, 16],
      [16, 656],
      [416, 656],
    ]);
    expect([layout.width, layout.height]).toEqual([1216, 1296]);
  });

  it('씬이 열 수보다 적으면 씬 수만큼만 넓어져', () => {
    expect(sheetLayout(2, 5, 384, 1).width).toBe(sheetLayout(2, 2, 384, 1).width);
  });
});

describe('Exporter.exportSheet', () => {
  let root: string;
  afterEach(() => rm(root, { recursive: true, force: true }));

  const exporterSaving = (filePath: string | undefined) =>
    new Exporter(
      { root } as never,
      {
        showSaveDialog: async () => ({ canceled: !filePath, filePath }),
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      } as never,
    );

  const png = () =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } })
      .png()
      .toBuffer();

  it('고른 파일의 확장자 형식으로 바꿔 저장해', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'sheet-'));
    const target = path.join(root, 'sheet.webp');
    const saved = await exporterSaving(target).exportSheet({
      name: '작업',
      png: new Uint8Array(await png()),
      format: 'png',
      quality: 90,
    });
    expect(saved).toBe(target);
    expect((await sharp(await readFile(target)).metadata()).format).toBe('webp');
  });

  it('저장 창을 닫으면 아무것도 쓰지 않아', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'sheet-'));
    const saved = await exporterSaving(undefined).exportSheet({
      name: '작업',
      png: new Uint8Array(await png()),
      format: 'webp',
      quality: 90,
    });
    expect(saved).toBeNull();
  });
});
