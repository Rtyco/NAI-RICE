import type {
  AppSettings,
  CanvasLayout,
  Character,
  CharacterPromptSet,
  Emotion,
  EmotionSet,
  GenerationSettings,
  Library,
  PieceSet,
  Preset,
  Project,
  PromptPiece,
  Reference,
} from '../domain/types';
import { DEFAULT_OUTPUT_FILENAME_TEMPLATE } from '../output/OutputFilename';
import { NAI_MODELS } from '../providers/NaiModels';

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

/** 폴더 이름으로도 쓰이므로 사람이 읽을 수 있는 접두사와 짧은 무작위 접미사를 붙인다. */
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
    maskExpansionPx: 8,
    backgroundThreshold: 16,
    updatedAt: new Date().toISOString(),
  };
}

export function createProject(
  name: string,
  parts: { presetId: string; character: Character; emotionSetId: string; referenceId: string },
): Project {
  const now = new Date().toISOString();
  return {
    id: readableId(name, 'project'),
    name: name.trim() || '새 작업',
    presetId: parts.presetId,
    characterId: parts.character.id,
    promptSetId: parts.character.promptSets[0].id,
    emotionSetId: parts.emotionSetId,
    referenceId: parts.referenceId,
    excludedEmotionIds: [],
    favorites: {},
    createdAt: now,
    updatedAt: now,
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  outputFilenameTemplate: DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  keepDiagnosticCanvas: true,
  export: { format: 'png', quality: 90, target: 'favorite' },
  requestDelayMs: 300,
  tagAutocomplete: true,
  appearance: { theme: 'navy', mode: 'dark' },
  update: { autoCheck: true, skippedVersion: '' },
};

export function createDefaultLibrary(): Library {
  return {
    schemaVersion: 2,
    settings: structuredClone(DEFAULT_SETTINGS),
    presets: [createPreset()],
    characters: [],
    emotionSets: [createEmotionSet('기본 감정 6종')],
    references: [],
    projects: [],
    pieceSets: [],
  };
}

// ── 조회 ────────────────────────────────────────────

export type ResolvedProject = {
  project: Project;
  preset?: Preset;
  character?: Character;
  promptSet?: CharacterPromptSet;
  emotionSet?: EmotionSet;
  reference?: Reference;
  missing: string[];
};

export function resolveProject(library: Library, project: Project): ResolvedProject {
  const preset = library.presets.find((item) => item.id === project.presetId);
  const character = library.characters.find((item) => item.id === project.characterId);
  const promptSet =
    character?.promptSets.find((item) => item.id === project.promptSetId) ??
    character?.promptSets[0];
  const emotionSet = library.emotionSets.find((item) => item.id === project.emotionSetId);
  const reference = library.references.find((item) => item.id === project.referenceId);
  const missing = [
    !preset && '생성 설정',
    !character && '캐릭터',
    !emotionSet && '감정 모음',
    !reference && '인페인트',
    reference && !reference.image && '참고 이미지',
  ].filter(Boolean) as string[];
  return { project, preset, character, promptSet, emotionSet, reference, missing };
}

/** 이 항목을 쓰고 있는 작업 목록. 삭제 전 확인용. */
export function projectsUsing(
  library: Library,
  kind: 'preset' | 'character' | 'emotionSet' | 'reference' | 'pieceSet',
  id: string,
): Project[] {
  if (kind === 'pieceSet') return projectsUsingPieceSet(library, id);
  const key = {
    preset: 'presetId',
    character: 'characterId',
    emotionSet: 'emotionSetId',
    reference: 'referenceId',
  }[kind] as 'presetId' | 'characterId' | 'emotionSetId' | 'referenceId';
  return library.projects.filter((project) => project[key] === id);
}

/** 생성 설정·캐릭터 프롬프트 세트·감정 모음 중 하나라도 이 세트의 조각을 부르는 작업. */
function projectsUsingPieceSet(library: Library, id: string): Project[] {
  const set = library.pieceSets.find((item) => item.id === id);
  if (!set?.name.trim()) return [];
  const prefix = `<${set.name.trim()}.`;
  const mentions = (...texts: Array<string | undefined>) =>
    texts.some((text) => text?.includes(prefix));
  return library.projects.filter((project) => {
    const resolved = resolveProject(library, project);
    return (
      mentions(resolved.preset?.commonPositive, resolved.preset?.commonNegative) ||
      mentions(resolved.promptSet?.positive, resolved.promptSet?.negative) ||
      Boolean(resolved.emotionSet?.emotions.some((emotion) => mentions(emotion.prompt)))
    );
  });
}
