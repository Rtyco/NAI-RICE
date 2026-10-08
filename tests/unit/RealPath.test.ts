import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertRealInside, resolveInside } from '../../electron/services/fsUtils';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'rice-realpath-'));

/** 작업 폴더 안에 바깥 폴더를 가리키는 정션(다른 OS에서는 디렉터리 링크)을 만든다. */
function workspaceWithLink() {
  const parent = temp();
  const root = path.join(parent, 'NAI RICE');
  const outside = path.join(parent, 'outside');
  mkdirSync(path.join(root, 'projects', 'p1'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'secret.txt'), 'x');
  writeFileSync(path.join(root, 'projects', 'p1', 'ok.png'), 'x');
  symlinkSync(outside, path.join(root, 'projects', 'linked'), 'junction');
  return { root };
}

describe('assertRealInside', () => {
  it('작업 폴더 안의 실제 경로와 아직 없는 경로는 허용해', async () => {
    const { root } = workspaceWithLink();
    await expect(
      assertRealInside(root, path.join(root, 'projects', 'p1', 'ok.png')),
    ).resolves.toBeUndefined();
    await expect(
      assertRealInside(root, path.join(root, 'projects', 'p1', 'new', 'later.png')),
    ).resolves.toBeUndefined();
  });

  it('문자열 검사는 통과하지만 정션이 바깥을 가리키면 막아', async () => {
    const { root } = workspaceWithLink();
    const viaLink = resolveInside(root, 'projects/linked/secret.txt');
    await expect(assertRealInside(root, viaLink)).rejects.toThrow('작업 폴더 외부');
    await expect(assertRealInside(root, path.join(root, 'projects', 'linked'))).rejects.toThrow(
      '작업 폴더 외부',
    );
    await expect(
      assertRealInside(root, path.join(root, 'projects', 'linked', 'missing', 'x.png')),
    ).rejects.toThrow('작업 폴더 외부');
  });
});
