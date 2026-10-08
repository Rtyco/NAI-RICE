import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renamedFolder } from '../../electron/services/fsUtils';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'rice-rename-'));

describe('renamedFolder', () => {
  it('moves the legacy folder to the new name with its files', () => {
    const parent = temp();
    mkdirSync(path.join(parent, 'Old Name'));
    writeFileSync(path.join(parent, 'Old Name', 'library.json'), '{"ok":true}');
    const result = renamedFolder(parent, 'NAI RICE', 'Old Name');
    expect(result).toBe(path.join(parent, 'NAI RICE'));
    expect(readFileSync(path.join(result, 'library.json'), 'utf8')).toBe('{"ok":true}');
    expect(existsSync(path.join(parent, 'Old Name'))).toBe(false);
  });

  it('keeps an existing new folder and leaves the legacy one alone', () => {
    const parent = temp();
    mkdirSync(path.join(parent, 'Old Name'));
    mkdirSync(path.join(parent, 'NAI RICE'));
    expect(renamedFolder(parent, 'NAI RICE', 'Old Name')).toBe(path.join(parent, 'NAI RICE'));
    expect(existsSync(path.join(parent, 'Old Name'))).toBe(true);
  });

  it('uses the new name on a fresh install', () => {
    const parent = temp();
    expect(renamedFolder(parent, 'NAI RICE', 'Old Name')).toBe(path.join(parent, 'NAI RICE'));
  });
});
