import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Library as LibraryData } from '../../src/core/domain/types';
import { migrateV1 } from '../../src/core/backup/Migration';
import {
  v1CharacterSchema,
  v1WorkspaceSchema,
  type V1Character,
} from '../../src/core/validation/schemas';
import { exists } from './fsUtils';
import type { Library } from './Library';

/**
 * 이전 버전(캐릭터 하나에 모든 것이 묶인 구조)을 새 구조로 옮긴다.
 * 중간에 실패해도 다시 실행하면 이어서 진행한다: 이미 projects/로 옮겨진 캐릭터도 다시 읽고,
 * library.json은 모든 이동이 끝난 뒤에만 쓴다.
 */
export async function migrateV1Workspace(
  library: Library,
  notices: string[],
): Promise<LibraryData> {
  const workspaceFile = path.join(library.root, 'workspace.json');
  const workspace = v1WorkspaceSchema.parse(JSON.parse(await fs.readFile(workspaceFile, 'utf8')));
  const charactersRoot = path.join(library.root, 'characters');
  const projectsRoot = path.join(library.root, 'projects');

  // 옮기기 전에 이전 데이터 전체를 복사해 둔다. 이전 시도에서 만든 백업이 있으면 그것이 가장 완전하므로 다시 만들지 않는다.
  const backupsRoot = path.join(library.root, 'backups');
  const previousBackups = (await fs.readdir(backupsRoot).catch(() => [] as string[])).filter(
    (name) => name.startsWith('v1-before-migration-'),
  );
  if (!previousBackups.length) {
    const backupDir = path.join(backupsRoot, `v1-before-migration-${Date.now()}`);
    await fs.mkdir(backupDir, { recursive: true });
    await fs.copyFile(workspaceFile, path.join(backupDir, 'workspace.json'));
    if (await exists(charactersRoot))
      await fs.cp(charactersRoot, path.join(backupDir, 'characters'), { recursive: true });
  }

  const found = new Map<string, { character: V1Character; directory: string }>();
  for (const root of [projectsRoot, charactersRoot]) {
    for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || found.has(entry.name)) continue;
      const file = path.join(root, entry.name, 'character.json');
      if (!(await exists(file))) continue;
      try {
        const parsed = v1CharacterSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
        found.set(entry.name, {
          character: { ...parsed, id: entry.name },
          directory: path.join(root, entry.name),
        });
      } catch {
        notices.push(`이전 캐릭터 폴더를 읽지 못해 건너뛰었습니다: ${entry.name}`);
      }
    }
  }
  const characters = [...found.values()].map((item) => item.character);
  const { library: migrated, moves } = migrateV1(workspace, characters);

  await fs.mkdir(projectsRoot, { recursive: true });
  const leftovers: string[] = [];
  for (const move of moves) {
    const from = found.get(move.projectId)!.directory;
    const to = library.projectDir(move.projectId);
    if (path.resolve(from) !== path.resolve(to)) {
      const removed = await moveDirectory(from, to);
      if (!removed) leftovers.push(path.basename(from));
    }
    if (move.referenceId) {
      await fs.cp(path.join(to, 'reference'), library.referenceDir(move.referenceId), {
        recursive: true,
      });
    }
  }
  await library.save(migrated);
  await fs
    .rename(workspaceFile, path.join(library.root, 'workspace.v1-migrated.json'))
    .catch(async () => {
      await fs.copyFile(workspaceFile, path.join(library.root, 'workspace.v1-migrated.json'));
      await fs.rm(workspaceFile, { force: true });
    });
  if (!leftovers.length)
    await fs.rm(charactersRoot, { recursive: true, force: true }).catch(() => undefined);
  notices.push(
    `이전 버전 데이터를 새 구조로 옮겼습니다: 캐릭터 ${characters.length}개 → 작업·캐릭터·감정 모음·인페인트.`,
  );
  if (leftovers.length) {
    notices.push(
      `다른 프로그램이 파일을 쓰고 있어 이전 폴더를 지우지 못했습니다(복사는 완료): characters\${leftovers.join(', ')}. 앱을 닫은 뒤 직접 지워도 됩니다.`,
    );
  }
  return migrated;
}

const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

/**
 * 폴더를 옮긴다. Windows에서는 백신 검사·탐색기 미리보기 등이 파일을 잠깐 잡고 있으면 이름 바꾸기가
 * 거부되므로 몇 번 다시 시도하고, 그래도 안 되면 복사한 뒤 원본 삭제를 시도한다.
 * 원본까지 지웠으면 true, 복사만 되고 원본이 남았으면 false.
 */
export async function moveDirectory(from: string, to: string, retries = 5): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await fs.rename(from, to);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!LOCKED.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  await fs.cp(from, to, { recursive: true, force: true });
  try {
    await fs.rm(from, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return true;
  } catch {
    return false;
  }
}
