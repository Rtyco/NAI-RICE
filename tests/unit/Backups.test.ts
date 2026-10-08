import { describe, expect, it } from 'vitest';
import {
  BackupImportError,
  exportCharacter,
  exportEmotionSet,
  exportLibrary,
  exportPreset,
  mergeBundle,
  parseImportFile,
} from '../../src/core/backup/Backups';
import { migrateV1 } from '../../src/core/backup/Migration';
import {
  createCharacter,
  createDefaultLibrary,
  createProject,
  createReference,
} from '../../src/core/model/defaults';
import { librarySchema, v1CharacterSchema, v1WorkspaceSchema } from '../../src/core/validation/schemas';

const PRESET_ID = 'fallback-preset';

function v1Character() {
  return v1CharacterSchema.parse({
    schemaVersion: 1,
    id: '아리아-12345678',
    name: '아리아',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    promptSets: [{ id: 'ps1', name: '기본', positive: 'silver hair', negative: '' }],
    activePromptSetId: 'ps1',
    emotions: [
      { id: 'e1', name: '기쁨', prompt: 'smile', enabled: true, favoriteGenerationId: 'g1' },
      { id: 'e2', name: '슬픔', prompt: 'sad', enabled: false },
    ],
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
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  });
}

describe('import files', () => {
  it('개별 항목은 새 ID로 들어와', () => {
    const library = createDefaultLibrary();
    const preset = parseImportFile(JSON.stringify(exportPreset(library.presets[0])), 'p.json', PRESET_ID);
    expect(preset.presets[0].id).not.toBe(library.presets[0].id);
    const character = createCharacter('아리아');
    expect(parseImportFile(JSON.stringify(exportCharacter(character)), 'c.json', PRESET_ID).characters[0].name).toBe('아리아');
    const set = parseImportFile(JSON.stringify(exportEmotionSet(library.emotionSets[0])), 'e.json', PRESET_ID);
    expect(set.emotionSets[0].emotions).toHaveLength(library.emotionSets[0].emotions.length);
  });

  it('전체 백업은 작업의 연결을 새 ID로 다시 맞춰', () => {
    const library = createDefaultLibrary();
    const character = createCharacter('A');
    const reference = createReference('R');
    const project = createProject('P', {
      presetId: library.presets[0].id,
      character,
      emotionSetId: library.emotionSets[0].id,
      referenceId: reference.id,
    });
    const full = { ...library, characters: [character], references: [reference], projects: [project] };
    const bundle = parseImportFile(JSON.stringify(exportLibrary(full, {})), 'all.json', PRESET_ID);
    const restored = bundle.projects[0];
    expect(restored.characterId).toBe(bundle.characters[0].id);
    expect(restored.referenceId).toBe(bundle.references[0].id);
    expect(restored.presetId).toBe(bundle.presets[0].id);
    expect(librarySchema.safeParse(mergeBundle(full, bundle)).success).toBe(true);
  });

  it('이전 형식 캐릭터 백업을 네 가지 항목과 작업으로 나눠', () => {
    const bundle = parseImportFile(
      JSON.stringify({ kind: 'reference-inpaint-character', schemaVersion: 1, exportedAt: 'x', character: v1Character() }),
      'old.json',
      PRESET_ID,
    );
    expect(bundle.characters[0].promptSets[0].positive).toBe('silver hair');
    expect(bundle.emotionSets[0].emotions.map((emotion) => emotion.name)).toEqual(['기쁨', '슬픔']);
    expect(bundle.references[0].image).toBeUndefined();
    expect(bundle.projects[0]).toMatchObject({ presetId: PRESET_ID, excludedEmotionIds: ['e2'], favorites: {} });
  });

  it('SDStudio 파일을 인식하고 모르는 형식은 거부해', () => {
    const sd = { name: 'x', presets: { SDImageGen: [{ frontPrompt: 'a' }] }, scenes: { 기쁨: { slots: [[{ prompt: 'smile' }]] } } };
    const bundle = parseImportFile(JSON.stringify(sd), 'sd.json', PRESET_ID);
    expect(bundle.characters).toHaveLength(1);
    expect(bundle.emotionSets[0].emotions[0].prompt).toBe('smile');
    expect(bundle.presets).toHaveLength(1);
    expect(() => parseImportFile('{"hello":1}', 'x.json', PRESET_ID)).toThrow(BackupImportError);
    expect(() => parseImportFile('{', 'x.json', PRESET_ID)).toThrow(/JSON 문법/);
  });
});

describe('migrateV1', () => {
  it('이전 캐릭터를 작업으로 옮기고 감정 ID·대표 이미지·제외 상태를 유지해', () => {
    const workspace = v1WorkspaceSchema.parse({
      schemaVersion: 1,
      presets: createDefaultLibrary().presets,
      activePresetId: 'missing',
      emotionTemplates: [{ id: 't', name: '템플릿', emotions: [{ name: '중립', prompt: 'neutral' }] }],
    });
    const { library, moves } = migrateV1(workspace, [v1Character()]);
    expect(librarySchema.safeParse(library).success).toBe(true);
    expect(moves).toEqual([{ projectId: '아리아-12345678', referenceId: library.references[0].id }]);
    const project = library.projects[0];
    expect(project).toMatchObject({
      id: '아리아-12345678',
      presetId: workspace.presets[0].id,
      excludedEmotionIds: ['e2'],
      favorites: { e1: 'g1' },
    });
    expect(library.emotionSets.map((set) => set.name)).toEqual(['템플릿', '아리아 감정']);
    expect(library.emotionSets[1].emotions[0].id).toBe('e1');
    expect(library.references[0].image?.canvasFile).toBe('canvas.png');
  });
});

describe('mergeBundle 덮어쓰기', () => {
  it('지정한 항목은 ID·이름을 유지한 채 내용만 바꾸고 작업 연결을 지킨다', () => {
    const library = createDefaultLibrary();
    const character = createCharacter('기존 캐릭터');
    character.promptSets[0] = { ...character.promptSets[0], name: '기본', positive: 'old' };
    const emotionSet = library.emotionSets[0];
    const reference = createReference('R');
    const project = createProject('P', {
      presetId: library.presets[0].id,
      character,
      emotionSetId: emotionSet.id,
      referenceId: reference.id,
    });
    const full = { ...library, characters: [character], references: [reference], projects: [project] };

    const incomingCharacter = createCharacter('가져온 캐릭터');
    incomingCharacter.promptSets[0] = { ...incomingCharacter.promptSets[0], name: '기본', positive: 'new' };
    const firstEmotion = emotionSet.emotions[0];
    const incomingSet = {
      id: 'incoming-set',
      name: '가져온 감정',
      emotions: [
        { id: 'incoming-e1', name: firstEmotion.name, prompt: 'changed' },
        { id: 'incoming-e2', name: '새 감정', prompt: 'added' },
      ],
    };
    const incomingPreset = { ...library.presets[0], id: 'incoming-preset', name: '가져온 설정', commonPositive: 'imported' };
    const bundle = {
      label: 't',
      presets: [incomingPreset],
      characters: [incomingCharacter],
      emotionSets: [incomingSet],
      references: [],
      projects: [],
      pieceSets: [],
      images: {},
      warnings: [],
    };
    const merged = mergeBundle(full, bundle, {
      [incomingPreset.id]: library.presets[0].id,
      [incomingCharacter.id]: character.id,
      [incomingSet.id]: emotionSet.id,
    });

    expect(merged.presets).toHaveLength(library.presets.length);
    expect(merged.presets[0]).toMatchObject({ id: library.presets[0].id, name: library.presets[0].name, commonPositive: 'imported' });
    expect(merged.characters).toHaveLength(1);
    expect(merged.characters[0]).toMatchObject({ id: character.id, name: '기존 캐릭터' });
    expect(merged.characters[0].promptSets[0]).toMatchObject({ id: character.promptSets[0].id, positive: 'new' });
    const set = merged.emotionSets.find((item) => item.id === emotionSet.id)!;
    expect(set.name).toBe(emotionSet.name);
    expect(set.emotions[0]).toMatchObject({ id: firstEmotion.id, prompt: 'changed' });
    expect(set.emotions[1].id).toBe('incoming-e2');
    expect(merged.projects[0]).toMatchObject({
      characterId: character.id,
      promptSetId: character.promptSets[0].id,
      emotionSetId: emotionSet.id,
    });
    expect(librarySchema.safeParse(merged).success).toBe(true);
  });

  it('덮어쓴 캐릭터에 고르던 세트가 없으면 첫 세트로 바꾼다', () => {
    const library = createDefaultLibrary();
    const character = createCharacter('C');
    const reference = createReference('R');
    const project = createProject('P', {
      presetId: library.presets[0].id,
      character,
      emotionSetId: library.emotionSets[0].id,
      referenceId: reference.id,
    });
    const full = { ...library, characters: [character], references: [reference], projects: [project] };
    const incoming = createCharacter('X');
    incoming.promptSets[0] = { ...incoming.promptSets[0], name: '다른 이름' };
    const merged = mergeBundle(
      full,
      { label: 't', presets: [], characters: [incoming], emotionSets: [], references: [], projects: [], pieceSets: [], images: {}, warnings: [] },
      { [incoming.id]: character.id },
    );
    expect(merged.projects[0].promptSetId).toBe(incoming.promptSets[0].id);
  });
});
