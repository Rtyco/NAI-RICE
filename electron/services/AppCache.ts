import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Session } from 'electron';
import { directorySize, fileSize } from './fsUtils';

/** userData 안에서 Chromium이 쓰는 캐시 폴더. 지워도 다음에 필요하면 다시 만든다. */
const CACHE_FOLDERS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  // 맞춤법 검사 사전. 맞춤법 검사를 끄면 더는 받지 않는다.
  'Dictionaries',
];

/** 앱 캐시와 생성 큐 기록 파일 크기. */
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

  /**
   * 예전에 받은 맞춤법 사전을 지운다. 맞춤법 검사기를 끄기 전 버전이 사전을 열어 둔 채라면 지워지지 않을 수
   * 있는데, 그때는 넘어가고 다음 실행 때 다시 지운다.
   */
  async removeDictionaries(): Promise<void> {
    await fs
      .rm(path.join(this.userData, 'Dictionaries'), { recursive: true, force: true })
      .catch(() => undefined);
  }

  /** HTTP·코드·셰이더 캐시를 비우고 맞춤법 사전을 지운다. 비운 바이트(대략)를 돌려준다. */
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
