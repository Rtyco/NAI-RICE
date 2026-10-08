import { describe, expect, it } from 'vitest';
import {
  importSDStudioProject,
  SDStudioImportError,
} from '../../src/core/importers/SDStudioProjectImporter';

function makeProject(count = 20) {
  return {
    name: '테스트 캐릭터',
    presets: {
      SDImageGen: [
        {
          frontPrompt: '',
          backPrompt: 'masterpiece',
          uc: 'lowres',
          characterPrompts: [
            {
              id: 'character-1',
              prompt: 'blue hair, amber eyes',
              uc: 'bad hands',
              position: { x: 0.5, y: 0.5 },
              enabled: true,
            },
          ],
          steps: 28,
          promptGuidance: 5,
          cfgRescale: 0,
          sampling: 'k_euler_ancestral',
          noiseSchedule: 'karras',
        },
      ],
    },
    scenes: Object.fromEntries([
      ['default', { slots: [] }],
      ...Array.from({ length: count }, (_, index) => [
        `Emotion${index + 1}`,
        { slots: [[{ prompt: `prompt-${index + 1}`, enabled: true }]] },
      ]),
    ]),
  };
}

describe('importSDStudioProject', () => {
  it('default를 빼고 감정과 프롬프트를 새 캐릭터로 변환해', () => {
    const imported = importSDStudioProject(JSON.stringify(makeProject()));
    const { character, emotionSet, preset } = imported;
    expect(character.name).toBe('테스트 캐릭터');
    expect(emotionSet.emotions).toHaveLength(20);
    expect(emotionSet.emotions[0]).toMatchObject({ name: 'Emotion1', prompt: 'prompt-1' });
    expect(preset?.commonPositive).toBe('masterpiece');
    expect(preset?.commonNegative).toBe('lowres');
    expect(preset?.generation.steps).toBe(28);
    expect(character.promptSets).toHaveLength(1);
    expect(character.promptSets[0]).toMatchObject({
      positive: 'blue hair, amber eyes',
      negative: 'bad hands',
    });
  });

  it('감정 수가 20개가 아니어도 경고 없이 가져와', () => {
    const imported = importSDStudioProject(JSON.stringify(makeProject(3)));
    expect(imported.emotionSet.emotions).toHaveLength(3);
    expect(imported.warnings).toHaveLength(0);
  });

  it('여러 캐릭터 프롬프트를 각각 프롬프트 세트로 만들어', () => {
    const fixture = makeProject();
    (fixture.presets.SDImageGen[0].characterPrompts as any[]).push({
      prompt: 'red dress',
      uc: '',
      enabled: true,
    });
    const imported = importSDStudioProject(JSON.stringify(fixture));
    expect(imported.character.promptSets.map((set) => set.positive)).toEqual([
      'blue hair, amber eyes',
      'red dress',
    ]);
  });

  it('빈 프롬프트만 끄고 전체 import는 유지해', () => {
    const fixture = makeProject();
    (fixture.scenes.Emotion3 as any).slots[0][0].prompt = '';
    const imported = importSDStudioProject(JSON.stringify(fixture));
    expect(imported.emotionSet.emotions[2].prompt).toBe('');
    expect(imported.warnings.some((warning) => warning.code === 'empty-prompt')).toBe(true);
  });

  it('꺼진 프롬프트는 건너뛰어', () => {
    const fixture = makeProject();
    (fixture.scenes.Emotion1 as any).slots = [
      [{ prompt: 'disabled', enabled: false }],
      [{ prompt: 'chosen', enabled: true }],
    ];
    const imported = importSDStudioProject(JSON.stringify(fixture));
    expect(imported.emotionSet.emotions[0].prompt).toBe('chosen');
    expect(imported.variantSet).toBeUndefined();
  });

  it('JSON 문법과 필수 경로 오류를 분리해', () => {
    expect(() => importSDStudioProject('{')).toThrow(SDStudioImportError);
    expect(() => importSDStudioProject(JSON.stringify({ name: 'x' }))).toThrow(/필수 구조/);
  });
});
