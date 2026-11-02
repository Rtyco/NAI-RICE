import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { GenerationRecord } from '../../src/core/domain/types';
import sharp from 'sharp';
import {
  sdStudioMains,
  sdStudioRecord,
  sdStudioResultPath,
} from '../../src/core/importers/SDStudioBackup';
import { readImageMetadata } from '../../src/core/metadata/NaiMetadata';
import type {
  PackageResultsImport,
  PackageResultsRequest,
  SDStudioResultsImport,
  SDStudioResultsRequest,
} from '../../src/shared/ipc';
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

async function decodePixels(bytes: Buffer) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** `outs/<씬>/`의 그림을 그 씬의 결과로 들인다. 생성 정보는 그림의 NovelAI 메타데이터(텍스트, 없으면 stealth)에서 읽는다. */
export async function importSDStudioResults(
  store: PackageStore,
  request: SDStudioResultsRequest,
): Promise<SDStudioResultsImport> {
  const index = await readTarIndex(request.path);
  const manifest = index.get('project.json');
  const mains = manifest
    ? sdStudioMains(JSON.parse((await readTarEntry(request.path, manifest)).toString('utf8')))
    : {};
  const { projectId } = request;
  const relative = (absolute: string) => store.toProjectRelative(projectId, absolute);
  // 묶음 순서가 결과 순서가 되도록 1초씩 띄운다.
  const start = Date.now();
  const added: GenerationRecord[] = [];
  const favorites: Record<string, string> = {};
  for (const [name, entry] of index) {
    const found = sdStudioResultPath(name);
    const emotion = found && request.emotions[found.scene];
    if (!found || !emotion) continue;
    const data = await readTarEntry(request.path, entry);
    const extension = path.extname(found.file);
    const target = await uniquePath(
      store.emotionOutputDir(projectId, 'txt2img', emotion.name),
      path.basename(found.file, extension),
      extension,
    );
    const id = randomUUID();
    const thumb = path.join(store.projectDir(projectId), 'thumbs', `${id}.webp`);
    const { width = 0, height = 0 } = await sharp(data).metadata();
    const metadata = await readImageMetadata(data, () => decodePixels(data)).catch(() => null);
    await atomicWrite(target, data);
    await atomicWrite(thumb, await makeThumbnail(data));
    added.push(
      sdStudioRecord(metadata, {
        id,
        projectId,
        emotionId: emotion.id,
        emotionName: emotion.name,
        createdAt: new Date(start + added.length * 1000).toISOString(),
        file: relative(target),
        thumbFile: relative(thumb),
        width,
        height,
        ...request.defaults,
      }),
    );
    if (mains[found.scene] === found.file) favorites[emotion.id] = id;
  }
  await store.addGenerations(projectId, added);
  return { count: added.length, favorites };
}
