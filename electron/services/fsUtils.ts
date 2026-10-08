import { createHash, randomUUID } from 'node:crypto';
import { existsSync, promises as fs, renameSync } from 'node:fs';
import path from 'node:path';

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export function sha256(buffer: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function imageMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.avif') return 'image/avif';
  return 'image/png';
}

export function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function decodeDataUrl(value: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw new Error('이미지 데이터 형식을 읽을 수 없습니다.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_IMPORT_BYTES)
    throw new Error('100MB를 초과하는 이미지는 사용할 수 없습니다.');
  return { mimeType: match[1], buffer };
}

export function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/avif') return '.avif';
  return '.png';
}

/** 상대 경로가 root 밖으로 나가지 못하게 막는다. */
export function resolveInside(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const prefix = `${resolvedRoot}${path.sep}`.toLowerCase();
  if (!resolved.toLowerCase().startsWith(prefix)) {
    throw new Error('작업 폴더 외부 경로에는 접근할 수 없습니다.');
  }
  return resolved;
}

/**
 * 심볼릭 링크·정션을 풀었을 때도 target이 root 안에 있는지 확인한다.
 * resolveInside는 경로 문자열만 보므로, 읽거나 지우기 직전에 이것으로 한 번 더 막는다.
 * 아직 없는 경로는 존재하는 가장 가까운 상위 폴더의 실제 위치로 판단한다.
 */
export async function assertRealInside(root: string, target: string): Promise<void> {
  const realRoot = await fs.realpath(root);
  let existing = path.resolve(target);
  const missing: string[] = [];
  let real: string | undefined;
  while (real === undefined) {
    try {
      real = await fs.realpath(existing);
    } catch (error) {
      const parent = path.dirname(existing);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === existing) throw error;
      missing.unshift(path.basename(existing));
      existing = parent;
    }
  }
  resolveInside(realRoot, path.join(real, ...missing));
}

export function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

export async function atomicWrite(filePath: string, contents: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, contents);
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

/** atomicWrite의 임시 파일 이름: `<원래 이름>.<pid>.<uuid>.tmp`. */
const TEMPORARY_FILE = /\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;

/**
 * 앱이 멈추거나 강제로 꺼져 남은 atomicWrite 임시 파일을 지운다. 다른 창이 지금 쓰고 있을 수도 있으니
 * 한동안 손대지 않은 것만 지운다. 지운 바이트 수를 돌려준다.
 */
export async function removeStaleTemporaryFiles(
  directories: string[],
  olderThanMs = 60 * 60 * 1000,
): Promise<number> {
  let removed = 0;
  const cutoff = Date.now() - olderThanMs;
  for (const directory of directories) {
    for (const entry of await fs.readdir(directory).catch(() => [] as string[])) {
      if (!TEMPORARY_FILE.test(entry)) continue;
      const file = path.join(directory, entry);
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile() || stat.mtimeMs > cutoff) continue;
        await fs.rm(file, { force: true });
        removed += stat.size;
      } catch {
        // 다른 프로그램이 잡고 있으면 다음에 다시 시도한다.
      }
    }
  }
  return removed;
}

/** 폴더 안 파일 크기의 합. 링크는 따라가지 않는다. 없으면 0. */
export async function directorySize(directory: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else if (entry.isFile()) total += (await fs.lstat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/** 폴더 안 모든 파일의 상대 경로(`/` 구분). 링크는 따라가지 않는다. */
export async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

export async function fileSize(filePath: string): Promise<number> {
  return (await fs.lstat(filePath).catch(() => ({ size: 0 }))).size;
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function uniquePath(
  directory: string,
  stem: string,
  extension: string,
): Promise<string> {
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? '' : `__${index}`;
    const candidate = path.join(directory, `${stem}${suffix}${extension}`);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('사용 가능한 파일 이름을 만들 수 없습니다.');
}

/** 같은 키에 대한 비동기 작업을 순서대로 실행한다. 인덱스 파일 동시 쓰기를 막는다. */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.tails.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }
}

/**
 * 예전 이름(Reference Inpaint Desk) 때 만든 폴더가 있으면 새 이름으로 옮긴다.
 * 탐색기에서 열려 있는 등으로 옮기지 못하면 예전 폴더를 그대로 써서 데이터를 잃지 않는다.
 */
export function renamedFolder(parent: string, name: string, legacyName: string): string {
  const target = path.join(parent, name);
  const legacy = path.join(parent, legacyName);
  if (existsSync(target) || !existsSync(legacy)) return target;
  try {
    renameSync(legacy, target);
    return target;
  } catch {
    return legacy;
  }
}
