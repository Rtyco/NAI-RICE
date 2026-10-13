import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Session } from 'electron';
import { directorySize, fileSize } from './fsUtils';

/** 지워도 필요하면 다시 만든다. */
const CACHE_FOLDERS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  // 맞춤법 검사를 끄면 더는 받지 않는다.
  'Dictionaries',
];

export class AppCache {
  constructor(
    private readonly userData: string,
    private readonly queueFile: string,
    private readonly session: () => Session,
  ) {}

  async usage(): Promise<{ cache: number; queue: number }> {
    let cache = 0;
    for (const folder of CACHE_FOLDERS)
      cache += await directorySize(path.join(this.userData, folder));
    return { cache, queue: await fileSize(this.queueFile) };
  }

  /** 예전 버전이 사전을 열어 둔 채면 지워지지 않아 다음 실행 때 다시 지운다. */
  async removeDictionaries(): Promise<void> {
    await fs
      .rm(path.join(this.userData, 'Dictionaries'), { recursive: true, force: true })
      .catch(() => undefined);
  }

  /** 비운 바이트(대략) */
  async clear(): Promise<number> {
    const before = (await this.usage()).cache;
    const session = this.session();
    await session.clearCache();
    await session.clearCodeCaches({});
    await session.clearStorageData({ storages: ['shadercache'] });
    await this.removeDictionaries();
    const after = (await this.usage()).cache;
    return Math.max(0, before - after);
  }
}
