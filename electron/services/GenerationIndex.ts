import { promises as fs } from 'node:fs';
import type { GenerationRecord } from '../../src/core/domain/types';
import { generationIndexSchema } from '../../src/core/validation/schemas';
import { atomicWrite, KeyedMutex } from './fsUtils';

type WriteRecords = (records: GenerationRecord[]) => Promise<void>;

/** 결과마다 수 MB를 다시 읽고 검증하지 않도록, 수정 시각과 크기가 같으면 캐시를 쓴다. 돌려준 배열은 복사본이다. */
export class GenerationIndex {
  private readonly mutex = new KeyedMutex();
  private readonly cache = new Map<
    string,
    { mtimeMs: number; size: number; records: GenerationRecord[] }
  >();

  constructor(private readonly fileOf: (projectId: string) => string) {}

  list(projectId: string): Promise<GenerationRecord[]> {
    return this.mutex.run(projectId, () => this.read(projectId));
  }

  async find(projectId: string, generationId: string): Promise<GenerationRecord> {
    const record = (await this.list(projectId)).find((item) => item.id === generationId);
    if (!record) throw new Error('생성 기록을 찾을 수 없습니다.');
    return record;
  }

  add(record: GenerationRecord): Promise<void> {
    return this.edit(record.projectId, (records, write) => write([...records, record]));
  }

  /** 같은 작업의 다른 읽기·쓰기와 겹치지 않는다. */
  edit<T>(
    projectId: string,
    work: (records: GenerationRecord[], write: WriteRecords) => Promise<T>,
  ): Promise<T> {
    return this.mutex.run(projectId, async () =>
      work(await this.read(projectId), (records) => this.write(projectId, records)),
    );
  }

  private async read(projectId: string): Promise<GenerationRecord[]> {
    const file = this.fileOf(projectId);
    let stat: { mtimeMs: number; size: number };
    try {
      stat = await fs.stat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.cache.delete(projectId);
      return [];
    }
    const cached = this.cache.get(projectId);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size)
      return [...cached.records];
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    const records = (generationIndexSchema.parse(raw).records as GenerationRecord[]).map(
      (record) => ({ ...record, projectId }),
    );
    this.cache.set(projectId, { mtimeMs: stat.mtimeMs, size: stat.size, records });
    return [...records];
  }

  private async write(projectId: string, records: GenerationRecord[]): Promise<void> {
    const file = this.fileOf(projectId);
    await atomicWrite(file, `${JSON.stringify({ schemaVersion: 2, records }, null, 2)}\n`);
    const stat = await fs.stat(file);
    this.cache.set(projectId, { mtimeMs: stat.mtimeMs, size: stat.size, records: [...records] });
  }
}
