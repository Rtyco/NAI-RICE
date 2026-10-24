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
import { hasMarker } from '../prompts/PromptComposer';
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

function join(...values: string[]): string {
  return values.filter(Boolean).join(', ');
}

const COUNT_TAG = /^(\d+(boy|girl|other)s?|multiple (girls|boys|others))$/;

/** 이지 모드는 캐릭터 프롬프트를 상위 뒤에 붙이고 인원 태그를 맨 앞으로 옮긴다. */
function easyFront(front: string, characterPrompt: string): string {
  const tags = join(front, characterPrompt)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return join(
    ...tags.filter((tag) => COUNT_TAG.test(tag)),
    ...tags.filter((tag) => !COUNT_TAG.test(tag)),
  );
}

/** 캐릭터 프롬프트에 `|`가 있으면 SDStudio는 남는 조각을 끝에 붙인다. 끝에 자리를 하나 더 두어 같게 만든다. */
function characterPrompt(value: unknown): string {
  const prompt = text(value);
  return hasMarker(prompt) ? join(prompt, '|') : prompt;
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

function convertPreset(
  name: string,
  type: string,
  source: Json,
  shared: Json,
  extra: string,
): Preset {
  const easy = type === 'SDImageGenEasy';
  const front = easy
    ? easyFront(text(source.frontPrompt), text(shared.characterPrompt))
    : text(source.frontPrompt);
  const back = join(easy ? text(shared.backgroundPrompt) : '', text(source.backPrompt));
  const base = createPreset(name);
  const number = (key: string, fallback: number) =>
    typeof source[key] === 'number' ? source[key] : fallback;
  const word = (key: string, fallback: string) =>
    typeof source[key] === 'string' ? source[key] : fallback;
  return {
    ...base,
    // SDStudio 순서: 상위 → 추가 프롬프트 → 씬 → 하위. 씬은 마지막 `|` 자리에 들어간다.
    commonPositive: join(front, text(extra), '|', back),
    commonNegative: join(easy ? text(shared.uc) : '', text(source.uc)),
    generation: {
      ...base.generation,
      sampler: word('sampling', base.generation.sampler),
      steps: number('steps', base.generation.steps),
      promptGuidance: number('promptGuidance', base.generation.promptGuidance),
      cfgRescale: number('cfgRescale', base.generation.cfgRescale),
      noiseSchedule: word('noiseSchedule', base.generation.noiseSchedule),
      variety: source.varietyPlus === true,
      emotionPosition: 'common-marker',
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

function convertScene(name: string, scene: Json): Emotion {
  const slots = (Array.isArray(scene.slots) ? scene.slots : []).map((slot) =>
    objects(slot).map(convertOption),
  );
  const negative = text(scene.sceneUC);
  return {
    id: newId(),
    name,
    prompt: '',
    ...(slots.length ? { slots } : {}),
    ...(negative ? { negative } : {}),
  };
}

const optionHasText = (option: SceneOption) =>
  Boolean(option.prompt || option.characterPrompts.some(Boolean));

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

  const emotions: Emotion[] = [];
  for (const [sceneName, sceneValue] of Object.entries(root.scenes)) {
    if (!isObject(sceneValue)) continue;
    const emotion = convertScene(sceneName, sceneValue);
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
  const emotionSet: EmotionSet = { id: newId(), name: `${root.name} 씬`, emotions };

  const sources = WORKFLOWS.flatMap((type) =>
    objects(root.presets[type]).map((source, index) => ({ type, source, index })),
  );
  if (!sources.length) return { presets: [], characters: [], emotionSet, warnings };

  const several = sources.length > 1;
  const presets = sources.map(({ type, source, index }) => {
    const label =
      typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `${index + 1}`;
    return convertPreset(
      several ? `${root.name} · ${label}` : `${root.name} (SDStudio)`,
      type,
      source,
      sharedOf(type),
      extra,
    );
  });
  const chosenIndex = Math.max(
    0,
    sources.findIndex(
      ({ type, source }) => type === selected.workflowType && source.name === selected.presetName,
    ),
  );
  const chosen = sources[chosenIndex];
  const shared = sharedOf(chosen.type);
  const presetPath = `presets.${chosen.type}[${chosen.index}]`;

  const castSources = orderedCharacters(chosen.source, shared).filter((item) => text(item.prompt));
  const characters = castSources.map((item, index) => {
    const name =
      (typeof item.fromPreset === 'string' && item.fromPreset.trim()) ||
      (typeof item.name === 'string' && item.name.trim()) ||
      (castSources.length > 1 ? `${root.name} ${index + 1}` : root.name);
    return createCharacter(name, [
      createPromptSet('기본', { positive: characterPrompt(item.prompt), negative: text(item.uc) }),
    ]);
  });
  const manual = chosen.source.useCoords === true;
  const slots: CharacterSlot[] = characters.map((character, index) => {
    const position = castSources[index].position;
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

  if (!characters.length) {
    warnings.push({
      code: 'missing-character-positive',
      message: '켜진 캐릭터 프롬프트가 없어 캐릭터 없이 생성합니다.',
      path: `${presetPath}.characterPrompts`,
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
  };
  return { presets, characters, emotionSet, project, warnings };
}
