import type { z } from 'zod';
import type {
  Character,
  CharacterSlot,
  Emotion,
  EmotionSet,
  ImportWarning,
  Preset,
  Project,
  SceneOption,
} from '../domain/types';
import {
  createCharacter,
  createPreset,
  createProject,
  createPromptSet,
  newId,
} from '../model/defaults';
import { joinFragments } from '../prompts/PromptComposer';
import { sdStudioRootSchema } from '../validation/schemas';

export class SDStudioImportError extends Error {
  constructor(
    message: string,
    readonly details: string[],
  ) {
    super(message);
    this.name = 'SDStudioImportError';
  }
}

type Json = Record<string, unknown>;

export type SDStudioImport = {
  /** 이미지 생성(이지 모드 포함) 프리셋마다 하나. 씬만 담은 파일이면 비었다. */
  presets: Preset[];
  /** 고른 프리셋의 켜진 캐릭터 프롬프트 순서대로. */
  characters: Character[];
  emotionSet: EmotionSet;
  /** 프리셋이 있으면 위 항목을 묶은 일반 생성 작업. */
  project?: Project;
  warnings: ImportWarning[];
};

const WORKFLOWS = ['SDImageGen', 'SDImageGenEasy'] as const;

function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`);
}

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const objects = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** SDStudio는 줄바꿈을 쉼표로 읽는다(`toPARR`). NovelAI에는 줄바꿈이 그대로 가므로 쉼표로 바꿔 둔다. */
function text(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/[,\s]*\r?\n[,\s]*/g, ', ')
        .trim()
        .replace(/^[,\s]+|[,\s]+$/g, '')
    : '';
}

const COUNT_TAG = /^(\d+(boy|girl|other)s?|multiple (girls|boys|others))$/;

/** 이지 모드는 캐릭터 프롬프트를 상위 뒤에 붙이고 인원 태그를 맨 앞으로 옮긴다. */
function easyFront(front: string, characterPrompt: string): string {
  const tags = joinFragments(front, characterPrompt)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return joinFragments(
    ...tags.filter((tag) => COUNT_TAG.test(tag)),
    ...tags.filter((tag) => !COUNT_TAG.test(tag)),
  );
}

const validSeed = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/** 직접 입력한 것, 적용한 캐릭터 프리셋 순. `order`가 있으면 그 순서(SDStudio와 같다). */
function orderedCharacters(preset: Json, shared: Json): Json[] {
  return [...objects(preset.characterPrompts), ...objects(shared.characterPrompts)]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const order = (item: Json) =>
        Number.isFinite(item.order) ? (item.order as number) : Infinity;
      return order(a.item) - order(b.item) || a.index - b.index;
    })
    .map(({ item }) => item)
    .filter((item) => item.enabled !== false);
}

function convertPreset(name: string, type: string, source: Json, shared: Json): Preset {
  const easy = type === 'SDImageGenEasy';
  const front = easy
    ? easyFront(text(source.frontPrompt), text(shared.characterPrompt))
    : text(source.frontPrompt);
  const back = joinFragments(easy ? text(shared.backgroundPrompt) : '', text(source.backPrompt));
  const base = createPreset(name);
  const number = (key: string, fallback: number) =>
    typeof source[key] === 'number' ? source[key] : fallback;
  const word = (key: string, fallback: string) =>
    typeof source[key] === 'string' ? source[key] : fallback;
  return {
    ...base,
    commonPositive: front,
    backPositive: back,
    commonNegative: joinFragments(easy ? text(shared.uc) : '', text(source.uc)),
    generation: {
      ...base.generation,
      sampler: word('sampling', base.generation.sampler),
      steps: number('steps', base.generation.steps),
      promptGuidance: number('promptGuidance', base.generation.promptGuidance),
      cfgRescale: number('cfgRescale', base.generation.cfgRescale),
      noiseSchedule: word('noiseSchedule', base.generation.noiseSchedule),
      variety: source.varietyPlus === true,
      emotionPosition: 'middle',
      ...(validSeed(shared.seed) ? { seedMode: 'fixed' as const, fixedSeed: shared.seed } : {}),
    },
  };
}

function convertOption(piece: Json): SceneOption {
  const name = typeof piece.name === 'string' && piece.name.trim() ? piece.name.trim() : undefined;
  return {
    id: newId(),
    ...(name ? { name } : {}),
    prompt: text(piece.prompt),
    characterPrompts: Array.isArray(piece.characterPrompts) ? piece.characterPrompts.map(text) : [],
    enabled: piece.enabled !== false,
  };
}

/** SDStudio `resolutionMap`(가로, 세로). 값은 SDStudio 그대로다. */
export const SD_STUDIO_RESOLUTIONS: Record<string, [number, number]> = {
  small_landscape: [768, 512],
  small_portrait: [512, 768],
  small_square: [640, 640],
  landscape: [1216, 832],
  portrait: [832, 1216],
  square: [1024, 1024],
  large_landscape: [1536, 1024],
  large_portrait: [1024, 1536],
  large_square: [1472, 1472],
  wallpaper_portrait: [1920, 1088],
  wallpaper_landscape: [1088, 1920],
};

const validSide = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 64 && value <= 8192;

function sceneSize(scene: Json): { width: number; height: number } | undefined {
  const value = scene.resolution;
  const [width, height] = isObject(value)
    ? [value.width, value.height]
    : value === 'custom'
      ? [scene.resolutionWidth, scene.resolutionHeight]
      : typeof value === 'string'
        ? (SD_STUDIO_RESOLUTIONS[value] ?? [])
        : [];
  return validSide(width) && validSide(height) ? { width, height } : undefined;
}

/** 씬 seed, 없으면 씬 seed 묶음의 seed(SDStudio 우선순위). */
function sceneSeed(scene: Json): number | undefined {
  if (validSeed(scene.sceneSeed)) return scene.sceneSeed;
  const group = isObject(scene.meta) ? scene.meta.__sdstudioSceneSeedGroupV1 : undefined;
  return isObject(group) && validSeed(group.seed) ? group.seed : undefined;
}

type SceneRoles = { mode: 'base' | 'mix' | 'scene'; roles: Json[] };

function sceneRoles(scene: Json): SceneRoles {
  const mode =
    scene.sceneCharacterPromptMode === 'base' ||
    scene.sceneCharacterPromptMode === 'mix' ||
    scene.sceneCharacterPromptMode === 'scene'
      ? scene.sceneCharacterPromptMode
      : scene.useSceneCharacterPrompts === true
        ? 'scene'
        : 'base';
  return { mode, roles: objects(scene.sceneCharacterPrompts) };
}

/**
 * 씬 캐릭터 역할은 같은 번호 캐릭터 프롬프트 뒤, 조합 후보보다 앞에 붙는다(역할 혼합). 그래서 맨 앞에 후보
 * 하나짜리 칸으로 둔다. 역할 네거티브는 캐릭터마다 둘 곳이 없어 씬 네거티브에 합친다.
 */
function convertScene(name: string, scene: Json): Emotion {
  const { mode, roles } = sceneRoles(scene);
  const roleSlot: SceneOption[][] =
    mode !== 'base' && roles.length
      ? [
          [
            {
              id: newId(),
              name: '씬 캐릭터',
              prompt: '',
              characterPrompts: roles.map((role) =>
                role.enabled === false ? '' : text(role.prompt),
              ),
              enabled: true,
            },
          ],
        ]
      : [];
  const slots = [
    ...roleSlot,
    ...(Array.isArray(scene.slots) ? scene.slots : []).map((slot) =>
      objects(slot).map(convertOption),
    ),
  ];
  const negative = joinFragments(
    text(scene.sceneUC),
    ...(roleSlot.length
      ? [text(scene.sceneCharacterUC), ...roles.map((role) => text(role.uc))]
      : []),
  );
  const seed = sceneSeed(scene);
  const size = sceneSize(scene);
  return {
    id: newId(),
    name,
    prompt: '',
    ...(slots.length ? { slots } : {}),
    ...(negative ? { negative } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...size,
  };
}

/**
 * SDStudio 씬은 모두 이름 붙은 해상도가 있다. 가장 많은 것은 생성 설정 크기로 올리고 그 씬에서는 지운다.
 * `custom`은 일부러 고른 크기라(이 앱 내보내기도 `custom`) 그대로 둔다.
 */
function commonSize(emotions: Emotion[]): { width: number; height: number } | undefined {
  const counts = new Map<string, number>();
  for (const emotion of emotions)
    if (emotion.width && emotion.height) {
      const key = `${emotion.width}x${emotion.height}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top) return undefined;
  const [width, height] = top.split('x').map(Number);
  return { width, height };
}

const optionHasText = (option: SceneOption) =>
  Boolean(option.prompt || option.characterPrompts.some(Boolean));

function convertScenes(
  scenes: Json,
  warnings: ImportWarning[],
): { emotions: Emotion[]; size?: { width: number; height: number } } {
  const emotions: Emotion[] = [];
  const named = new Set<Emotion>();
  for (const [sceneName, sceneValue] of Object.entries(scenes)) {
    if (!isObject(sceneValue)) continue;
    const emotion = convertScene(sceneName, sceneValue);
    if (typeof sceneValue.resolution === 'string' && sceneValue.resolution !== 'custom')
      named.add(emotion);
    const options = (emotion.slots ?? []).flat();
    // SDStudio가 새 프로젝트에 만들어 두는 빈 씬
    if (sceneName === 'default' && !options.some(optionHasText) && !emotion.negative) continue;
    if ((emotion.slots ?? []).some((slot) => !slot.some((option) => option.enabled))) {
      warnings.push({
        code: 'empty-prompt',
        message: `${sceneName}: 켜진 후보가 없는 칸이 있어 SD Studio처럼 생성하지 않습니다.`,
        path: `scenes.${sceneName}.slots`,
      });
    }
    emotions.push(emotion);
  }
  const size = commonSize([...named]);
  for (const emotion of named)
    if (size && emotion.width === size.width && emotion.height === size.height) {
      delete emotion.width;
      delete emotion.height;
    }
  const solo = Object.values(scenes).filter(
    (scene) =>
      isObject(scene) &&
      sceneRoles(scene).mode === 'scene' &&
      objects(scene.sceneCharacterPrompts).length,
  );
  if (solo.length) {
    warnings.push({
      code: 'scene-characters-mixed',
      message: `씬 전용 캐릭터를 쓰는 씬 ${solo.length}개는 캐릭터마다 씬 캐릭터 프롬프트를 덧붙이는 방식(역할 혼합)으로 가져왔습니다.`,
      path: 'scenes',
    });
  }
  return { emotions, size };
}

function convertCast(
  preset: Json,
  shared: Json,
  projectName: string,
): { characters: Character[]; slots: CharacterSlot[]; manual: boolean } {
  const sources = orderedCharacters(preset, shared).filter((item) => text(item.prompt));
  const characters = sources.map((item, index) => {
    const name =
      (typeof item.fromPreset === 'string' && item.fromPreset.trim()) ||
      (typeof item.name === 'string' && item.name.trim()) ||
      (sources.length > 1 ? `${projectName} ${index + 1}` : projectName);
    return createCharacter(name, [
      createPromptSet('기본', { positive: text(item.prompt), negative: text(item.uc) }),
    ]);
  });
  const manual = preset.useCoords === true;
  const slots = characters.map((character, index): CharacterSlot => {
    const position = sources[index].position;
    const center =
      manual &&
      isObject(position) &&
      typeof position.x === 'number' &&
      typeof position.y === 'number'
        ? { x: position.x, y: position.y }
        : undefined;
    return {
      characterId: character.id,
      promptSetId: character.promptSets[0].id,
      ...(center ? { center } : {}),
    };
  });
  return { characters, slots, manual };
}

export function isSDStudioProject(value: unknown): boolean {
  return sdStudioRootSchema.safeParse(value).success;
}

export function importSDStudioProject(raw: string): SDStudioImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SDStudioImportError('JSON 문법을 읽을 수 없습니다.', [message]);
  }

  const validation = sdStudioRootSchema.safeParse(parsed);
  if (!validation.success) {
    throw new SDStudioImportError(
      'SDStudio 필수 구조가 누락되었습니다.',
      formatZodError(validation.error),
    );
  }

  const root = validation.data as Json & { name: string; scenes: Json; presets: Json };
  const warnings: ImportWarning[] = [];
  const shareds = isObject(root.presetShareds) ? root.presetShareds : {};
  const sharedOf = (type: string): Json => {
    const shared = shareds[type];
    return isObject(shared) ? shared : {};
  };
  const selected = isObject(root.selectedWorkflow) ? root.selectedWorkflow : {};
  const extra = typeof root.extraPrompt === 'string' ? root.extraPrompt : '';

  const { emotions, size } = convertScenes(root.scenes, warnings);
  const emotionSet: EmotionSet = { id: newId(), name: `${root.name} 씬`, emotions };

  const all = WORKFLOWS.flatMap((type) =>
    objects(root.presets[type]).map((source, index) => ({ type, source, index })),
  );
  if (!all.length) return { presets: [], characters: [], emotionSet, warnings };
  const picked =
    all.find(
      ({ type, source }) => type === selected.workflowType && source.name === selected.presetName,
    ) ?? all[0];
  // 이지 모드 프리셋에는 SDStudio가 프로젝트마다 넣어 두는 기본 화풍(애니스타일 등)이 섞여 있다.
  const sources = all.filter((item) => item === picked || item.type === 'SDImageGen');

  const several = sources.length > 1;
  const presets = sources.map(({ type, source, index }): Preset => {
    const label =
      typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `${index + 1}`;
    const preset = convertPreset(
      several ? `${root.name} · ${label}` : `${root.name} (SDStudio)`,
      type,
      source,
      sharedOf(type),
    );
    return size ? { ...preset, generation: { ...preset.generation, ...size } } : preset;
  });
  const chosenIndex = sources.indexOf(picked);
  const chosen = picked;
  const shared = sharedOf(chosen.type);
  const { characters, slots, manual } = convertCast(chosen.source, shared, root.name);

  if (!characters.length) {
    warnings.push({
      code: 'missing-character-positive',
      message: '켜진 캐릭터 프롬프트가 없어 캐릭터 없이 생성합니다.',
      path: `presets.${chosen.type}[${chosen.index}].characterPrompts`,
    });
  }
  if (several) {
    warnings.push({
      code: 'multiple-presets',
      message: `프리셋 ${sources.length}개를 생성 설정으로 가져왔습니다. 작업은 "${presets[chosenIndex].name}"을(를) 씁니다. 캐릭터는 이 프리셋 것만 가져왔습니다.`,
      path: 'presets',
    });
  }
  const inpaints = isObject(root.inpaints) ? Object.keys(root.inpaints).length : 0;
  if (inpaints) {
    warnings.push({
      code: 'images-not-imported',
      message: `인페인트·i2i 씬 ${inpaints}개는 그림이 JSON 밖에 있어 가져오지 않았습니다.`,
      path: 'inpaints',
    });
  }
  if (objects(shared.vibes).length || objects(shared.characterReferences).length) {
    warnings.push({
      code: 'images-not-imported',
      message: '바이브와 캐릭터 레퍼런스는 그림이 JSON 밖에 있어 가져오지 않았습니다.',
      path: `presetShareds.${chosen.type}`,
    });
  }

  const project: Project = {
    ...createProject(root.name, {
      presetId: presets[chosenIndex].id,
      emotionSetId: emotionSet.id,
      referenceId: '',
    }),
    mode: 'txt2img',
    characters: slots,
    positionMode: manual ? 'manual' : 'ai',
    ...(text(extra) ? { extraPrompt: text(extra) } : {}),
  };
  return { presets, characters, emotionSet, project, warnings };
}
