import { describe, expect, it } from 'vitest';
import {
  createCharacter,
  createDefaultLibrary,
  createEmotion,
  createEmotionSet,
  createProject,
  createReference,
  projectsUsing,
  resolveProject,
} from '../../src/core/model/defaults';
import {
  addEmotion,
  addPromptSet,
  duplicateEmotion,
  mergeEmotions,
  moveEmotion,
  moveItem,
  removeItemReassigning,
  removePromptSet,
  repairPromptSetRefs,
} from '../../src/core/model/mutations';
import { librarySchema } from '../../src/core/validation/schemas';

function setOf(...names: string[]) {
  return {
    ...createEmotionSet('S', []),
    emotions: names.map((name) => createEmotion(name, name.toLowerCase())),
  };
}

describe('library model', () => {
  it('기본 라이브러리는 스키마를 통과하고 예전 품질 태그 문구 설정은 버려', () => {
    const library = createDefaultLibrary();
    const parsed = librarySchema.parse({
      ...library,
      settings: { ...library.settings, naiTags: { v5: { quality: 'x' } } },
    });
    expect(parsed.settings).not.toHaveProperty('naiTags');
    expect(parsed.settings.requestDelayMs).toBe(300);
    expect(parsed.presets[0].generation).toMatchObject({
      qualityTags: false,
      qualityLevel: 'standard',
      ucPreset: 'none',
    });
  });

  it('네 가지를 섞어 작업을 만들고, 빠진 항목을 알려줘', () => {
    const library = createDefaultLibrary();
    const character = createCharacter('아리아');
    const reference = createReference('아리아 레퍼런스');
    const project = createProject('작업', {
      presetId: library.presets[0].id,
      character,
      emotionSetId: library.emotionSets[0].id,
      referenceId: reference.id,
    });
    const full = {
      ...library,
      characters: [character],
      references: [reference],
      projects: [project],
    };
    expect(resolveProject(full, project).missing).toEqual(['참고 이미지']);
    expect(resolveProject({ ...full, characters: [] }, project).missing).toContain('캐릭터');
    expect(projectsUsing(full, 'emotionSet', library.emotionSets[0].id)).toHaveLength(1);
  });

  it('감정을 추가·복제·이동하고 이름 중복을 피해', () => {
    let set = addEmotion(setOf('기쁨'), '기쁨');
    expect(set.emotions.map((emotion) => emotion.name)).toEqual(['기쁨', '기쁨 2']);
    const duplicated = duplicateEmotion(set, set.emotions[0].id);
    set = duplicated.set;
    expect(set.emotions.map((emotion) => emotion.name)).toEqual(['기쁨', '기쁨 복사본', '기쁨 2']);
    expect(duplicated.copy?.prompt).toBe('기쁨'.toLowerCase());
    set = moveEmotion(set, set.emotions[2].id, 0);
    expect(set.emotions[0].name).toBe('기쁨 2');
  });

  it('감정 병합은 같은 이름을 덮어쓰고 ID를 유지해', () => {
    const set = setOf('기쁨');
    const merged = mergeEmotions(set, [
      { name: '기쁨', prompt: 'new' },
      { name: '슬픔', prompt: 'sad' },
    ]);
    expect(merged.emotions.map((emotion) => [emotion.name, emotion.prompt])).toEqual([
      ['기쁨', 'new'],
      ['슬픔', 'sad'],
    ]);
    expect(merged.emotions[0].id).toBe(set.emotions[0].id);
  });

  it('프롬프트 세트를 지우면 그 세트를 쓰던 작업을 첫 세트로 돌려', () => {
    const library = createDefaultLibrary();
    const added = addPromptSet(createCharacter('A'), '겨울');
    const project = {
      ...createProject('P', {
        presetId: library.presets[0].id,
        character: added.character,
        emotionSetId: library.emotionSets[0].id,
        referenceId: 'r',
      }),
      promptSetId: added.setId,
    };
    const character = removePromptSet(added.character, added.setId);
    const repaired = repairPromptSetRefs(
      { ...library, characters: [character], projects: [project] },
      character,
    );
    expect(repaired.projects[0].promptSetId).toBe(character.promptSets[0].id);
    expect(removePromptSet(character, character.promptSets[0].id).promptSets).toHaveLength(1);
  });
});

describe('removeItemReassigning', () => {
  it('지운 항목을 쓰던 작업을 대체 항목으로 옮긴다', () => {
    const library = createDefaultLibrary();
    const a = createCharacter('A');
    const b = createCharacter('B');
    const reference = createReference('R');
    const project = createProject('P', {
      presetId: library.presets[0].id,
      character: a,
      emotionSetId: library.emotionSets[0].id,
      referenceId: reference.id,
    });
    const full = { ...library, characters: [a, b], references: [reference], projects: [project] };
    const moved = removeItemReassigning(full, 'characters', a.id, b.id);
    expect(moved.characters.map((item) => item.id)).toEqual([b.id]);
    expect(moved.projects[0]).toMatchObject({ characterId: b.id, promptSetId: b.promptSets[0].id });
    const emptied = removeItemReassigning(full, 'characters', a.id);
    expect(emptied.projects[0].characterId).toBe(a.id);
    expect(resolveProject(emptied, emptied.projects[0]).missing.length).toBeGreaterThan(0);
  });

  it('라이브러리 항목 순서를 옮겨', () => {
    const library = createDefaultLibrary();
    const [a, b, c] = ['A', 'B', 'C'].map((name) => createCharacter(name));
    const full = { ...library, characters: [a, b, c] };
    expect(moveItem(full, 'characters', a.id, 2).characters.map((x) => x.name)).toEqual(['B', 'C', 'A']);
    expect(moveItem(full, 'characters', c.id, 0).characters.map((x) => x.name)).toEqual(['C', 'A', 'B']);
    expect(moveItem(full, 'characters', 'nope', 0)).toBe(full);
  });
});
