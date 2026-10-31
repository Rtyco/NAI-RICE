import type {
  AppSettings,
  CanvasLayout,
  Character,
  CharacterCenter,
  CharacterPromptSet,
  CharacterSlot,
  DividerLine,
  Emotion,
  EmotionSet,
  GenerationKind,
  GenerationSettings,
  Library,
  LineFixSettings,
  PieceSet,
  Preset,
  Project,
  PromptPiece,
  Reference,
  AidMode,
  CharacterReference,
  Vibe,
} from '../domain/types';
import {
  DEFAULT_EXPORT_FILENAME_TEMPLATE,
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
} from '../output/OutputFilename';
import {
  MEDIUM_FIXED,
  NAI_MODELS,
  supportsInpaint,
  supportsReferenceAid,
  usesMedium,
} from '../providers/NaiModels';
import { comboCount } from './sceneCombos';

/** 작업 ID에는 무작위 접미사가 붙어 겹치지 않는다. */
export const FREE_PROJECT_ID = 'free';

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function slugify(value: string, fallback = 'item'): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
  return normalized.slice(0, 40) || fallback;
}

/** 폴더 이름으로도 써서 읽을 수 있는 접두사를 붙인다. */
export function readableId(name: string, fallback: string): string {
  return `${slugify(name, fallback)}-${newId().slice(0, 8)}`;
}

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  model: 'nai-diffusion-4-5-full-inpainting',
  sampler: 'k_euler_ancestral',
  steps: 28,
  promptGuidance: 5,
  cfgRescale: 0,
  noiseSchedule: 'karras',
  inpaintStrength: 1,
  seedMode: 'random-per-job',
  fixedSeed: 123456789,
  variantsPerEmotion: 1,
  qualityTags: false,
  qualityLevel: 'standard',
  ucPreset: 'none',
  referenceInset: true,
  referenceInsetPosition: 'common-start',
  emotionPosition: 'character-end',
  width: 832,
  height: 1216,
  img2imgStrength: 0.4,
  img2imgNoise: 0,
  effort: 'high',
  variety: false,
  smea: 'off',
  decrisp: false,
};

export function normalizeGenerationSettings(settings: GenerationSettings): GenerationSettings {
  return {
    ...DEFAULT_GENERATION_SETTINGS,
    ...settings,
    model: NAI_MODELS.some((model) => model.id === settings.model)
      ? settings.model
      : DEFAULT_GENERATION_SETTINGS.model,
  };
}

/** medium이면 고정값을 덮어쓴다. 작업·비용·미리보기 모두 이것을 쓴다. */
export function effectiveGenerationSettings(settings: GenerationSettings): GenerationSettings {
  const normalized = normalizeGenerationSettings(settings);
  return usesMedium(normalized) ? { ...normalized, ...MEDIUM_FIXED } : normalized;
}

export const DEFAULT_LAYOUT: CanvasLayout = {
  mode: 'auto',
  resolution: '1216x832',
  width: 1216,
  height: 832,
  referenceSide: 'left',
  referenceRatio: 0.5,
  fit: 'contain',
  anchor: 'center',
  background: '#ffffff',
};

export const DEFAULT_DIVIDER: DividerLine = {
  enabled: false,
  color: '#000000',
  widthPx: 8,
  placement: 'outside',
  gapPx: 0,
};

export const DEFAULT_EMOTIONS: Array<{ name: string; prompt: string }> = [
  { name: '중립', prompt: 'neutral expression, closed mouth' },
  { name: '기쁨', prompt: 'smile, happy, open mouth' },
  { name: '슬픔', prompt: 'sad, frown, teary eyes' },
  { name: '분노', prompt: 'angry, furrowed brow, clenched teeth' },
  { name: '놀람', prompt: 'surprised, wide-eyed, open mouth' },
  { name: '부끄러움', prompt: 'embarrassed, blush, looking away' },
];

export function createPreset(name = '기본 생성 설정', partial?: Partial<Preset>): Preset {
  return {
    id: newId(),
    name,
    commonPositive: 'masterpiece, best quality',
    backPositive: '',
    commonNegative: 'lowres, bad anatomy, bad hands, text, watermark',
    generation: { ...DEFAULT_GENERATION_SETTINGS },
    ...partial,
  };
}

export function createPromptSet(
  name = '기본',
  partial?: Partial<CharacterPromptSet>,
): CharacterPromptSet {
  return { id: newId(), name, positive: '', negative: '', ...partial };
}

export function createCharacter(name: string, promptSets?: CharacterPromptSet[]): Character {
  return {
    id: newId(),
    name: name.trim() || '새 캐릭터',
    promptSets: promptSets?.length ? promptSets : [createPromptSet()],
    createdAt: new Date().toISOString(),
  };
}

export function createEmotion(name: string, prompt = ''): Emotion {
  return { id: newId(), name, prompt };
}

export function createEmotionSet(
  name: string,
  emotions: Array<{ name: string; prompt: string }> = DEFAULT_EMOTIONS,
): EmotionSet {
  return {
    id: newId(),
    name,
    emotions: emotions.map((item) => createEmotion(item.name, item.prompt)),
  };
}

export function createPiece(name: string, prompt = '', multi = false): PromptPiece {
  return { id: newId(), name, prompt, multi };
}

export function createPieceSet(
  name: string,
  pieces: Array<{ name: string; prompt: string; multi?: boolean }> = [],
): PieceSet {
  return {
    id: newId(),
    name,
    pieces: pieces.map((item) => createPiece(item.name, item.prompt, item.multi)),
  };
}

export function createReference(name: string): Reference {
  return {
    id: readableId(name, 'reference'),
    name: name.trim() || '새 인페인트',
    layout: { ...DEFAULT_LAYOUT },
    divider: { ...DEFAULT_DIVIDER },
    inpaintStrength: 1,
    maskExpansionPx: 8,
    backgroundThreshold: 16,
    updatedAt: new Date().toISOString(),
  };
}

export function createCharacterReference(name: string): CharacterReference {
  return {
    id: newId(),
    name: name.trim() || '새 캐릭터 레퍼런스',
    target: 'character&style',
    strength: 1,
    fidelity: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function createVibe(name: string): Vibe {
  return {
    id: newId(),
    name: name.trim() || '새 바이브',
    strength: 0.6,
    informationExtracted: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function createProject(
  name: string,
  parts: { presetId: string; character?: Character; emotionSetId: string; referenceId: string },
): Project {
  const now = new Date().toISOString();
  return {
    id: readableId(name, 'project'),
    name: name.trim() || '새 작업',
    mode: 'reference',
    presetId: parts.presetId,
    characters: parts.character
      ? [{ characterId: parts.character.id, promptSetId: parts.character.promptSets[0].id }]
      : [],
    positionMode: 'ai',
    emotionSetId: parts.emotionSetId,
    referenceId: parts.referenceId,
    characterReferenceIds: [],
    vibeIds: [],
    excludedEmotionIds: [],
    favorites: {},
    createdAt: now,
    updatedAt: now,
  };
}

export const DEFAULT_LINE_FIX: LineFixSettings = {
  autoMask: true,
  model: '',
  prompt: 'source',
  strength: 1,
  marginPx: 4,
  count: 1,
  seedMode: 'random',
};

export const DEFAULT_SETTINGS: AppSettings = {
  outputFilenameTemplate: DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  keepDiagnosticCanvas: true,
  storageFormat: 'webp-lossless',
  export: {
    format: 'png',
    quality: 90,
    target: 'favorite',
    scope: 'scene',
    filenameTemplate: DEFAULT_EXPORT_FILENAME_TEMPLATE,
  },
  requestDelayMs: 300,
  streaming: false,
  accountRotation: true,
  anlasConfirm: { mode: 'any', over: 100 },
  tagAutocomplete: true,
  appearance: { theme: 'navy', mode: 'dark' },
  layout: {
    focusLevel: 'panels',
    edgePeek: false,
    simpleUi: false,
    chipEdit: false,
    chipNames: true,
    chipWrap: false,
    mediumFold: true,
    narrowOverlay: true,
    comboOptions: 'first',
  },
  lineFix: DEFAULT_LINE_FIX,
  update: { autoCheck: true, skippedVersion: '', seenVersion: '' },
};

export function createDefaultLibrary(): Library {
  return {
    schemaVersion: 2,
    settings: structuredClone(DEFAULT_SETTINGS),
    presets: [createPreset()],
    characters: [],
    emotionSets: [createEmotionSet('기본 씬 6종')],
    references: [],
    characterReferences: [],
    vibes: [],
    projects: [],
    pieceSets: [],
    freeGeneration: {
      presetId: '',
      characters: [],
      positionMode: 'ai',
      prompt: '',
      negative: '',
      count: 1,
      mode: 'txt2img',
      inpaint: false,
      promptPosition: 'middle',
      characterReferenceIds: [],
      vibeIds: [],
    },
  };
}

/** 지워진 캐릭터는 빠진다. */
export type ResolvedCharacter = {
  character: Character;
  promptSet: CharacterPromptSet;
  center?: CharacterCenter;
};

export function resolveCharacters(library: Library, slots: CharacterSlot[]): ResolvedCharacter[] {
  return slots.flatMap((slot) => {
    const character = library.characters.find((item) => item.id === slot.characterId);
    if (!character) return [];
    const promptSet =
      character.promptSets.find((item) => item.id === slot.promptSetId) ?? character.promptSets[0];
    return [{ character, promptSet, center: slot.center }];
  });
}

export type ResolvedProject = {
  project: Project;
  preset?: Preset;
  /** 참고 이미지의 캐릭터 */
  character?: Character;
  promptSet?: CharacterPromptSet;
  characters: ResolvedCharacter[];
  emotionSet?: EmotionSet;
  reference?: Reference;
  missing: string[];
};

export function generationKindFor(mode: Project['mode']): GenerationKind {
  return mode === 'reference' ? 'inpaint' : 'txt2img';
}

/** 지워졌으면 `item`이 없다. */
export type ProjectAid =
  | { kind: 'character'; references: Array<{ id: string; item?: CharacterReference }> }
  | { kind: 'vibe'; vibes: Array<{ id: string; item?: Vibe }> };

export type AidChoice = Pick<Project, 'aidMode' | 'characterReferenceIds' | 'vibeIds'>;

/**
 * 고른 적이 없으면 캐릭터 레퍼런스를 골라 둔 작업만 캐릭터 레퍼런스. NovelAI 웹은 V4.5 인페인트에도 캐릭터 레퍼런스를 쓴다(`charRefInpainting`, 2026-10).
 */
export function projectAidMode(project: AidChoice): AidMode {
  return project.aidMode ?? (project.characterReferenceIds.length ? 'character' : 'vibe');
}

export function projectAid(
  library: Pick<Library, 'characterReferences' | 'vibes'>,
  project: AidChoice,
): ProjectAid | undefined {
  if (projectAidMode(project) === 'character') {
    if (!project.characterReferenceIds.length) return undefined;
    return {
      kind: 'character',
      references: project.characterReferenceIds.map((id) => ({
        id,
        item: library.characterReferences.find((x) => x.id === id),
      })),
    };
  }
  if (!project.vibeIds.length) return undefined;
  return {
    kind: 'vibe',
    vibes: project.vibeIds.map((id) => ({ id, item: library.vibes.find((x) => x.id === id) })),
  };
}

/** 지워진 항목은 undefined */
export function aidItems(
  aid: ProjectAid | undefined,
): Array<CharacterReference | Vibe | undefined> {
  if (!aid) return [];
  return (aid.kind === 'character' ? aid.references : aid.vibes).map((entry) => entry.item);
}

export function resolveProject(library: Library, project: Project): ResolvedProject {
  const preset = library.presets.find((item) => item.id === project.presetId);
  const characters = resolveCharacters(library, project.characters);
  const character = characters[0]?.character;
  const promptSet = characters[0]?.promptSet;
  const emotionSet = library.emotionSets.find((item) => item.id === project.emotionSetId);
  const reference = library.references.find((item) => item.id === project.referenceId);
  const inpaint = project.mode === 'reference';
  const aid = projectAid(library, project);
  const aidLabel = aid?.kind === 'character' ? '캐릭터 레퍼런스' : '바이브';
  const items = aidItems(aid);
  const missing = [
    !preset && '생성 설정',
    // 캐릭터 없이도 생성할 수 있고, 고른 캐릭터가 지워졌을 때만 막는다.
    characters.length < project.characters.length && '캐릭터',
    !emotionSet && '씬 모음',
    inpaint && !reference && REFERENCE_MISSING,
    inpaint && reference && !reference.image && REFERENCE_IMAGE_MISSING,
    items.some((item) => !item) && aidLabel,
    items.some((item) => item && !item.image) && `${aidLabel} 그림`,
    inpaint && preset && !supportsInpaint(preset.generation.model) && INPAINT_MODEL_MISSING,
    aid && preset && !supportsReferenceAid(preset.generation.model) && AID_MODEL_MISSING,
  ].filter(Boolean) as string[];
  return { project, preset, character, promptSet, characters, emotionSet, reference, missing };
}

/** 경고는 참고 칩 메뉴가 보여서 작업 화면 경고 띠에는 넣지 않는다. */
export const AID_MODEL_MISSING = 'V4.5 모델';
/** 작업 화면 경고 띠는 모델 이름으로 따로 알린다. */
export const INPAINT_MODEL_MISSING = '인페인트 모델';
const REFERENCE_MISSING = '인페인트';
const REFERENCE_IMAGE_MISSING = '참고 이미지';

/** 씬 i2i는 작업의 인페인트를 쓰지 않는다. */
export function img2imgMissing(missing: string[]): string[] {
  return missing.filter(
    (item) =>
      item !== REFERENCE_MISSING &&
      item !== REFERENCE_IMAGE_MISSING &&
      item !== INPAINT_MODEL_MISSING,
  );
}

/** 조합 칸이 있으면 조합이 하나라도 있어야 한다(후보가 비어도 SDStudio처럼 생성한다). */
export function hasScenePrompt(
  emotion: Pick<Emotion, 'prompt' | 'extraPrompts' | 'slots'>,
): boolean {
  if (emotion.slots?.length) return comboCount(emotion) > 0;
  return [emotion.prompt, ...(emotion.extraPrompts ?? [])].some((prompt) => prompt.trim());
}

export function projectsUsing(
  library: Library,
  kind:
    | 'preset'
    | 'character'
    | 'emotionSet'
    | 'reference'
    | 'pieceSet'
    | 'characterReference'
    | 'vibe',
  id: string,
): Project[] {
  if (kind === 'pieceSet') return projectsUsingPieceSet(library, id);
  if (kind === 'characterReference')
    return library.projects.filter((project) => project.characterReferenceIds.includes(id));
  if (kind === 'vibe') return library.projects.filter((project) => project.vibeIds.includes(id));
  if (kind === 'character')
    return library.projects.filter((project) =>
      project.characters.some((slot) => slot.characterId === id),
    );
  const key = {
    preset: 'presetId',
    emotionSet: 'emotionSetId',
    reference: 'referenceId',
  }[kind] as 'presetId' | 'emotionSetId' | 'referenceId';
  return library.projects.filter((project) => project[key] === id);
}

function projectsUsingPieceSet(library: Library, id: string): Project[] {
  const set = library.pieceSets.find((item) => item.id === id);
  if (!set?.name.trim()) return [];
  const prefix = `<${set.name.trim()}.`;
  const mentions = (...texts: Array<string | undefined>) =>
    texts.some((text) => text?.includes(prefix));
  return library.projects.filter((project) => {
    const resolved = resolveProject(library, project);
    return (
      mentions(
        resolved.preset?.commonPositive,
        resolved.preset?.backPositive,
        resolved.preset?.commonNegative,
        project.extraPrompt,
      ) ||
      resolved.characters.some(({ promptSet }) =>
        mentions(promptSet.positive, promptSet.negative),
      ) ||
      Boolean(
        resolved.emotionSet?.emotions.some((emotion) =>
          mentions(emotion.prompt, ...(emotion.extraPrompts ?? []), emotion.negative),
        ),
      )
    );
  });
}
