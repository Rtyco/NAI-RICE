import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { WorkspaceMovePlan, WorkspaceMoveProgress } from '../../src/shared/ipc';
import { atomicWrite, exists } from './fsUtils';

/** userData에 둔다. 작업 폴더 안에 두면 그 폴더를 찾을 수 없을 때 읽지 못한다. */
const LOCATION_FILE = 'workspace-location.json';
const SUBFOLDER = 'NAI RICE';

/** `root`가 없으면 기본 위치. `previousRoot`는 옮긴 뒤 다시 시작해서 지울지 물을 이전 폴더. */
export type WorkspaceLocation = { root?: string; previousRoot?: string };

export function readLocation(userData: string): WorkspaceLocation {
  try {
    const parsed = JSON.parse(readFileSync(path.join(userData, LOCATION_FILE), 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const { root, previousRoot } = parsed as Record<string, unknown>;
    return {
      ...(typeof root === 'string' && root ? { root } : {}),
      ...(typeof previousRoot === 'string' && previousRoot ? { previousRoot } : {}),
    };
  } catch {
    return {};
  }
}

export function writeLocation(userData: string, location: WorkspaceLocation): Promise<void> {
  return atomicWrite(path.join(userData, LOCATION_FILE), `${JSON.stringify(location, null, 2)}\n`);
}

/** Windows 경로는 대소문자를 가리지 않는다. 같은 폴더도 true. */
export function isSameOrInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  const lowered = process.platform === 'win32' ? relative.toLowerCase() : relative;
  return !lowered.startsWith('..') && !path.isAbsolute(lowered);
}

async function isEmptyFolder(folder: string): Promise<boolean> {
  return (await fs.readdir(folder)).length === 0;
}

async function listFiles(root: string): Promise<Array<{ relative: string; size: number }>> {
  const files: Array<{ relative: string; size: number }> = [];
  const walk = async (relative: string) => {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      // 링크·정션은 작업 폴더 밖을 가리킬 수 있어 옮기지 않는다.
      else if (entry.isFile())
        files.push({ relative: child, size: (await fs.stat(path.join(root, child))).size });
    }
  };
  await walk('');
  return files;
}

async function freeBytes(target: string): Promise<number> {
  let folder = path.resolve(target);
  while (!(await exists(folder)) && path.dirname(folder) !== folder) folder = path.dirname(folder);
  const stats = await fs.statfs(folder);
  return stats.bavail * stats.bsize;
}

async function assertWritable(folder: string): Promise<void> {
  const probe = path.join(folder, `.nai-rice-write-test-${process.pid}`);
  try {
    await fs.writeFile(probe, '');
    await fs.rm(probe, { force: true });
  } catch {
    throw new Error(`이 폴더에 쓸 수 없습니다: ${folder}`);
  }
}

/**
 * 고른 폴더가 비었으면 그대로, 아니면 그 안의 `NAI RICE`를 쓴다. library.json이 있으면 그 데이터를 쓴다.
 * 없는 폴더는 부모가 있으면 새로 만든다(확인 때 정한 `NAI RICE`나 지운 기본 위치를 다시 넘겨받는다).
 */
export async function planMove(current: string, picked: string): Promise<WorkspaceMovePlan> {
  let chosen = path.resolve(picked);
  let root = chosen;
  if (!(await exists(chosen))) {
    chosen = path.dirname(chosen);
    if (chosen === root || !(await exists(chosen)))
      throw new Error(`폴더를 찾을 수 없습니다: ${root}`);
  } else if (!(await exists(path.join(chosen, 'library.json'))) && !(await isEmptyFolder(chosen))) {
    root = path.join(chosen, SUBFOLDER);
    if (
      (await exists(root)) &&
      !(await exists(path.join(root, 'library.json'))) &&
      !(await isEmptyFolder(root))
    )
      throw new Error(`「${root}」 폴더가 이미 있고 비어 있지 않습니다.`);
  }
  if (isSameOrInside(root, current) && isSameOrInside(current, root))
    throw new Error('지금 쓰는 작업 폴더입니다.');
  if (isSameOrInside(current, root) || isSameOrInside(root, current))
    throw new Error('작업 폴더 안이나 작업 폴더를 품은 폴더로는 옮길 수 없습니다.');
  await assertWritable(chosen);
  if (await exists(path.join(root, 'library.json'))) return { root, mode: 'existing', bytes: 0 };
  const bytes = (await listFiles(current)).reduce((sum, file) => sum + file.size, 0);
  const free = await freeBytes(root);
  if (free < bytes)
    throw new Error(
      `공간이 부족합니다. 필요 ${Math.ceil(bytes / 2 ** 20)}MB, 남은 공간 ${Math.floor(free / 2 ** 20)}MB`,
    );
  return { root, mode: 'copy', bytes };
}

/** 실패하면 새로 만든 것만 지운다(`to`는 `planMove`가 비었거나 없음을 확인했다). */
export async function copyWorkspace(
  from: string,
  to: string,
  onProgress: (progress: WorkspaceMoveProgress) => void,
): Promise<void> {
  const files = await listFiles(from);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const created = !(await exists(to));
  await fs.mkdir(to, { recursive: true });
  try {
    let copied = 0;
    for (const file of files) {
      const target = path.join(to, file.relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(from, file.relative), target, fs.constants.COPYFILE_EXCL);
      copied += file.size;
      onProgress({ copied, total });
    }
    for (const file of files) {
      const size = (await fs.stat(path.join(to, file.relative))).size;
      if (size !== file.size) throw new Error(`복사한 파일 크기가 다릅니다: ${file.relative}`);
    }
  } catch (error) {
    if (created) await fs.rm(to, { recursive: true, force: true });
    else
      for (const entry of await fs.readdir(to))
        await fs.rm(path.join(to, entry), { recursive: true, force: true });
    throw error;
  }
}
