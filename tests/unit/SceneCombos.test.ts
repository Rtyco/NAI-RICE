import { describe, expect, it } from 'vitest';
import type { Emotion, SceneOption } from '../../src/core/domain/types';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import {
  comboPrompts,
  defaultOpenIds,
  mergeFirstSlot,
  moveScenePromptToSlot,
  recordedScenePrompts,
  sameScenePrompts,
  sceneCombos,
  sceneRepeatedTags,
} from '../../src/core/model/sceneCombos';
import { librarySchema } from '../../src/core/validation/schemas';

const option = (id: string, prompt: string, characterPrompts: string[] = []): SceneOption => ({
  id,
  prompt,
  characterPrompts,
  enabled: true,
});

const scene = (patch: Partial<Emotion> = {}): Emotion => ({
  id: 'e',
  name: '씬',
  prompt: 'sitting',
  extraPrompts: ['waving'],
  slots: [[option('a', 'morning', ['', 'smile']), option('b', 'night')]],
  ...patch,
});

const allPrompts = (emotion: Emotion) =>
  sceneCombos(emotion).map((combo) => comboPrompts(emotion, combo));

describe('sceneRepeatedTags', () => {
  it('씬 프롬프트와 후보, 다른 칸의 후보끼리 겹친 태그만 센다', () => {
    const repeated = sceneRepeatedTags(
      scene({
        prompt: 'sitting, smile',
        slots: [
          [option('a', 'smile'), option('b', 'night, chair')],
          [option('c', 'chair'), option('d', 'night')],
          [{ ...option('e', 'sitting'), enabled: false }],
        ],
      }),
    );
    expect([...repeated(0)].sort()).toEqual(['chair', 'night', 'smile']);
  });

  it('같은 칸의 후보끼리는 겹치지 않고, 캐릭터 몫은 그 캐릭터 칸과 센다', () => {
    const repeated = sceneRepeatedTags(
      scene({
        prompt: 'smile',
        extraPrompts: ['waving'],
        slots: [[option('a', 'night', ['smile', 'waving']), option('b', 'night')]],
      }),
    );
    expect([...repeated(0)]).toEqual(['smile']);
    expect([...repeated(1)]).toEqual(['waving']);
  });

  it('씬 프롬프트가 공통 쪽이면 첫 캐릭터 몫은 따로 센다', () => {
    const repeated = sceneRepeatedTags(
      scene({ prompt: 'smile', slots: [[option('a', '', ['smile'])]] }),
      true,
    );
    expect(repeated(0).size).toBe(0);
    expect(repeated(-1).size).toBe(0);
  });
});

describe('씬 프롬프트와 조합 칸 1', () => {
  it('칸 1로 옮겨도 만들어지는 프롬프트가 같다', () => {
    const emotion = scene();
    const moved = { ...emotion, ...moveScenePromptToSlot(emotion, 'fixed') };
    expect(moved.prompt).toBe('');
    expect(moved.slots).toHaveLength(2);
    expect(allPrompts(moved)).toEqual(allPrompts(emotion));
  });

  it('후보 하나뿐인 칸 1을 합쳐도 만들어지는 프롬프트가 같다', () => {
    const emotion = scene({ slots: [[option('x', 'outdoors', ['', 'smile'])], ...scene().slots!] });
    const merged = { ...emotion, ...mergeFirstSlot(emotion) };
    expect(merged.prompt).toBe('sitting, outdoors');
    expect(merged.extraPrompts).toEqual(['waving, smile']);
    expect(merged.slots).toHaveLength(1);
    expect(allPrompts(merged)).toEqual(allPrompts(emotion));
  });

  it('후보가 여럿이거나 첫 캐릭터 몫이 있으면 합치지 않는다', () => {
    expect(mergeFirstSlot(scene())).toBeUndefined();
    expect(mergeFirstSlot(scene({ slots: [[option('x', 'a', ['b'])]] }))).toBeUndefined();
  });

  it('옮긴 뒤 다시 합치면 처음으로 돌아온다', () => {
    const emotion = scene();
    const moved = { ...emotion, ...moveScenePromptToSlot(emotion, 'fixed') };
    expect({ ...moved, ...mergeFirstSlot(moved) }).toEqual(emotion);
  });
});

describe('프롬프트 복원', () => {
  const record = {
    emotionPrompt: 'standing',
    emotionExtraPrompts: ['bowing'],
    comboKey: 'a',
    comboOptions: [{ prompt: 'evening', characterPrompts: ['', 'cry'] }],
  };

  it('고른 후보와 캐릭터 칸까지 기록 당시로 돌린다', () => {
    const emotion = scene({
      slots: [[option('a', 'morning', ['', 'smile']), option('b', 'night')]],
    });
    const restored = recordedScenePrompts(emotion, record);
    expect(restored.prompt).toBe('standing');
    expect(restored.extraPrompts).toEqual(['bowing']);
    expect(restored.slots?.[0][0]).toMatchObject({
      prompt: 'evening',
      characterPrompts: ['', 'cry'],
    });
    expect(restored.slots?.[0][1].prompt).toBe('night');
    expect(sameScenePrompts({ ...emotion, ...restored }, restored)).toBe(true);
    expect(sameScenePrompts(emotion, restored)).toBe(false);
  });

  it('지운 후보와 예전 기록에 없는 값은 지금 것을 둔다', () => {
    const emotion = scene({ slots: [[option('b', 'night')]] });
    const restored = recordedScenePrompts(emotion, { emotionPrompt: 'standing', comboKey: 'a' });
    expect(restored.extraPrompts).toEqual(['waving']);
    expect(restored.slots).toEqual(emotion.slots);
  });

  it('끝의 빈 캐릭터 칸은 없는 것과 같다', () => {
    const emotion = scene({ extraPrompts: ['waving', ''] });
    expect(sameScenePrompts(emotion, { ...emotion, extraPrompts: ['waving'] })).toBe(true);
  });
});

describe('씬 상세 조합 후보 펼침', () => {
  const slot = ['a', 'b', 'c'].map((id) => ({
    id,
    prompt: id,
    characterPrompts: [],
    enabled: true,
  }));

  it('설정에 따라 첫 후보만, 모두, 하나도 펼치지 않아', () => {
    expect([...defaultOpenIds(slot, 'first')]).toEqual(['a']);
    expect([...defaultOpenIds(slot, 'all')]).toEqual(['a', 'b', 'c']);
    expect(defaultOpenIds(slot, 'none').size).toBe(0);
    expect(defaultOpenIds([], 'first').size).toBe(0);
  });

  it('예전 설정에는 첫 후보만 펼침이 들어가', () => {
    const library = createDefaultLibrary();
    const parsed = librarySchema.parse({
      ...library,
      settings: { ...library.settings, layout: { focusLevel: 'panels', edgePeek: false } },
    });
    expect(parsed.settings.layout.comboOptions).toBe('first');
  });
});
