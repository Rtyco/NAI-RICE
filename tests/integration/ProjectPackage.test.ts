import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { Exporter } from '../../electron/services/Exporter';
import { Library } from '../../electron/services/Library';
import { importPackageResults, readPackageManifest } from '../../electron/services/PackageImport';
import { readTarEntry, readTarIndex, TarWriter } from '../../electron/services/TarFile';
import { parseImportFile } from '../../src/core/backup/Backups';
import type { GenerationRecord } from '../../src/core/domain/types';
import {
  createDefaultLibrary,
  createProject,
  createReference,
} from '../../src/core/model/defaults';

let root: string;
afterEach(() => rm(root, { recursive: true, force: true }));

describe('tar', () => {
  it('한글이나 100바이트를 넘는 이름도 그대로 읽어', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tar-'));
    const file = path.join(root, 'a.tar');
    const names = ['project.json', 'outs/기쁨/첫 장.png', `outs/${'긴이름'.repeat(30)}/b.webp`];
    const writer = await TarWriter.create(file);
    for (const [index, name] of names.entries())
      await writer.add(name, Buffer.alloc(700 + index, index));
    await writer.finish();
    const index = await readTarIndex(file);
    expect([...index.keys()]).toEqual(names);
    const data = await readTarEntry(file, index.get(names[1])!);
    expect([data.length, data[0]]).toEqual([701, 1]);
  });
});

describe('이미지 포함 작업 파일', () => {
  it('고른 결과를 넣어 내보내고, 가져오면 새 ID로 결과와 대표 이미지를 되살려', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'package-'));
    const library = new Library(root);
    await library.load();
    const data = createDefaultLibrary();
    const reference = createReference('레퍼런스');
    data.references.push(reference);
    const set = data.emotionSets[0];
    const emotion = set.emotions[1];
    const project = {
      ...createProject('작업', {
        presetId: data.presets[0].id,
        emotionSetId: set.id,
        referenceId: reference.id,
      }),
      favorites: { [emotion.id]: 'a' },
    };
    data.projects.push(project);
    const png = await sharp({
      create: { width: 32, height: 48, channels: 3, background: '#3366ff' },
    })
      .png()
      .toBuffer();
    const record = (id: string, extra: Partial<GenerationRecord> = {}): GenerationRecord => ({
      id,
      kind: 'inpaint',
      projectId: project.id,
      emotionId: emotion.id,
      emotionName: emotion.name,
      createdAt: '2026-11-01T00:00:00.000Z',
      file: `outputs/inpaint/${emotion.name}/${id}.png`,
      thumbFile: `thumbs/${id}.webp`,
      width: 32,
      height: 48,
      seed: 7,
      variantIndex: 1,
      presetName: '',
      characterName: '',
      promptSetName: '',
      emotionSetName: '',
      referenceName: '',
      prompt: 'smile',
      negativePrompt: '',
      characterPrompt: '',
      characterNegativePrompt: '',
      emotionPrompt: 'smile',
      settings: data.presets[0].generation,
      ...extra,
    });
    for (const item of [record('a'), record('b', { sourceRecordId: 'a' }), record('c')]) {
      const target = path.join(library.projectDir(project.id), item.file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, png);
      await library.addGeneration(item);
    }

    const out = path.join(root, 'out.tar');
    const exporter = new Exporter(library, {
      showSaveDialog: async () => ({ canceled: false, filePath: out }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    });
    await exporter.exportProjectPackage({
      library: data,
      projectId: project.id,
      generationIds: ['a', 'b'],
      imageFormat: 'webp',
      quality: 90,
    });

    const bundle = parseImportFile(await readPackageManifest(out), 'out.tar', data.presets[0].id);
    const results = bundle.results!;
    expect(results.records.map((item) => [item.id, item.file])).toEqual([
      ['a', `results/outputs/inpaint/${emotion.name}/a.webp`],
      ['b', `results/outputs/inpaint/${emotion.name}/b.webp`],
    ]);
    expect(results.projectId).toBe(bundle.projects[0].id);
    expect(results.favorites).toEqual({ [emotion.id]: 'a' });

    const imported = await importPackageResults(library, { path: out, ...results });
    expect(imported.count).toBe(2);
    const saved = await library.listGenerations(results.projectId);
    expect(saved.map((item) => item.id)).toEqual([imported.idMap.a, imported.idMap.b]);
    expect(saved[1].sourceRecordId).toBe(imported.idMap.a);
    for (const item of saved) {
      expect(item.projectId).toBe(results.projectId);
      await stat(path.join(library.projectDir(results.projectId), item.file));
      await stat(path.join(library.projectDir(results.projectId), item.thumbFile!));
    }
    expect(
      (
        await sharp(
          await readFile(path.join(library.projectDir(results.projectId), saved[0].file)),
        ).metadata()
      ).format,
    ).toBe('webp');
  });
});
