import type {
  Character,
  Emotion,
  EmotionSet,
  Library,
  PieceSet,
  Preset,
  Project,
  PromptPiece,
  Reference,
} from '../domain/types';
import { renamePieceRefs } from '../prompts/PromptPieces';
import { createEmotion, createPiece, createPromptSet, newId, readableId } from './defaults';

export function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

// ── 공통: 목록 항목 교체 ─────────────────────────────

type Collection =
  | 'presets'
  | 'characters'
  | 'emotionSets'
  | 'references'
  | 'projects'
  | 'pieceSets';
type ItemOf<K extends Collection> = Library[K][number];

export function upsert<K extends Collection>(library: Library, key: K, item: ItemOf<K>): Library {
  const list = library[key] as ItemOf<K>[];
  const exists = list.some((entry) => entry.id === item.id);
  return {
    ...library,
    [key]: exists ? list.map((entry) => (entry.id === item.id ? item : entry)) : [...list, item],
  };
}

export function patchItem<K extends Collection>(
  library: Library,
  key: K,
  id: string,
  recipe: (item: ItemOf<K>) => ItemOf<K>,
): Library {
  return {
    ...library,
    [key]: (library[key] as ItemOf<K>[]).map((entry) => (entry.id === id ? recipe(entry) : entry)),
  };
}

export function removeItem<K extends Collection>(library: Library, key: K, id: string): Library {
  return { ...library, [key]: (library[key] as ItemOf<K>[]).filter((entry) => entry.id !== id) };
}

/** 목록에서 항목을 빼서 toIndex(뺀 뒤 기준) 자리에 넣는다. */
export function moveItem<K extends Collection>(
  library: Library,
  key: K,
  id: string,
  toIndex: number,
): Library {
  const list = [...(library[key] as ItemOf<K>[])];
  const from = list.findIndex((entry) => entry.id === id);
  if (from < 0) return library;
  const [item] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, item);
  return { ...library, [key]: list };
}

const LINK_KEY = {
  presets: 'presetId',
  characters: 'characterId',
  emotionSets: 'emotionSetId',
  references: 'referenceId',
} as const;

/**
 * 항목을 지우고, 그 항목을 쓰던 작업은 replacementId 항목으로 바꾼다.
 * replacementId가 없으면 작업의 연결을 비워 둔다. 작업 화면에서 "(없음)"으로 보이고 다시 고르면 된다.
 */
export function removeItemReassigning(
  library: Library,
  key: keyof typeof LINK_KEY,
  id: string,
  replacementId?: string,
): Library {
  const removed = removeItem(library, key, id);
  const link = LINK_KEY[key];
  const character =
    key === 'characters'
      ? removed.characters.find((entry) => entry.id === replacementId)
      : undefined;
  return {
    ...removed,
    projects: removed.projects.map((project) => {
      if (project[link] !== id || !replacementId) return project;
      const next = { ...project, [link]: replacementId };
      if (character) next.promptSetId = character.promptSets[0].id;
      return next;
    }),
  };
}

export function duplicateName<K extends Collection>(
  library: Library,
  key: K,
  name: string,
): string {
  return uniqueName(
    `${name} 복사본`,
    (library[key] as ItemOf<K>[]).map((entry) => entry.name),
  );
}

// ── 감정 모음 ─────────────────────────────────────────

export function addEmotion(set: EmotionSet, name?: string, prompt = ''): EmotionSet {
  const emotion = createEmotion(
    uniqueName(
      name?.trim() || '새 감정',
      set.emotions.map((item) => item.name),
    ),
    prompt,
  );
  return { ...set, emotions: [...set.emotions, emotion] };
}

export function updateEmotion(
  set: EmotionSet,
  id: string,
  patch: Partial<Omit<Emotion, 'id'>>,
): EmotionSet {
  return {
    ...set,
    emotions: set.emotions.map((emotion) =>
      emotion.id === id ? { ...emotion, ...patch } : emotion,
    ),
  };
}

export function removeEmotion(set: EmotionSet, id: string): EmotionSet {
  return { ...set, emotions: set.emotions.filter((emotion) => emotion.id !== id) };
}

export function duplicateEmotion(set: EmotionSet, id: string): { set: EmotionSet; copy?: Emotion } {
  const index = set.emotions.findIndex((emotion) => emotion.id === id);
  if (index < 0) return { set };
  const source = set.emotions[index];
  const copy: Emotion = {
    ...source,
    id: newId(),
    name: uniqueName(
      `${source.name} 복사본`,
      set.emotions.map((item) => item.name),
    ),
  };
  const emotions = [...set.emotions];
  emotions.splice(index + 1, 0, copy);
  return { set: { ...set, emotions }, copy };
}

export function moveEmotion(set: EmotionSet, id: string, toIndex: number): EmotionSet {
  const from = set.emotions.findIndex((emotion) => emotion.id === id);
  if (from < 0) return set;
  const emotions = [...set.emotions];
  const [item] = emotions.splice(from, 1);
  emotions.splice(Math.max(0, Math.min(emotions.length, toIndex)), 0, item);
  return { ...set, emotions };
}

/** 같은 이름은 프롬프트를 덮어쓰고 없는 감정은 추가한다. */
export function mergeEmotions(
  set: EmotionSet,
  incoming: Array<{ name: string; prompt: string }>,
): EmotionSet {
  const emotions = [...set.emotions];
  for (const item of incoming) {
    const existing = emotions.findIndex((emotion) => emotion.name === item.name);
    if (existing >= 0) emotions[existing] = { ...emotions[existing], prompt: item.prompt };
    else emotions.push(createEmotion(item.name, item.prompt));
  }
  return { ...set, emotions };
}

export function cloneEmotionSet(set: EmotionSet, name: string): EmotionSet {
  return {
    id: newId(),
    name,
    emotions: set.emotions.map((emotion) => ({ ...emotion, id: newId() })),
  };
}

// ── 프롬프트 조각 ─────────────────────────────────────

export function addPiece(set: PieceSet, name?: string): { set: PieceSet; piece: PromptPiece } {
  const piece = createPiece(
    uniqueName(name ?? '새 조각', set.pieces.map((item) => item.name)),
  );
  return { set: { ...set, pieces: [...set.pieces, piece] }, piece };
}

export function updatePiece(
  set: PieceSet,
  id: string,
  patch: Partial<Omit<PromptPiece, 'id'>>,
): PieceSet {
  return {
    ...set,
    pieces: set.pieces.map((piece) => (piece.id === id ? { ...piece, ...patch } : piece)),
  };
}

export function removePiece(set: PieceSet, id: string): PieceSet {
  return { ...set, pieces: set.pieces.filter((piece) => piece.id !== id) };
}

export function clonePieceSet(set: PieceSet, name: string): PieceSet {
  return {
    id: newId(),
    name,
    pieces: set.pieces.map((piece) => ({ ...piece, id: newId() })),
  };
}

/** 라이브러리의 모든 프롬프트 칸에 같은 변환을 적용한다. 조각 참조 이름을 바꿀 때 쓴다. */
function mapPromptTexts(library: Library, map: (text: string) => string): Library {
  return {
    ...library,
    presets: library.presets.map((preset) => ({
      ...preset,
      commonPositive: map(preset.commonPositive),
      commonNegative: map(preset.commonNegative),
    })),
    characters: library.characters.map((character) => ({
      ...character,
      promptSets: character.promptSets.map((set) => ({
        ...set,
        positive: map(set.positive),
        negative: map(set.negative),
      })),
    })),
    emotionSets: library.emotionSets.map((set) => ({
      ...set,
      emotions: set.emotions.map((emotion) => ({ ...emotion, prompt: map(emotion.prompt) })),
    })),
    pieceSets: library.pieceSets.map((set) => ({
      ...set,
      pieces: set.pieces.map((piece) => ({ ...piece, prompt: map(piece.prompt) })),
    })),
  };
}

/** 세트 이름을 바꾸고, 그 세트를 부르던 `<세트.조각>` 참조도 모두 새 이름으로 바꾼다. */
export function renamePieceSet(library: Library, setId: string, name: string): Library {
  const set = library.pieceSets.find((item) => item.id === setId);
  if (!set || set.name === name) return library;
  const renamed = patchItem(library, 'pieceSets', setId, (item) => ({ ...item, name }));
  // 이름을 지우는 중이면(빈 칸) 참조는 그대로 둔다. 다시 이름을 쓰면 그때 바뀐다.
  if (!set.name.trim() || !name.trim()) return renamed;
  return mapPromptTexts(renamed, (text) =>
    renamePieceRefs(text, { setName: set.name }, { setName: name }),
  );
}

/** 조각 이름을 바꾸고, 그 조각을 부르던 참조도 바꾼다. */
export function renamePiece(
  library: Library,
  setId: string,
  pieceId: string,
  name: string,
): Library {
  const set = library.pieceSets.find((item) => item.id === setId);
  const piece = set?.pieces.find((item) => item.id === pieceId);
  if (!set || !piece || piece.name === name) return library;
  const renamed = patchItem(library, 'pieceSets', setId, (item) =>
    updatePiece(item, pieceId, { name }),
  );
  if (!piece.name.trim() || !name.trim()) return renamed;
  return mapPromptTexts(renamed, (text) =>
    renamePieceRefs(
      text,
      { setName: set.name, pieceName: piece.name },
      { setName: set.name, pieceName: name },
    ),
  );
}

// ── 캐릭터 ───────────────────────────────────────────

export function addPromptSet(
  character: Character,
  name?: string,
  values?: { positive?: string; negative?: string },
): { character: Character; setId: string } {
  const set = createPromptSet(
    uniqueName(
      name?.trim() || '새 프롬프트',
      character.promptSets.map((item) => item.name),
    ),
    values,
  );
  return { character: { ...character, promptSets: [...character.promptSets, set] }, setId: set.id };
}

export function updatePromptSet(
  character: Character,
  id: string,
  patch: Partial<{ name: string; positive: string; negative: string }>,
): Character {
  return {
    ...character,
    promptSets: character.promptSets.map((set) => (set.id === id ? { ...set, ...patch } : set)),
  };
}

export function removePromptSet(character: Character, id: string): Character {
  if (character.promptSets.length <= 1) return character;
  return { ...character, promptSets: character.promptSets.filter((set) => set.id !== id) };
}

export function cloneCharacter(character: Character, name: string): Character {
  return {
    ...structuredClone(character),
    id: newId(),
    name,
    createdAt: new Date().toISOString(),
    promptSets: character.promptSets.map((set) => ({ ...set, id: newId() })),
  };
}

export function clonePreset(preset: Preset, name: string): Preset {
  return { ...structuredClone(preset), id: newId(), name };
}

/** 레퍼런스 메타데이터만 복제한다. 이미지 파일 복사는 저장소가 처리한다. */
export function cloneReferenceMeta(reference: Reference, name: string): Reference {
  return {
    ...structuredClone(reference),
    id: readableId(name, 'reference'),
    name,
    updatedAt: new Date().toISOString(),
  };
}

// ── 작업 ─────────────────────────────────────────────

export function touchProject(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

/** 다른 프로젝트에서 이 항목을 쓰고 있을 때, 지운 프롬프트 세트를 참조하는 작업을 첫 세트로 돌린다. */
export function repairPromptSetRefs(library: Library, character: Character): Library {
  const ids = new Set(character.promptSets.map((set) => set.id));
  return {
    ...library,
    projects: library.projects.map((project) =>
      project.characterId === character.id && !ids.has(project.promptSetId)
        ? { ...project, promptSetId: character.promptSets[0].id }
        : project,
    ),
  };
}
