import { promises as fsp } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Library } from '../../electron/services/Library';
import { createDefaultLibrary } from '../../src/core/model/defaults';

const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** 이전 버전 작업 폴더를 그대로 흉내 낸다. */
async function writeV1(root: string, id = '아리아-abcdef12', name = '아리아') {
  const preset = createDefaultLibrary().presets[0];
  await writeFile(
    path.join(root, 'workspace.json'),
    JSON.stringify({ schemaVersion: 1, presets: [preset], activePresetId: preset.id, emotionTemplates: [] }),
  );
  const dir = path.join(root, 'characters', id);
  await mkdir(path.join(dir, 'reference'), { recursive: true });
  await mkdir(path.join(dir, 'outputs'), { recursive: true });
  await writeFile(path.join(dir, 'reference', 'original.png'), 'ORIGINAL');
  await writeFile(path.join(dir, 'reference', 'canvas.png'), 'CANVAS');
  await writeFile(path.join(dir, 'reference', 'mask.png'), 'MASK');
  await writeFile(path.join(dir, 'outputs', 'result.png'), 'RESULT');
  await writeFile(
    path.join(dir, 'character.json'),
    JSON.stringify({
      schemaVersion: 1,
      id,
      name,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      promptSets: [{ id: 'ps', name: '기본', positive: 'silver hair', negative: '' }],
      activePromptSetId: 'ps',
      emotions: [{ id: 'e1', name: '기쁨', prompt: 'smile', enabled: true }],
      reference: {
        originalFile: 'reference/original.png',
        canvasFile: 'reference/canvas.png',
        maskFile: 'reference/mask.png',
        originalName: 'a.png',
        canvasWidth: 1216,
        canvasHeight: 832,
        layout: {
          mode: 'auto',
          resolution: '1216x832',
          width: 1216,
          height: 832,
          referenceSide: 'left',
          referenceRatio: 0.5,
          fit: 'contain',
          background: '#ffffff',
        },
        referenceRect: { x: 0, y: 0, width: 608, height: 832 },
        outputRect: { x: 608, y: 0, width: 608, height: 832 },
        maskExpansionPx: 8,
        backgroundThreshold: 16,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    }),
  );
  await writeFile(
    path.join(dir, 'generations.json'),
    JSON.stringify({
      schemaVersion: 1,
      records: [
        {
          id: 'g1',
          characterId: id,
          emotionId: 'e1',
          emotionName: '기쁨',
          createdAt: '2026-01-01T00:00:00.000Z',
          file: 'outputs/result.png',
          width: 608,
          height: 832,
          seed: 1,
          variantIndex: 1,
          presetName: 'P',
          promptSetName: '기본',
          prompt: 'p',
          negativePrompt: 'n',
          characterPrompt: 'c',
          characterNegativePrompt: '',
          emotionPrompt: 'smile',
          settings: preset.generation,
        },
      ],
    }),
  );
}

describe('Library migration', () => {
  it('이전 폴더 구조를 백업한 뒤 작업·레퍼런스 폴더로 옮기고 생성 기록을 이어서 읽어', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'desk-migrate-'));
    temporary.push(root);
    await writeV1(root);

    const library = new Library(root);
    const loaded = await library.load();
    expect(loaded.notices.join()).toContain('새 구조');
    const data = loaded.library;
    expect(data.projects.map((project) => project.id)).toEqual(['아리아-abcdef12']);
    const reference = data.references[0];
    expect(reference.image?.canvasFile).toBe('canvas.png');
    expect(await readFile(library.resolveReference(reference.id, 'canvas.png'), 'utf8')).toBe('CANVAS');

    const records = await library.listGenerations('아리아-abcdef12');
    expect(records[0]).toMatchObject({ projectId: '아리아-abcdef12', emotionId: 'e1' });
    expect(await readFile(library.resolveProject('아리아-abcdef12', records[0].file), 'utf8')).toBe('RESULT');

    const entries = await readdir(root);
    expect(entries).toContain('library.json');
    expect(entries).toContain('workspace.v1-migrated.json');
    expect(entries).not.toContain('characters');
    const backups = await readdir(path.join(root, 'backups'));
    expect(backups.some((name) => name.startsWith('v1-before-migration-'))).toBe(true);

    // 다시 열면 library.json을 그대로 읽고 자동 백업을 남긴다.
    const again = await new Library(root).load();
    expect(again.library.projects).toHaveLength(1);
    expect((await readdir(path.join(root, 'backups'))).some((name) => name.startsWith('library-'))).toBe(true);
  });

  it('중간에 멈춘 이전 이동을 이어서 끝내고 처음 백업을 그대로 둬', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'desk-resume-'));
    temporary.push(root);
    await writeV1(root, 'a-11111111', 'A');
    await writeV1(root, 'b-22222222', 'B');
    // 첫 시도: 백업을 만들고 A만 projects로 옮긴 뒤 멈춘 상태
    const firstBackup = path.join(root, 'backups', 'v1-before-migration-1');
    await mkdir(firstBackup, { recursive: true });
    await cp(path.join(root, 'characters'), path.join(firstBackup, 'characters'), { recursive: true });
    await mkdir(path.join(root, 'projects'), { recursive: true });
    await rename(path.join(root, 'characters', 'a-11111111'), path.join(root, 'projects', 'a-11111111'));

    const loaded = await new Library(root).load();
    expect(loaded.library.projects.map((project) => project.name).sort()).toEqual(['A', 'B']);
    expect((await readdir(path.join(root, 'projects'))).sort()).toEqual(['a-11111111', 'b-22222222']);
    expect(loaded.library.references.every((reference) => reference.image)).toBe(true);
    const backups = (await readdir(path.join(root, 'backups'))).filter((name) => name.startsWith('v1-'));
    expect(backups).toEqual(['v1-before-migration-1']);
  });

  it('폴더 이름 바꾸기가 계속 거부되면 복사로 옮겨', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'desk-locked-'));
    temporary.push(root);
    await writeV1(root);
    const original = fsp.rename.bind(fsp);
    vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
      if (String(from).includes(`${path.sep}characters${path.sep}`)) {
        throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
      }
      return original(from, to);
    });
    const library = new Library(root);
    const loaded = await library.load();
    expect(loaded.library.projects).toHaveLength(1);
    const records = await library.listGenerations('아리아-abcdef12');
    expect(await readFile(library.resolveProject('아리아-abcdef12', records[0].file), 'utf8')).toBe('RESULT');
    expect(await readdir(root)).not.toContain('characters');
  }, 20_000);
});
