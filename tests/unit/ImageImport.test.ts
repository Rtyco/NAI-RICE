import { describe, expect, it } from 'vitest';
import { applyImageImport, type ImportedTags } from '../../src/core/importers/ImageImport';
import type { ImageImportData } from '../../src/core/metadata/NaiMetadata';
import { createDefaultLibrary } from '../../src/core/model/defaults';

const data: ImageImportData = {
  source: 'novelai',
  commonPositive: 'masterpiece, 1girl',
  commonNegative: 'lowres',
  characters: [{ positive: 'silver hair', negative: 'bad hands' }],
  settings: { steps: 23 },
  seed: 42,
  model: 'nai-diffusion-4-5-full-inpainting',
};

const tags: ImportedTags = {
  positive: '1girl',
  negative: 'lowres',
  qualityTags: true,
  qualityLevel: 'standard',
  ucPreset: 'light',
};

const allPreset = {
  positive: true,
  negative: true,
  quality: true,
  uc: true,
  settings: true,
  model: true,
  seed: true,
};

describe('applyImageImport', () => {
  it('새 프리셋·캐릭터·작업을 만들고 원래 라이브러리는 그대로 둬', () => {
    const library = createDefaultLibrary();
    const before = structuredClone(library);
    const result = applyImageImport(
      library,
      { stem: 'image', data, tags },
      {
        name: '가져온 설정',
        preset: allPreset,
        character: { index: 0, target: 'new' },
        reference: false,
        newProject: true,
      },
    );
    expect(library).toEqual(before);
    const preset = result.library.presets.at(-1)!;
    expect(preset).toMatchObject({ name: '가져온 설정', commonPositive: '1girl' });
    expect(preset.generation).toMatchObject({
      steps: 23,
      model: 'nai-diffusion-4-5-full-inpainting',
      qualityTags: true,
      ucPreset: 'light',
      seedMode: 'fixed',
      fixedSeed: 42,
    });
    const project = result.library.projects.find((item) => item.id === result.projectId)!;
    expect(project.presetId).toBe(preset.id);
    const character = result.library.characters.find(
      (item) => item.id === project.characters[0].characterId,
    )!;
    expect(character.promptSets[0]).toMatchObject({
      positive: 'silver hair',
      negative: 'bad hands',
    });
    expect(result.applied).toHaveLength(3);
  });

  it('정한 이름을 새로 만드는 항목 전부에 붙이고 덮어쓰는 항목은 그대로 둬', () => {
    const library = createDefaultLibrary();
    const desk = {
      characterName: '원래 캐릭터',
      presetName: '원래 설정',
      promptSet: { name: '교복' },
      emotion: { name: '기쁨', prompt: 'smile' },
    };
    const result = applyImageImport(
      library,
      { stem: 'image', data: { ...data, desk } as ImageImportData, tags },
      {
        name: '  리코  ',
        preset: allPreset,
        character: { index: 0, target: 'new' },
        emotion: { target: 'new' },
        reference: true,
        newProject: true,
      },
    );
    const added = <T extends { id: string }>(before: T[], after: T[]) =>
      after.filter((item) => !before.some((old) => old.id === item.id));
    const next = result.library;
    expect(added(library.presets, next.presets).map((item) => item.name)).toEqual(['리코']);
    const [character] = added(library.characters, next.characters);
    expect(character.name).toBe('리코');
    expect(character.promptSets[0].name).toBe('교복');
    expect(added(library.emotionSets, next.emotionSets).map((item) => item.name)).toEqual(['리코']);
    expect(added(library.references, next.references).map((item) => item.name)).toEqual(['리코']);
    expect(added(library.projects, next.projects).map((item) => item.name)).toEqual(['리코']);

    // 기존 캐릭터에 세트로 추가하면 캐릭터 이름은 두고 새 세트에 이름을 붙인다.
    const existing = next.characters.find((item) => item.id === character.id)!;
    const second = applyImageImport(
      next,
      { stem: 'image', data, tags },
      {
        name: '수영복',
        character: {
          index: 0,
          target: 'add-set',
          character: existing,
          promptSet: existing.promptSets[0],
        },
        reference: false,
        newProject: false,
      },
    );
    const updated = second.library.characters.find((item) => item.id === existing.id)!;
    expect(updated.name).toBe('리코');
    expect(updated.promptSets.map((set) => set.name)).toEqual(['교복', '수영복']);
  });

  it('기존 프리셋을 덮어쓰고 현재 작업에 연결하며 새 레퍼런스를 알려', () => {
    // 연결할 작업이 있는 라이브러리를 먼저 만든다.
    const library = applyImageImport(
      createDefaultLibrary(),
      { stem: 'base', data, tags },
      { reference: false, newProject: true },
    ).library;
    const existing = library.presets[0];
    const project = library.projects[0];
    const result = applyImageImport(
      library,
      { stem: 'image', data, tags, project },
      {
        preset: { ...allPreset, overwrite: existing, positive: false },
        reference: true,
        newProject: false,
      },
    );
    expect(result.library.presets).toHaveLength(library.presets.length);
    const updated = result.library.presets.find((item) => item.id === existing.id)!;
    expect(updated.commonPositive).toBe(existing.commonPositive);
    expect(updated.commonNegative).toBe('lowres');
    expect(result.referenceId).toBeDefined();
    const linked = result.library.projects.find((item) => item.id === project.id)!;
    expect(linked).toMatchObject({ referenceId: result.referenceId, presetId: existing.id });
    expect(result.projectId).toBeUndefined();
  });

  it('모든 캐릭터를 가져오면 캐릭터마다 새로 만들어 순서대로 넣고 위치도 옮겨', () => {
    const result = applyImageImport(
      createDefaultLibrary(),
      {
        stem: 'image',
        data: {
          ...data,
          characters: [
            { positive: 'girl, red hair', negative: '' },
            { positive: 'girl, blue hair', negative: 'hat' },
          ],
          characterCenters: [
            { x: 0.1, y: 0.5 },
            { x: 0.9, y: 0.5 },
          ],
        },
        tags,
      },
      {
        name: '둘',
        character: { index: 'all', target: 'new' },
        reference: false,
        newProject: true,
      },
    );
    const project = result.library.projects.find((item) => item.id === result.projectId)!;
    const names = project.characters.map(
      (slot) => result.library.characters.find((item) => item.id === slot.characterId)?.name,
    );
    expect(names).toEqual(['둘 1', '둘 2']);
    expect(project.positionMode).toBe('manual');
    expect(project.characters[1].center).toEqual({ x: 0.9, y: 0.5 });
    expect(
      result.library.characters.find((item) => item.name === '둘 2')?.promptSets[0].negative,
    ).toBe('hat');
  });
});
