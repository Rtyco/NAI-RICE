import { describe, expect, it } from 'vitest';
import { composeRequestPrompts } from '../../src/core/jobs/JobBuilder';
import { comboPrompts, sceneCombos } from '../../src/core/model/sceneCombos';
import {
  importSDStudioProject,
  SDStudioImportError,
} from '../../src/core/importers/SDStudioProjectImporter';

function makeProject() {
  return {
    name: '테스트',
    extraPrompt: 'outdoors',
    selectedWorkflow: { workflowType: 'SDImageGen', presetName: '기본' },
    presets: {
      SDImageGen: [
        {
          name: '기본',
          frontPrompt: 'masterpiece, |, 1girl',
          backPrompt: 'best quality',
          uc: 'lowres',
          characterPrompts: [
            {
              id: 'c1',
              prompt: 'girl, blue hair',
              uc: 'bad hands',
              position: { x: 0.3, y: 0.5 },
              enabled: true,
            },
          ],
          steps: 28,
          promptGuidance: 5,
          cfgRescale: 0,
          sampling: 'k_euler_ancestral',
          noiseSchedule: 'karras',
          varietyPlus: true,
        },
      ],
    },
    presetShareds: { SDImageGen: { seed: 1234, characterPrompts: [] } },
    scenes: {
      default: { type: 'scene', slots: [] },
      기쁨: {
        type: 'scene',
        sceneUC: 'tears',
        slots: [
          [
            { id: 'a', prompt: 'smile', characterPrompts: [] },
            { id: 'b', name: '울음', prompt: 'cry', characterPrompts: [] },
          ],
          [{ id: 'c', prompt: 'sitting', characterPrompts: ['red dress'] }],
        ],
      },
    },
  };
}

/** 같은 JSON으로 SDStudio가 만드는 프롬프트를 손으로 계산해 비교한다. */
function prompts(imported: ReturnType<typeof importSDStudioProject>, sceneIndex = 0) {
  const emotion = imported.emotionSet.emotions[sceneIndex];
  const preset = imported.presets.find((item) => item.id === imported.project!.presetId)!;
  return sceneCombos(emotion).map((combo) =>
    composeRequestPrompts(
      preset,
      imported.characters.map((character) => character.promptSets[0]),
      comboPrompts(emotion, combo),
      { sets: [], extraPrompt: imported.project?.extraPrompt },
      'txt2img',
    ),
  );
}

describe('importSDStudioProject', () => {
  it('씬 조합마다 SDStudio와 같은 프롬프트를 만들어(상위 → 추가 → 씬 → 하위, | 자리)', () => {
    const imported = importSDStudioProject(JSON.stringify(makeProject()));
    expect(imported.emotionSet.emotions.map((emotion) => emotion.name)).toEqual(['기쁨']);
    // SDStudio: [masterpiece | 1girl outdoors] 와 [smile sitting] → masterpiece, smile, sitting, 1girl, outdoors → 하위
    expect(prompts(imported).map((item) => item.prompt)).toEqual([
      'masterpiece, smile, sitting, 1girl, outdoors, best quality',
      'masterpiece, cry, sitting, 1girl, outdoors, best quality',
    ]);
    const [first] = prompts(imported);
    expect(first.characterPrompt).toBe('girl, blue hair, red dress');
    expect(first.characterNegativePrompt).toBe('bad hands');
    expect(first.negativePrompt).toBe('lowres, tears');
    expect(sceneCombos(imported.emotionSet.emotions[0]).map((combo) => combo.name)).toEqual([
      'smile · sitting',
      '울음 · sitting',
    ]);
  });

  it('생성 설정·캐릭터·위치·seed를 가져와 일반 생성 작업으로 묶어', () => {
    const imported = importSDStudioProject(JSON.stringify(makeProject()));
    const [preset] = imported.presets;
    expect(preset.name).toBe('테스트 (SDStudio)');
    expect(preset).toMatchObject({
      commonPositive: 'masterpiece, |, 1girl',
      backPositive: 'best quality',
    });
    expect(preset.generation).toMatchObject({
      emotionPosition: 'middle',
      seedMode: 'fixed',
      fixedSeed: 1234,
      variety: true,
      steps: 28,
    });
    expect(imported.project).toMatchObject({
      mode: 'txt2img',
      presetId: preset.id,
      emotionSetId: imported.emotionSet.id,
      positionMode: 'ai',
      extraPrompt: 'outdoors',
    });
    expect(imported.project!.characters).toHaveLength(1);
    expect(imported.warnings).toEqual([]);
  });

  it('캐릭터 프롬프트 여럿은 한 그림의 여러 캐릭터이고, 좌표를 쓰면 위치도 가져와', () => {
    const file = makeProject();
    const preset = file.presets.SDImageGen[0] as Record<string, unknown>;
    preset.useCoords = true;
    preset.characterPrompts = [
      ...(preset.characterPrompts as unknown[]),
      { id: 'c2', prompt: 'boy, |, black hair', uc: '', position: { x: 0.7, y: 0.5 } },
      { id: 'c3', prompt: 'cat', uc: '', position: { x: 0.5, y: 0.5 }, enabled: false },
    ];
    file.scenes.기쁨.slots[1][0].characterPrompts = ['red dress', 'waving, |, jacket'];
    const imported = importSDStudioProject(JSON.stringify(file));
    expect(imported.characters.map((character) => character.name)).toEqual([
      '테스트 1',
      '테스트 2',
    ]);
    expect(imported.project).toMatchObject({ positionMode: 'manual' });
    expect(imported.project!.characters.map((slot) => slot.center)).toEqual([
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.5 },
    ]);
    // SDStudio: [boy | black hair]와 [waving | jacket] → boy, waving, black hair, jacket
    expect(prompts(imported)[0].extraCharacters[0].prompt).toBe('boy, waving, black hair, jacket');
  });

  it('이지 모드는 캐릭터·배경 프롬프트를 상위·하위에 합치고 인원 태그를 앞으로 옮겨', () => {
    const imported = importSDStudioProject(
      JSON.stringify({
        name: '이지',
        presets: {
          SDImageGenEasy: [
            { name: 'e', frontPrompt: 'masterpiece', backPrompt: 'best', uc: 'lowres' },
          ],
        },
        presetShareds: {
          SDImageGenEasy: {
            characterPrompt: 'blue hair, 1girl',
            backgroundPrompt: 'park',
            uc: 'bad hands',
          },
        },
        scenes: { 기쁨: { slots: [[{ prompt: 'smile' }]] } },
      }),
    );
    expect(imported.presets[0]).toMatchObject({
      commonPositive: '1girl, masterpiece, blue hair',
      backPositive: 'park, best',
      commonNegative: 'bad hands, lowres',
    });
    expect(prompts(imported)[0].prompt).toBe('1girl, masterpiece, blue hair, smile, park, best');
  });

  it('프리셋 여럿은 모두 가져오고 고른 프리셋을 작업에 써', () => {
    const file = makeProject();
    file.presets.SDImageGen.push({ ...file.presets.SDImageGen[0], name: '둘째', frontPrompt: 'x' });
    file.selectedWorkflow.presetName = '둘째';
    const imported = importSDStudioProject(JSON.stringify(file));
    expect(imported.presets.map((preset) => preset.name)).toEqual([
      '테스트 · 기본',
      '테스트 · 둘째',
    ]);
    expect(imported.project!.presetId).toBe(imported.presets[1].id);
    expect(imported.warnings.map((warning) => warning.code)).toEqual(['multiple-presets']);
  });

  it('이지 모드 프리셋(SDStudio 기본 화풍)은 작업이 고른 것만 가져와', () => {
    const file = makeProject() as ReturnType<typeof makeProject> & {
      presets: Record<string, unknown[]>;
    };
    const easy = (name: string) => ({ name, frontPrompt: name, backPrompt: '', uc: '' });
    file.presets.SDImageGenEasy = [easy('애니스타일'), easy('선명동글'), easy('동글')];
    expect(importSDStudioProject(JSON.stringify(file)).presets.map((p) => p.name)).toEqual([
      '테스트 (SDStudio)',
    ]);
    file.selectedWorkflow = { workflowType: 'SDImageGenEasy', presetName: '동글' };
    const imported = importSDStudioProject(JSON.stringify(file));
    expect(imported.presets.map((p) => p.name)).toEqual(['테스트 · 기본', '테스트 · 동글']);
    expect(imported.project!.presetId).toBe(imported.presets[1].id);
  });

  it('켜진 후보가 없는 칸이 있으면 SDStudio처럼 조합이 없고 알려', () => {
    const file = makeProject();
    file.scenes.기쁨.slots.push([
      { id: 'd', prompt: 'off', characterPrompts: [], enabled: false },
    ] as never);
    const imported = importSDStudioProject(JSON.stringify(file));
    expect(sceneCombos(imported.emotionSet.emotions[0])).toEqual([]);
    expect(imported.warnings.map((warning) => warning.code)).toEqual(['empty-prompt']);
  });

  it('여러 줄 프롬프트는 SDStudio처럼 쉼표로 읽어', () => {
    const file = makeProject();
    file.presets.SDImageGen[0].frontPrompt = 'masterpiece\n|\n1girl';
    const imported = importSDStudioProject(JSON.stringify(file));
    expect(imported.presets[0].commonPositive).toBe('masterpiece, |, 1girl');
  });

  it('그림이 필요한 인페인트 씬·바이브는 가져오지 않았다고 알려', () => {
    const file = { ...makeProject(), inpaints: { a: {} } } as Record<string, unknown>;
    (file.presetShareds as { SDImageGen: Record<string, unknown> }).SDImageGen.vibes = [{}];
    const imported = importSDStudioProject(JSON.stringify(file));
    expect(imported.warnings.map((warning) => warning.code)).toEqual([
      'images-not-imported',
      'images-not-imported',
    ]);
  });

  it('JSON 문법과 필수 경로 오류를 분리해', () => {
    expect(() => importSDStudioProject('{')).toThrow(SDStudioImportError);
    expect(() => importSDStudioProject(JSON.stringify({ name: 'x' }))).toThrow(/필수 구조/);
  });
});

describe('SDStudio 씬만 담은 파일', () => {
  it('씬 모음만 만들고 조합 칸과 캐릭터 칸을 그대로 옮겨', () => {
    const file = {
      version: 1,
      name: '표정',
      presets: {},
      presetShareds: {},
      inpaints: {},
      library: {},
      scenes: {
        기쁨: { slots: [[{ prompt: 'smile', characterPrompts: ['open mouth', '', 'wave'] }]] },
      },
    };
    const imported = importSDStudioProject(JSON.stringify(file));
    expect(imported.project).toBeUndefined();
    expect(imported.presets).toEqual([]);
    const [emotion] = imported.emotionSet.emotions;
    expect(emotion.slots![0][0]).toMatchObject({
      prompt: 'smile',
      characterPrompts: ['open mouth', '', 'wave'],
      enabled: true,
    });
    expect(comboPrompts(emotion, sceneCombos(emotion)[0])).toMatchObject({
      prompt: 'smile',
      firstCharacter: 'open mouth',
      extraPrompts: ['', 'wave'],
    });
  });
});

describe('SDStudio 씬별 설정', () => {
  function withScenes(scenes: Record<string, unknown>) {
    return importSDStudioProject(JSON.stringify({ ...makeProject(), scenes }));
  }
  const slot = [[{ prompt: 'smile', characterPrompts: [] }]];

  it('씬 seed, 없으면 씬 seed 묶음의 seed를 생성 설정 seed보다 먼저 써', () => {
    const imported = withScenes({
      a: { slots: slot, sceneSeed: 7 },
      b: {
        slots: slot,
        meta: { __sdstudioSceneSeedGroupV1: { version: 1, id: 'g', order: 0, seed: 9 } },
      },
      c: { slots: slot, sceneSeed: -1 },
    });
    expect(imported.emotionSet.emotions.map((emotion) => emotion.seed)).toEqual([7, 9, undefined]);
  });

  it('가장 많은 씬 해상도는 생성 설정 크기가 되고 다른 씬만 따로 크기를 가져', () => {
    const imported = withScenes({
      a: { slots: slot, resolution: 'landscape' },
      b: { slots: slot, resolution: 'landscape' },
      c: { slots: slot, resolution: 'custom', resolutionWidth: 1024, resolutionHeight: 1536 },
      d: { slots: slot, resolution: 'portrait' },
    });
    expect(imported.presets[0].generation).toMatchObject({ width: 1216, height: 832 });
    expect(
      imported.emotionSet.emotions.map(({ width, height }) => (width ? `${width}x${height}` : '')),
    ).toEqual(['', '', '1024x1536', '832x1216']);
  });

  it('씬 캐릭터 역할은 같은 번호 캐릭터 뒤, 조합 후보 앞에 붙고 역할 네거티브는 씬 네거티브로 가', () => {
    const imported = withScenes({
      a: {
        slots: [[{ prompt: 'cafe', characterPrompts: ['waving'] }]],
        sceneCharacterPromptMode: 'mix',
        sceneCharacterPrompts: [
          { id: 'r', prompt: 'apron', uc: 'hat', position: { x: 0.5, y: 0.5 } },
        ],
        sceneCharacterUC: 'blur',
      },
      b: {
        slots: slot,
        useSceneCharacterPrompts: true,
        sceneCharacterPrompts: [{ prompt: 'x', uc: '' }],
      },
    });
    const [first] = prompts(imported);
    expect(first.characterPrompt).toBe('girl, blue hair, apron, waving');
    expect(first.negativePrompt).toBe('lowres, blur, hat');
    expect(imported.warnings.map((warning) => warning.code)).toEqual(['scene-characters-mixed']);
  });
});
