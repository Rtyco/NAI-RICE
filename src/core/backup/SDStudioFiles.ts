import { z } from 'zod';
import type {
  Character,
  CharacterPromptSet,
  Emotion,
  EmotionPosition,
  EmotionSet,
  Library,
  PieceSet,
  Project,
  SceneOption,
} from '../domain/types';
import { SD_STUDIO_RESOLUTIONS } from '../importers/SDStudioProjectImporter';
import { scenePosition } from '../jobs/JobBuilder';
import { createCharacter, createPromptSet, newId } from '../model/defaults';
import { joinFragments } from '../prompts/PromptComposer';
import { pieceRefsIn } from '../prompts/PromptPieces';

/** SDStudio 프로젝트 파일(ISession)은 이 다섯 칸이 있어야 프로젝트로 읽힌다(`isValidSession`). */
type SDStudioProjectFile = {
  version: 1;
  name: string;
  selectedWorkflow?: { workflowType: string; presetName: string };
  presets: Record<string, unknown[]>;
  presetShareds: Record<string, unknown>;
  inpaints: Record<string, never>;
  scenes: Record<string, unknown>;
  library: Record<string, { name: string; version: number; pieces: unknown[] }>;
  extraPrompt?: string;
};

type Size = { width: number; height: number };

function uniqueKey(name: string, taken: Set<string>): string {
  let key = name.trim() || '씬';
  for (let index = 2; taken.has(key); index += 1) key = `${name} ${index}`;
  taken.add(key);
  return key;
}

export function sceneTexts(emotion: Emotion): string[] {
  return [
    emotion.prompt,
    emotion.negative ?? '',
    ...(emotion.extraPrompts ?? []),
    ...(emotion.slots ?? [])
      .flat()
      .flatMap((option) => [option.prompt, ...option.characterPrompts]),
  ];
}

/** 조각 안에서 부르는 세트까지 따라간다. */
export function usedPieceSets(texts: string[], pieceSets: PieceSet[]): PieceSet[] {
  const used = new Set<string>();
  let pending = texts;
  while (pending.length) {
    const names = pending
      .flatMap((text) => pieceRefsIn(text).map((ref) => ref.setName))
      .filter((name) => !used.has(name));
    names.forEach((name) => used.add(name));
    pending = pieceSets
      .filter((set) => names.includes(set.name))
      .flatMap((set) => set.pieces.map((piece) => piece.prompt));
  }
  return pieceSets.filter((set) => used.has(set.name));
}

function pieceLibrary(texts: string[], pieceSets: PieceSet[]) {
  return Object.fromEntries(
    usedPieceSets(texts, pieceSets).map((set) => [set.name, exportSDStudioPieceSet(set)]),
  );
}

/** 씬 자체 크기는 일부러 고른 것이라 `custom`으로 둔다(가져오기가 그대로 씬 크기로 읽는다). */
function sceneResolution(own: Size | undefined, common: Size | undefined) {
  if (own)
    return { resolution: 'custom', resolutionWidth: own.width, resolutionHeight: own.height };
  if (!common) return { resolution: 'portrait' };
  const named = Object.entries(SD_STUDIO_RESOLUTIONS).find(
    ([, [width, height]]) => width === common.width && height === common.height,
  )?.[0];
  return named
    ? { resolution: named }
    : { resolution: 'custom', resolutionWidth: common.width, resolutionHeight: common.height };
}

/** SDStudio 후보의 `prompt`는 늘 중간 자리라, 캐릭터 끝 위치면 첫 캐릭터 몫으로 옮긴다. */
function exportOption(option: SceneOption, toCharacter: boolean) {
  const moved = toCharacter && option.prompt.trim();
  return {
    id: newId(),
    ...(option.name ? { name: option.name } : {}),
    prompt: moved ? '' : option.prompt,
    characterPrompts: moved
      ? [
          joinFragments(option.prompt, option.characterPrompts[0]),
          ...option.characterPrompts.slice(1),
        ]
      : option.characterPrompts,
    enabled: option.enabled,
  };
}

/**
 * `position`이 없으면(씬 모음만 내보낼 때) 고정 씬 프롬프트를 맨 앞 칸에 캐릭터마다 `characterPrompts[j]`로
 * 넣는다(캐릭터 프롬프트 끝이 기본 위치라서).
 */
function exportScenes(set: EmotionSet | undefined, position?: EmotionPosition, common?: Size) {
  const taken = new Set<string>();
  const scenes: Record<string, unknown> = {};
  for (const emotion of set?.emotions ?? []) {
    const name = uniqueKey(emotion.name, taken);
    const extra = emotion.extraPrompts ?? [];
    const middle = position === 'middle';
    const slots = (emotion.slots ?? []).map((slot) =>
      slot.map((option) => exportOption(option, position === 'character-end')),
    );
    const fixed = middle
      ? { prompt: emotion.prompt, characterPrompts: extra.length ? ['', ...extra] : [] }
      : { prompt: '', characterPrompts: [emotion.prompt, ...extra] };
    scenes[name] = {
      type: 'scene',
      name,
      ...sceneResolution(
        emotion.width && emotion.height
          ? { width: emotion.width, height: emotion.height }
          : undefined,
        common,
      ),
      ...(emotion.seed !== undefined ? { sceneSeed: emotion.seed } : {}),
      slots: [
        ...([emotion.prompt, ...extra].some((text) => text.trim()) || !slots.length
          ? [[{ id: newId(), ...fixed, enabled: true }]]
          : []),
        ...slots,
      ],
      ...(emotion.negative?.trim() ? { sceneUC: emotion.negative } : {}),
      meta: {},
      imageMap: [],
      mains: [],
    };
  }
  return scenes;
}

/** SDStudio 「현재 프로젝트에 씬만 불러오기」로 읽히는 프로젝트 파일. 조합 칸은 그대로 옮긴다. `presetShareds`가 없으면 SDStudio가 읽다가 멈춘다. */
export function exportSDStudioScenes(set: EmotionSet, pieceSets: PieceSet[]): SDStudioProjectFile {
  return {
    version: 1,
    name: set.name,
    presets: {},
    presetShareds: {},
    inpaints: {},
    scenes: exportScenes(set),
    library: pieceLibrary(set.emotions.flatMap(sceneTexts), pieceSets),
  };
}

export type SDStudioProjectExport = {
  file: SDStudioProjectFile;
  /** SDStudio 파일에 담지 못해 뺀 것 */
  omitted: string[];
};

/** 작업 하나를 SDStudio 이미지 생성 프리셋 하나와 씬으로. 인페인트 작업도 일반 생성 씬으로 내보낸다. */
export function exportSDStudioProject(project: Project, library: Library): SDStudioProjectExport {
  const preset = library.presets.find((item) => item.id === project.presetId);
  if (!preset) throw new Error('작업의 생성 설정을 찾을 수 없습니다.');
  const cast = project.characters.flatMap((slot) => {
    const character = library.characters.find((item) => item.id === slot.characterId);
    const set =
      character?.promptSets.find((item) => item.id === slot.promptSetId) ??
      character?.promptSets[0];
    return character && set ? [{ character, set, center: slot.center }] : [];
  });
  const emotionSet = library.emotionSets.find((item) => item.id === project.emotionSetId);
  const settings = preset.generation;
  const extraPrompt = project.extraPrompt?.trim() ?? '';
  const seed = settings.seedMode === 'fixed' ? settings.fixedSeed : undefined;
  const sdPreset = {
    type: 'SDImageGen',
    name: preset.name,
    frontPrompt: preset.commonPositive,
    backPrompt: preset.backPositive,
    uc: preset.commonNegative,
    sampling: settings.sampler,
    steps: settings.steps,
    promptGuidance: settings.promptGuidance,
    cfgRescale: settings.cfgRescale,
    noiseSchedule: settings.noiseSchedule,
    varietyPlus: settings.variety,
    characterPrompts: cast.map(({ character, set, center }) => ({
      id: newId(),
      name: character.name,
      prompt: set.positive,
      uc: set.negative,
      enabled: true,
      position: center ?? { x: 0.5, y: 0.5 },
    })),
    useCoords: project.positionMode === 'manual',
    legacyPromptConditioning: false,
    backend: { type: 'NAI' },
  };
  const texts = [
    preset.commonPositive,
    preset.backPositive,
    preset.commonNegative,
    extraPrompt,
    ...cast.flatMap(({ set }) => [set.positive, set.negative]),
    ...(emotionSet?.emotions ?? []).flatMap(sceneTexts),
  ];
  const omitted = [
    ...(project.mode === 'reference'
      ? ['인페인트 참고 이미지와 마스크는 빼고 일반 생성 씬으로 내보냈습니다.']
      : []),
    ...(project.vibeIds.length || project.characterReferenceIds.length
      ? ['바이브와 캐릭터 레퍼런스는 SD Studio 파일에 그림을 담을 수 없어 뺐습니다.']
      : []),
  ];
  return {
    file: {
      version: 1,
      name: project.name,
      selectedWorkflow: { workflowType: 'SDImageGen', presetName: preset.name },
      presets: { SDImageGen: [sdPreset] },
      presetShareds: {
        SDImageGen: { type: 'SDImageGen', vibes: [], ...(seed !== undefined ? { seed } : {}) },
      },
      inpaints: {},
      scenes: exportScenes(emotionSet, scenePosition(settings.emotionPosition, cast.length), {
        width: settings.width,
        height: settings.height,
      }),
      library: pieceLibrary(texts, library.pieceSets),
      ...(extraPrompt ? { extraPrompt } : {}),
    },
    omitted,
  };
}

/** SDStudio 조각그룹 파일(PieceLibrary)과 같다. */
export function exportSDStudioPieceSet(set: PieceSet) {
  return {
    name: set.name,
    version: 1,
    pieces: set.pieces.map(({ name, prompt, multi }) => ({ name, prompt, multi })),
  };
}

const SET_SEPARATOR = ' · ';

/** 프롬프트 세트마다 SDStudio 캐릭터 프리셋 하나. 세트가 여럿이면 이름을 「캐릭터 · 세트」로 붙인다. */
export function exportSDStudioCharacter(character: Character) {
  const several = character.promptSets.length > 1;
  return {
    version: 1,
    presets: character.promptSets.map((set) => ({
      name: several ? `${character.name}${SET_SEPARATOR}${set.name}` : character.name,
      characterPrompt: set.positive,
      characterUC: set.negative,
      backgroundPrompt: '',
      vibes: [],
      characterReferences: [],
      vibeImages: [],
      referenceImages: [],
    })),
  };
}

const sdStudioCharacterFileSchema = z.object({
  presets: z
    .array(
      z
        .object({
          name: z.string(),
          characterPrompt: z.string().default(''),
          characterUC: z.string().default(''),
          backgroundPrompt: z.string().default(''),
        })
        .passthrough(),
    )
    .min(1),
});

export function isSDStudioCharacterFile(value: unknown): boolean {
  return sdStudioCharacterFileSchema.safeParse(value).success;
}

/**
 * 「이름 · 세트」끼리는 한 캐릭터의 프롬프트 세트로 묶는다(우리 내보내기를 다시 읽을 때 원래대로).
 * 배경 프롬프트는 우리 쪽에 칸이 없어 포지티브 끝에 붙인다.
 */
export function importSDStudioCharacters(value: unknown): Character[] {
  const file = sdStudioCharacterFileSchema.parse(value);
  const groups = new Map<string, CharacterPromptSet[]>();
  for (const preset of file.presets) {
    const cut = preset.name.lastIndexOf(SET_SEPARATOR);
    const characterName = cut > 0 ? preset.name.slice(0, cut) : preset.name;
    const setName = cut > 0 ? preset.name.slice(cut + SET_SEPARATOR.length) : '기본';
    const positive = [preset.characterPrompt, preset.backgroundPrompt]
      .map((text) => text.trim())
      .filter(Boolean)
      .join(', ');
    const sets = groups.get(characterName) ?? [];
    sets.push(createPromptSet(setName, { positive, negative: preset.characterUC.trim() }));
    groups.set(characterName, sets);
  }
  return [...groups].map(([name, sets]) => createCharacter(name, sets));
}
