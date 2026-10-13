import { describe, expect, it } from 'vitest';
import { exportCharacter, exportEmotionSet, parseImportFile } from '../../src/core/backup/Backups';
import { createCharacter, createPieceSet, createPromptSet } from '../../src/core/model/defaults';
import type { EmotionSet } from '../../src/core/domain/types';

const PRESET_ID = 'fallback-preset';

const set: EmotionSet = {
  id: 'set',
  name: '표정',
  emotions: [
    { id: 'a', name: '기쁨', prompt: 'smile, <포즈.손>', extraPrompts: ['', 'wave'] },
    { id: 'b', name: '기쁨', prompt: 'grin' },
  ],
};

describe('SDStudio 호환 내보내기', () => {
  it('씬 모음은 SDStudio가 프로젝트로 읽는 모양이고 부르는 조각 세트만 넣어', () => {
    const pieces = [
      createPieceSet('포즈', [{ name: '손', prompt: 'hand up' }]),
      createPieceSet('안 씀'),
    ];
    const file = exportEmotionSet(set, pieces) as Record<string, any>;
    for (const key of ['name', 'presets', 'presetShareds', 'inpaints', 'scenes', 'library'])
      expect(file).toHaveProperty(key);
    expect(file.version).toBe(1);
    expect(Object.keys(file.scenes)).toEqual(['기쁨', '기쁨 2']);
    expect(file.scenes['기쁨']).toMatchObject({
      type: 'scene',
      resolution: 'portrait',
      slots: [[{ prompt: '', characterPrompts: ['smile, <포즈.손>', '', 'wave'], enabled: true }]],
    });
    expect(Object.keys(file.library)).toEqual(['포즈']);
    expect(file.library['포즈'].pieces).toEqual([{ name: '손', prompt: 'hand up', multi: false }]);
  });

  it('씬 모음을 내보냈다가 다시 읽으면 캐릭터 칸과 조각 세트가 그대로야', () => {
    const pieces = [createPieceSet('포즈', [{ name: '손', prompt: 'hand up' }])];
    const bundle = parseImportFile(
      JSON.stringify(exportEmotionSet(set, pieces)),
      'e.json',
      PRESET_ID,
    );
    expect(bundle.characters).toEqual([]);
    expect(bundle.presets).toEqual([]);
    expect(bundle.pieceSets.map((item) => item.name)).toEqual(['포즈']);
    expect(
      bundle.emotionSets[0].emotions.map(({ prompt, extraPrompts }) => [prompt, extraPrompts]),
    ).toEqual([
      ['smile, <포즈.손>', ['', 'wave']],
      ['grin', undefined],
    ]);
  });

  it('캐릭터는 프롬프트 세트마다 SDStudio 캐릭터 프리셋이 되고 다시 읽으면 한 캐릭터로 묶여', () => {
    const character = createCharacter('리나', [
      createPromptSet('교복', { positive: '1girl, uniform', negative: 'hat' }),
      createPromptSet('사복', { positive: '1girl, dress' }),
    ]);
    const file = exportCharacter(character);
    expect(file.version).toBe(1);
    expect(file.presets.map((preset) => preset.name)).toEqual(['리나 · 교복', '리나 · 사복']);
    expect(file.presets[0]).toMatchObject({
      characterPrompt: '1girl, uniform',
      characterUC: 'hat',
      backgroundPrompt: '',
      vibes: [],
      characterReferences: [],
    });
    const [back] = parseImportFile(JSON.stringify(file), 'c.json', PRESET_ID).characters;
    expect(back.name).toBe('리나');
    expect(
      back.promptSets.map(({ name, positive, negative }) => [name, positive, negative]),
    ).toEqual([
      ['교복', '1girl, uniform', 'hat'],
      ['사복', '1girl, dress', ''],
    ]);
  });

  it('SDStudio에서 만든 캐릭터 프리셋은 배경 프롬프트를 포지티브 끝에 붙여 읽어', () => {
    const file = {
      version: 1,
      presets: [
        {
          name: '아리아',
          characterPrompt: 'blue hair',
          characterUC: '',
          backgroundPrompt: 'classroom',
          vibes: [],
        },
      ],
    };
    const [character] = parseImportFile(JSON.stringify(file), 'c.json', PRESET_ID).characters;
    expect(character.name).toBe('아리아');
    expect(character.promptSets[0]).toMatchObject({
      name: '기본',
      positive: 'blue hair, classroom',
    });
  });
});
