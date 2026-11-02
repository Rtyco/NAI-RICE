import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import {
  parsePax,
  parseTarHeader,
  TAR_BLOCK,
  tarEnd,
  tarFileHeader,
  tarPadding,
} from '../../src/core/backup/Tar';

/** 임시 파일에 쓰고 끝나면 이름을 바꾼다. 결과가 수백 MB일 수 있어 한 파일씩 쓴다. */
export class TarWriter {
  private constructor(
    private readonly handle: fs.FileHandle,
    private readonly temporaryPath: string,
    private readonly filePath: string,
  ) {}

  static async create(filePath: string): Promise<TarWriter> {
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    return new TarWriter(await fs.open(temporaryPath, 'w'), temporaryPath, filePath);
  }

  async add(name: string, data: Uint8Array): Promise<void> {
    await this.handle.write(tarFileHeader(name, data.length));
    await this.handle.write(data);
    await this.handle.write(tarPadding(data.length));
  }

  async finish(): Promise<void> {
    await this.handle.write(tarEnd());
    await this.handle.close();
    await fs.rename(this.temporaryPath, this.filePath);
  }

  async abort(): Promise<void> {
    await this.handle.close().catch(() => undefined);
    await fs.rm(this.temporaryPath, { force: true });
  }
}

/** `fill`이 실패하면 쓰던 임시 파일을 지운다. */
export async function writeTar(
  filePath: string,
  fill: (writer: TarWriter) => Promise<void>,
): Promise<void> {
  const writer = await TarWriter.create(filePath);
  try {
    await fill(writer);
    await writer.finish();
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

export type TarEntry = { offset: number; size: number };

/** 이름 → 내용 위치. 내용은 읽지 않고 헤더만 따라간다. */
export async function readTarIndex(filePath: string): Promise<Map<string, TarEntry>> {
  const handle = await fs.open(filePath, 'r');
  const entries = new Map<string, TarEntry>();
  try {
    const { size: total } = await handle.stat();
    const block = new Uint8Array(TAR_BLOCK);
    let offset = 0;
    let longName: string | undefined;
    while (offset + TAR_BLOCK <= total) {
      await handle.read(block, 0, TAR_BLOCK, offset);
      const header = parseTarHeader(block);
      if (!header) break;
      const dataOffset = offset + TAR_BLOCK;
      offset = dataOffset + Math.ceil(header.size / TAR_BLOCK) * TAR_BLOCK;
      if (header.type === 'x' || header.type === 'L') {
        const data = new Uint8Array(header.size);
        await handle.read(data, 0, header.size, dataOffset);
        longName =
          header.type === 'x'
            ? parsePax(data).path
            : new TextDecoder().decode(data).replace(/\0+$/, '');
        continue;
      }
      const name = (longName ?? header.name).replace(/^\.\//, '');
      longName = undefined;
      if (header.type === '0' || header.type === '\0')
        entries.set(name, { offset: dataOffset, size: header.size });
    }
  } finally {
    await handle.close();
  }
  return entries;
}

export async function readTarEntry(filePath: string, entry: TarEntry): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const data = Buffer.alloc(entry.size);
    await handle.read(data, 0, entry.size, entry.offset);
    return data;
  } finally {
    await handle.close();
  }
}
