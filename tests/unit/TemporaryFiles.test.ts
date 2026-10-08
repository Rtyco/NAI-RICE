import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeStaleTemporaryFiles } from '../../electron/services/fsUtils';

let root: string;
afterEach(() => rm(root, { recursive: true, force: true }));

describe('removeStaleTemporaryFiles', () => {
  it('removes only old atomicWrite leftovers', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tmpfiles-'));
    const uuid = '45566566-a22f-4b33-9a82-774fc5e6f845';
    const old = `generation-queue-v2.json.10676.${uuid}.tmp`;
    const fresh = `library.json.200.${uuid}.tmp`;
    for (const name of [old, fresh, 'library.json', 'notes.tmp']) {
      await writeFile(path.join(root, name), 'x'.repeat(10));
    }
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(path.join(root, old), twoHoursAgo, twoHoursAgo);
    await utimes(path.join(root, 'notes.tmp'), twoHoursAgo, twoHoursAgo);

    const removed = await removeStaleTemporaryFiles([root, path.join(root, 'missing')]);

    expect(removed).toBe(10);
    expect((await readdir(root)).sort()).toEqual([fresh, 'library.json', 'notes.tmp'].sort());
  });
});
