import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  copyWorkspace,
  isSameOrInside,
  planMove,
  readLocation,
} from '../../electron/services/WorkspaceLocation';
import { WorkspaceMover } from '../../electron/services/WorkspaceMover';
import type { QueueSnapshot } from '../../src/core/domain/types';

let base: string;
afterEach(() => rm(base, { recursive: true, force: true }));

async function workspace() {
  base = await mkdtemp(path.join(os.tmpdir(), 'move-'));
  const root = path.join(base, 'current');
  await mkdir(path.join(root, 'projects', 'p1', 'outputs'), { recursive: true });
  await writeFile(path.join(root, 'library.json'), '{"schemaVersion":2}');
  await writeFile(path.join(root, 'projects', 'p1', 'outputs', 'a.webp'), 'image-bytes');
  const target = path.join(base, 'target');
  await mkdir(target);
  return { root, target };
}

function mover(root: string, jobs: QueueSnapshot['jobs'] = []) {
  const userData = path.join(base, 'userData');
  const trashed: string[] = [];
  let restarted = 0;
  const instance = new WorkspaceMover({
    userData,
    root,
    defaultRoot: path.join(base, 'default'),
    movable: true,
    queue: {
      getSnapshot: () => ({ paused: false, updatedAt: '', jobs }),
      pause: async () => ({ paused: true, updatedAt: '', jobs }),
    },
    dialog: {} as never,
    shell: {
      trashItem: async (item) => {
        trashed.push(item);
      },
    },
    progress: () => undefined,
    restart: () => {
      restarted += 1;
    },
  });
  return { instance, userData, trashed, restarted: () => restarted };
}

describe('작업 폴더 옮기기', () => {
  it('빈 폴더는 그대로, 비어 있지 않은 폴더는 그 안의 NAI RICE를 쓴다', async () => {
    const { root, target } = await workspace();
    expect(await planMove(root, target)).toMatchObject({ root: target, mode: 'copy' });
    await writeFile(path.join(target, 'other.txt'), 'x');
    expect(await planMove(root, target)).toMatchObject({
      root: path.join(target, 'NAI RICE'),
      mode: 'copy',
    });
  });

  it('library.json이 있는 폴더는 복사하지 않고 그 데이터를 쓴다', async () => {
    const { root, target } = await workspace();
    await writeFile(path.join(target, 'library.json'), '{}');
    expect(await planMove(root, target)).toEqual({ root: target, mode: 'existing', bytes: 0 });
  });

  it('지금 폴더, 그 안, 그것을 품은 폴더로는 옮기지 않는다', async () => {
    const { root } = await workspace();
    await expect(planMove(root, root)).rejects.toThrow('지금 쓰는');
    await expect(planMove(root, path.join(root, 'projects'))).rejects.toThrow('작업 폴더 안');
    expect(isSameOrInside(path.join(base, 'A'), path.join(base, 'a', 'b'))).toBe(
      process.platform === 'win32',
    );
  });

  it('복사한 뒤 위치를 적고 다시 시작하며, 다음 시작에 이전 폴더를 휴지통으로 보낸다', async () => {
    const { root, target } = await workspace();
    const first = mover(root);
    await first.instance.move(target);
    expect(await readFile(path.join(target, 'projects', 'p1', 'outputs', 'a.webp'), 'utf8')).toBe(
      'image-bytes',
    );
    expect(readLocation(first.userData)).toEqual({ root: target, previousRoot: root });
    expect(first.restarted()).toBe(1);

    const next = mover(target);
    expect(next.instance.moved()).toEqual({ root: target, previousRoot: root });
    await next.instance.finishMove(true);
    expect(next.trashed).toEqual([root]);
    expect(readLocation(next.userData)).toEqual({ root: target });
  });

  it('비어 있지 않은 폴더를 고르면 확인한 위치(아직 없는 NAI RICE)로 그대로 옮긴다', async () => {
    const { root, target } = await workspace();
    await writeFile(path.join(target, 'other.txt'), 'x');
    const plan = await planMove(root, target);
    const moving = mover(root);
    await moving.instance.move(plan.root);
    expect(readLocation(moving.userData).root).toBe(path.join(target, 'NAI RICE'));
    expect(await readFile(path.join(plan.root, 'library.json'), 'utf8')).toBe(
      '{"schemaVersion":2}',
    );
  });

  it('없는 폴더는 부모 폴더가 있으면 새로 만들어 쓰고, 부모도 없으면 막는다', async () => {
    const { root } = await workspace();
    const fresh = path.join(base, 'new-root');
    expect(await planMove(root, fresh)).toMatchObject({ root: fresh, mode: 'copy' });
    await expect(planMove(root, path.join(base, 'no', 'such'))).rejects.toThrow('찾을 수 없습니다');
  });

  it('생성 중에는 옮기지 않는다', async () => {
    const { root, target } = await workspace();
    const busy = mover(root, [{ status: 'generating' } as QueueSnapshot['jobs'][number]]);
    await expect(busy.instance.move(target)).rejects.toThrow('생성 중');
    expect(busy.restarted()).toBe(0);
  });

  it('복사에 실패하면 새로 만든 것만 지운다', async () => {
    const { root, target } = await workspace();
    await writeFile(path.join(root, 'zz.txt'), 'x');
    let calls = 0;
    await expect(
      copyWorkspace(root, target, () => {
        calls += 1;
        if (calls === 2) throw new Error('디스크 오류');
      }),
    ).rejects.toThrow('디스크 오류');
    expect(await readFile(path.join(root, 'zz.txt'), 'utf8')).toBe('x');
    await expect(readFile(path.join(target, 'library.json'))).rejects.toThrow();
  });
});
