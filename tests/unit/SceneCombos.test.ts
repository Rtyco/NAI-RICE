import { describe, expect, it } from 'vitest';
import type { Emotion, SceneOption } from '../../src/core/domain/types';
import {
  comboPrompts,
  mergeFirstSlot,
  moveScenePromptToSlot,
  recordedScenePrompts,
  sameScenePrompts,
  sceneCombos,
} from '../../src/core/model/sceneCombos';

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
