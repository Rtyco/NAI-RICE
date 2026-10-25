import { describe, expect, it } from 'vitest';
import { comboPrompts, sceneCombos } from '../../src/core/model/sceneCombos';
import {
  exportCharacter,
  exportEmotionSet,
  mergeBundle,
  parseImportFile,
} from '../../src/core/backup/Backups';
import { exportSDStudioProject } from '../../src/core/backup/SDStudioFiles';
import { composeRequestPrompts } from '../../src/core/jobs/JobBuilder';
import {
  createCharacter,
  createDefaultLibrary,
  createPieceSet,
  createPreset,
  createProject,
  createPromptSet,
} from '../../src/core/model/defaults';
import type { EmotionPosition, EmotionSet, Library, Project } from '../../src/core/domain/types';

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
      bundle.emotionSets[0].emotions.map((emotion) => {
        const scene = comboPrompts(emotion, sceneCombos(emotion)[0]);
        return [scene.firstCharacter, scene.extraPrompts];
      }),
    ).toEqual([
      ['smile, <포즈.손>', ['', 'wave']],
      ['grin', []],
    ]);
  });

  it('조합 칸·씬 네거티브를 그대로 내보내고 다시 읽으면 같은 조합이 나와', () => {
    const combos: EmotionSet = {
      id: 'c',
      name: '조합',
      emotions: [
        {
          id: 'x',
          name: '외출',
          prompt: '',
          negative: 'rain',
          seed: 77,
          width: 1024,
          height: 1536,
          slots: [
            [
              {
                id: 'o1',
                name: '카페',
                prompt: 'cafe, <포즈.손>',
                characterPrompts: [],
                enabled: true,
              },
              { id: 'o2', prompt: 'park', characterPrompts: ['', 'wave'], enabled: false },
            ],
            [{ id: 'o3', prompt: 'sitting', characterPrompts: ['smile'], enabled: true }],
          ],
        },
      ],
    };
    const pieces = [createPieceSet('포즈', [{ name: '손', prompt: 'hand up' }])];
    const file = exportEmotionSet(combos, pieces) as Record<string, any>;
    expect(file.scenes['외출'].sceneUC).toBe('rain');
    expect(file.scenes['외출'].slots).toHaveLength(2);
    expect(file.scenes['외출'].slots[0][0]).toMatchObject({
      name: '카페',
      prompt: 'cafe, <포즈.손>',
    });
    expect(Object.keys(file.library)).toEqual(['포즈']);
    const [back] = parseImportFile(JSON.stringify(file), 'c.json', PRESET_ID).emotionSets[0]
      .emotions;
    expect(back).toMatchObject({ negative: 'rain', seed: 77, width: 1024, height: 1536 });
    expect(
      back.slots!.map((slot) =>
        slot.map(({ name, prompt, characterPrompts, enabled }) => ({
          name,
          prompt,
          characterPrompts,
          enabled,
        })),
      ),
    ).toEqual(
      combos.emotions[0].slots!.map((slot) =>
        slot.map(({ name, prompt, characterPrompts, enabled }) => ({
          name,
          prompt,
          characterPrompts,
          enabled,
        })),
      ),
    );
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

describe('작업을 SDStudio 프로젝트로 내보내기', () => {
  function workLibrary(position: EmotionPosition) {
    const library = createDefaultLibrary();
    const preset = {
      ...createPreset('그림체'),
      commonPositive: 'masterpiece, |',
      backPositive: 'detailed background',
      commonNegative: 'blurry',
    };
    preset.generation = {
      ...preset.generation,
      emotionPosition: position,
      seedMode: 'fixed',
      fixedSeed: 1234,
      width: 1216,
      height: 832,
      qualityTags: false,
      ucPreset: 'none',
    };
    const lina = createCharacter('리나', [
      createPromptSet('교복', { positive: '1girl, uniform, |', negative: 'hat' }),
    ]);
    const mio = createCharacter('미오', [createPromptSet('기본', { positive: '1girl, maid' })]);
    const scenes: EmotionSet = {
      id: 'scenes',
      name: '씬',
      emotions: [
        {
          id: 'e1',
          name: '외출',
          prompt: 'smile, <포즈.손>',
          extraPrompts: ['wave'],
          slots: [
            [
              {
                id: 'o1',
                prompt: 'cafe',
                characterPrompts: ['sitting', 'standing'],
                enabled: true,
              },
              { id: 'o2', prompt: 'park', characterPrompts: [], enabled: true },
            ],
          ],
        },
      ],
    };
    const project = {
      ...createProject('작업', { presetId: preset.id, emotionSetId: scenes.id, referenceId: '' }),
      mode: 'txt2img' as const,
      characters: [
        {
          characterId: lina.id,
          promptSetId: lina.promptSets[0].id,
          center: { x: 0.3, y: 0.5 },
        },
        { characterId: mio.id, promptSetId: mio.promptSets[0].id, center: { x: 0.7, y: 0.5 } },
      ],
      positionMode: 'manual' as const,
      extraPrompt: 'night',
    };
    return {
      ...library,
      presets: [preset],
      characters: [lina, mio],
      emotionSets: [scenes],
      projects: [project],
      pieceSets: [
        createPieceSet('포즈', [{ name: '손', prompt: 'hand up, <표정.웃음>' }]),
        createPieceSet('표정', [{ name: '웃음', prompt: 'grin' }]),
        createPieceSet('안 씀'),
      ],
    };
  }

  function requests(library: Library, project: Project) {
    const preset = library.presets.find((item) => item.id === project.presetId)!;
    const sets = project.characters.map((slot) => {
      const character = library.characters.find((item) => item.id === slot.characterId)!;
      return character.promptSets.find((set) => set.id === slot.promptSetId)!;
    });
    const emotion = library.emotionSets.find((set) => set.id === project.emotionSetId)!.emotions[0];
    return sceneCombos(emotion).map((combo) =>
      composeRequestPrompts(
        preset,
        sets,
        comboPrompts(emotion, combo),
        { sets: library.pieceSets, seed: 1, extraPrompt: project.extraPrompt },
        'txt2img',
      ),
    );
  }

  it.each(['middle', 'character-end'] as const)(
    '씬 위치가 %s여도 다시 읽은 작업이 같은 프롬프트를 보내',
    (position) => {
      const library = workLibrary(position);
      const { file, omitted } = exportSDStudioProject(library.projects[0], library);
      expect(omitted).toEqual([]);
      const bundle = parseImportFile(JSON.stringify(file), 'p.json', PRESET_ID);
      const back = mergeBundle(library, bundle);
      const project = back.projects.find((item) => item.id === bundle.projects[0].id)!;
      const original = requests(library, library.projects[0]);
      expect(original).toHaveLength(2);
      expect(JSON.stringify(original)).toMatch(/cafe.*grin.*night|night.*cafe/);
      expect(original[0].extraCharacters[0].prompt).toBe('1girl, maid, wave, standing');
      expect(requests(back, project)).toEqual(original);
      expect(project).toMatchObject({ positionMode: 'manual', extraPrompt: 'night' });
      expect(project.characters.map((slot) => slot.center)).toEqual([
        { x: 0.3, y: 0.5 },
        { x: 0.7, y: 0.5 },
      ]);
      expect(bundle.presets[0].generation).toMatchObject({
        fixedSeed: 1234,
        width: 1216,
        height: 832,
      });
    },
  );

  it('SDStudio 프리셋 칸과 부르는 조각 세트를 넣어', () => {
    const library = workLibrary('middle');
    const { file } = exportSDStudioProject(library.projects[0], library) as {
      file: Record<string, any>;
    };
    expect(file.selectedWorkflow).toEqual({ workflowType: 'SDImageGen', presetName: '그림체' });
    expect(file.presets.SDImageGen[0]).toMatchObject({
      type: 'SDImageGen',
      frontPrompt: 'masterpiece, |',
      backPrompt: 'detailed background',
      uc: 'blurry',
      useCoords: true,
      characterPrompts: [
        { name: '리나', prompt: '1girl, uniform, |', uc: 'hat', position: { x: 0.3, y: 0.5 } },
        { name: '미오', prompt: '1girl, maid' },
      ],
    });
    expect(file.presetShareds.SDImageGen).toMatchObject({ type: 'SDImageGen', seed: 1234 });
    expect(file.scenes['외출'].resolution).toBe('landscape');
    expect(Object.keys(file.library)).toEqual(['포즈', '표정']);
  });

  it('인페인트 작업은 일반 생성 씬으로 내보내고 뺀 것을 알려', () => {
    const library = workLibrary('middle');
    const project = { ...library.projects[0], mode: 'reference' as const, vibeIds: ['v'] };
    const { file, omitted } = exportSDStudioProject(project, library);
    expect(Object.keys(file.scenes)).toEqual(['외출']);
    expect(file.inpaints).toEqual({});
    expect(omitted).toHaveLength(2);
  });
});
