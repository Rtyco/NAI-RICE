import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Library } from '../../electron/services/Library';
import { WorkspaceShell } from '../../electron/services/WorkspaceShell';
import type { GenerationRecord } from '../../src/core/domain/types';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import { toGenerationSummary } from '../../src/core/model/generationSummary';

let root: string;
afterEach(() => rm(root, { recursive: true, force: true }));

const PROJECT = 'project-a';

function record(id: string, emotion: string): GenerationRecord {
  return {
    id,
    projectId: PROJECT,
    emotionId: emotion,
    emotionName: emotion,
    createdAt: '2026-10-01T00:00:00.000Z',
    file: `outputs/${emotion}/${id}.png`,
    thumbFile: `thumbs/${id}.webp`,
    canvasFile: `diagnostic/${id}__canvas.png`,
    width: 64,
    height: 64,
    seed: 1,
    variantIndex: 1,
    presetName: '',
    characterName: '',
    promptSetName: '',
    emotionSetName: '',
    referenceName: '',
    prompt: '',
    negativePrompt: '',
    characterPrompt: '',
    characterNegativePrompt: '',
    emotionPrompt: '',
    settings: createDefaultLibrary().presets[0].generation,
  };
}

async function setup() {
  root = await mkdtemp(path.join(os.tmpdir(), 'storage-'));
  const library = new Library(root);
  const project = library.projectDir(PROJECT);
  const write = async (relative: string, bytes: number) => {
    await mkdir(path.dirname(path.join(project, relative)), { recursive: true });
    await writeFile(path.join(project, relative), Buffer.alloc(bytes));
  };
  const records = [record('a', 'smile'), record('b', 'smile'), record('gone', 'cry')];
  for (const item of records.slice(0, 2)) {
    await write(item.file, 100);
    await write(item.thumbFile!, 10);
    await write(item.canvasFile!, 1000);
  }
  // 'gone'은 이미지가 없어졌고 썸네일만 남았다. 기록 없는 파일도 하나 있다.
  await write(records[2].thumbFile!, 10);
  await write('outputs/smile/stray.png', 50);
  await write('inputs/abc.png', 7);
  await writeFile(
    path.join(project, 'generations.json'),
    JSON.stringify({ schemaVersion: 2, records }),
  );
  const trashed: string[] = [];
  const workspace = new WorkspaceShell(library, {
    openPath: async () => '',
    showItemInFolder: () => undefined,
    trashItem: async (item: string) => {
      trashed.push(item);
    },
  });
  return { library, workspace, trashed, project };
}

describe('storage', () => {
  it('measures folders and selected results', async () => {
    const { library } = await setup();
    const usage = await library.usage();
    expect(usage.projects).toHaveLength(1);
    expect(usage.projects[0]).toMatchObject({
      projectId: PROJECT,
      records: 3,
      bytes: { outputs: 250, diagnostic: 2000, thumbs: 30, inputs: 7, trash: 0 },
    });
    expect(await library.measureGenerations(PROJECT, ['a', 'gone'])).toEqual({
      count: 2,
      bytes: 1120,
    });
  });

  it('finds and repairs orphan files and missing images', async () => {
    const { library, workspace, trashed, project } = await setup();
    expect(await library.inspectProject(PROJECT)).toMatchObject({
      orphanFiles: 1,
      orphanBytes: 50,
      missingRecords: 1,
      staging: null,
    });

    const fixed = await workspace.repairProject(PROJECT);
    expect(fixed).toEqual({ orphanFiles: 1, orphanBytes: 50, missingRecords: 1 });
    expect((await library.listGenerations(PROJECT)).map((item) => item.id)).toEqual(['a', 'b']);
    expect(trashed).toHaveLength(1);
    await expect(readFile(path.join(trashed[0], 'outputs/smile/stray.png'))).resolves.toBeTruthy();
    await expect(readFile(path.join(trashed[0], 'thumbs/gone.webp'))).resolves.toBeTruthy();
    await expect(readFile(path.join(project, 'outputs/smile/a.png'))).resolves.toBeTruthy();
    expect(await library.inspectProject(PROJECT)).toMatchObject({
      orphanFiles: 0,
      missingRecords: 0,
    });
  });

  it('reuses the parsed index until the file changes', async () => {
    const { library, project } = await setup();
    const first = await library.listGenerations(PROJECT);
    expect(first).toHaveLength(3);
    // 돌려준 배열을 고쳐도 다음 결과에는 영향이 없다.
    first.pop();
    expect(await library.listGenerations(PROJECT)).toHaveLength(3);

    // 다른 프로그램이 파일을 바꾸면 다시 읽는다.
    const index = path.join(project, 'generations.json');
    await writeFile(index, JSON.stringify({ schemaVersion: 2, records: [record('a', 'smile')] }));
    const later = new Date(Date.now() + 5000);
    await utimes(index, later, later);
    expect((await library.listGenerations(PROJECT)).map((item) => item.id)).toEqual(['a']);
  });

  it('summarizes records for the screen without prompts or settings', () => {
    const full = { ...record('a', 'smile'), prompt: 'masterpiece, '.repeat(200) };
    const summary = toGenerationSummary(full);
    expect(summary).toMatchObject({ id: 'a', emotionId: 'smile', file: full.file, seed: 1 });
    expect(summary.model).toBe(full.settings.model);
    for (const key of [
      'prompt',
      'negativePrompt',
      'characterPrompt',
      'characterNegativePrompt',
      'settings',
    ])
      expect(summary).not.toHaveProperty(key);
  });
});
