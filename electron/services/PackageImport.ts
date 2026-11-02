import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { GenerationRecord } from '../../src/core/domain/types';
import type { PackageResultsImport, PackageResultsRequest } from '../../src/shared/ipc';
import { atomicWrite, uniquePath } from './fsUtils';
import { localDate } from './GenerationOutput';
import { makeThumbnail } from './Images';
import type { Library } from './Library';
import { readTarEntry, readTarIndex } from './TarFile';

type PackageStore = Pick<
  Library,
  'projectDir' | 'emotionOutputDir' | 'toProjectRelative' | 'addGenerations'
>;

export async function readPackageManifest(filePath: string): Promise<string> {
  const entry = (await readTarIndex(filePath)).get('project.json');
  if (!entry) throw new Error('작업 묶음이 아닙니다: project.json이 없습니다.');
  return (await readTarEntry(filePath, entry)).toString('utf8');
}

/** 결과 ID는 새로 받는다. 같은 묶음을 두 번 가져와도 다른 작업의 결과와 ID가 겹치지 않는다. */
export async function importPackageResults(
  store: PackageStore,
  request: PackageResultsRequest,
): Promise<PackageResultsImport> {
  const index = await readTarIndex(request.path);
  const { projectId } = request;
  const idMap = Object.fromEntries(request.records.map((record) => [record.id, randomUUID()]));
  const relative = (absolute: string) => store.toProjectRelative(projectId, absolute);
  const added: GenerationRecord[] = [];
  const imported: Record<string, string> = {};
  for (const record of request.records) {
    const entry = index.get(record.file);
    if (!entry) continue;
    const data = await readTarEntry(request.path, entry);
    const extension = path.extname(record.file);
    const folder = record.emotionId ? record.emotionName : localDate(record.createdAt);
    const target = await uniquePath(
      store.emotionOutputDir(projectId, record.kind, folder),
      path.basename(record.file, extension),
      extension,
    );
    const id = idMap[record.id];
    imported[record.id] = id;
    const thumb = path.join(store.projectDir(projectId), 'thumbs', `${id}.webp`);
    await atomicWrite(target, data);
    await atomicWrite(thumb, await makeThumbnail(data));
    added.push({
      ...record,
      id,
      projectId,
      file: relative(target),
      thumbFile: relative(thumb),
      canvasFile: undefined,
      inputFile: undefined,
      sourceRecordId: record.sourceRecordId ? idMap[record.sourceRecordId] : undefined,
    });
  }
  await store.addGenerations(projectId, added);
  return { idMap: imported, count: added.length };
}
