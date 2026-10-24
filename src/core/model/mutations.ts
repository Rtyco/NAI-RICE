import type {
  Character,
  CharacterSlot,
  Emotion,
  EmotionSet,
  Library,
  LibrarySection,
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

type Collection = LibrarySection | 'projects';
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

/** `toIndex`는 뺀 뒤 기준. */
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

/** 옮기는 항목끼리는 원래 순서를 지킨다. 끌어 온 항목이 대상보다 위였으면 대상 뒤, 아래였으면 앞. 옮길 수 없으면 undefined. */
function moveNextToTarget<T extends { id: string }>(
  list: T[],
  ids: string[],
  grabbedId: string,
  targetId: string,
): T[] | undefined {
  const moving = new Set(ids);
  if (moving.has(targetId)) return undefined;
  const after =
    list.findIndex((entry) => entry.id === grabbedId) <
    list.findIndex((entry) => entry.id === targetId);
  const rest = list.filter((entry) => !moving.has(entry.id));
  const at = rest.findIndex((entry) => entry.id === targetId);
  if (at < 0) return undefined;
  rest.splice(at + (after ? 1 : 0), 0, ...list.filter((entry) => moving.has(entry.id)));
  return rest;
}

export function moveItems<K extends Collection>(
  library: Library,
  key: K,
  ids: string[],
  grabbedId: string,
  targetId: string,
): Library {
  const moved = moveNextToTarget(library[key] as ItemOf<K>[], ids, grabbedId, targetId);
  return moved ? { ...library, [key]: moved } : library;
}

const LINK_KEY = {
  presets: 'presetId',
  emotionSets: 'emotionSetId',
  references: 'referenceId',
} as const;

/** 고르지 않아도 생성할 수 있어 대신할 항목이 없으면 목록에서 뺀다. */
const LIST_KEY = {
  characterReferences: 'characterReferenceIds',
  vibes: 'vibeIds',
} as const;

/** replacementId가 없으면 연결을 비운다(작업 화면에 「(없음)」). */
export function removeItemReassigning(
  library: Library,
  key: keyof typeof LINK_KEY | keyof typeof LIST_KEY | 'characters',
  id: string,
  replacementId?: string,
): Library {
  const removed = removeItem(library, key, id);
  if (key === 'vibes' || key === 'characterReferences') {
    const field = LIST_KEY[key];
    const replace = (ids: string[]) => [
      ...new Set(
        ids.flatMap((entry) => (entry !== id ? [entry] : replacementId ? [replacementId] : [])),
      ),
    ];
    return {
      ...removed,
      projects: removed.projects.map((project) =>
        project[field].includes(id) ? { ...project, [field]: replace(project[field]) } : project,
      ),
      freeGeneration: {
        ...removed.freeGeneration,
        [field]: replace(removed.freeGeneration[field]),
      },
    };
  }
  if (key === 'characters') {
    const character = removed.characters.find((entry) => entry.id === replacementId);
    const replace = (slots: CharacterSlot[]) =>
      slots.map((slot) =>
        slot.characterId === id && character
          ? { ...slot, characterId: character.id, promptSetId: character.promptSets[0].id }
          : slot,
      );
    return {
      ...removed,
      projects: removed.projects.map((project) =>
        project.characters.some((slot) => slot.characterId === id) && character
          ? { ...project, characters: replace(project.characters) }
          : project,
      ),
      freeGeneration: {
        ...removed.freeGeneration,
        characters: replace(removed.freeGeneration.characters),
      },
    };
  }
  const link = LINK_KEY[key];
  return {
    ...removed,
    projects: removed.projects.map((project) =>
      project[link] === id && replacementId ? { ...project, [link]: replacementId } : project,
    ),
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

export function addEmotion(set: EmotionSet, name?: string, prompt = ''): EmotionSet {
  const emotion = createEmotion(
    uniqueName(
      name?.trim() || '새 씬',
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

/** 끝의 빈 칸은 저장하지 않는다. */
export function withPromptAt(prompts: readonly string[], index: number, value: string): string[] {
  const next = [...prompts];
  while (next.length <= index) next.push('');
  next[index] = value;
  while (next.length && !next.at(-1)!.trim()) next.pop();
  return next;
}

/** `index` 0이 두 번째 캐릭터. */
export function withExtraPrompt(
  emotion: Pick<Emotion, 'extraPrompts'>,
  index: number,
  value: string,
): Pick<Emotion, 'extraPrompts'> {
  const prompts = withPromptAt(emotion.extraPrompts ?? [], index, value);
  return { extraPrompts: prompts.length ? prompts : undefined };
}

export function setEmotionsExcluded(project: Project, ids: string[], exclude: boolean): Project {
  const others = project.excludedEmotionIds.filter((id) => !ids.includes(id));
  return { ...project, excludedEmotionIds: exclude ? [...others, ...ids] : others };
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

/** 놓는 자리는 `moveItems`와 같다. */
export function moveEmotions(
  set: EmotionSet,
  ids: string[],
  grabbedId: string,
  targetId: string,
): EmotionSet {
  const emotions = moveNextToTarget(set.emotions, ids, grabbedId, targetId);
  return emotions ? { ...set, emotions } : set;
}

export function mergeEmotions(
  set: EmotionSet,
  incoming: Array<Pick<Emotion, 'name' | 'prompt' | 'negative'>>,
): EmotionSet {
  const emotions = [...set.emotions];
  for (const item of incoming) {
    const existing = emotions.findIndex((emotion) => emotion.name === item.name);
    if (existing >= 0)
      emotions[existing] = { ...emotions[existing], prompt: item.prompt, negative: item.negative };
    else emotions.push({ ...createEmotion(item.name, item.prompt), negative: item.negative });
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

export function addPiece(set: PieceSet, name?: string): { set: PieceSet; piece: PromptPiece } {
  const piece = createPiece(
    uniqueName(
      name ?? '새 조각',
      set.pieces.map((item) => item.name),
    ),
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

/** 자유 생성은 `itemId`가 빈 값이다. `path`는 항목 이름부터 칸 이름까지. */
export type PromptField = {
  section: LibrarySection | 'free' | 'projects';
  itemId: string;
  path: string[];
};

/** 찾기·바꾸기와 조각 이름 바꾸기가 같은 칸을 같은 순서로 돈다. */
export function mapPromptTexts(
  library: Library,
  map: (text: string, field: PromptField) => string,
): Library {
  const free = library.freeGeneration;
  const inFree = (label: string, text: string) =>
    map(text, { section: 'free', itemId: '', path: [label] });
  return {
    ...library,
    presets: library.presets.map((preset) => {
      const at = (label: string, text: string) =>
        map(text, { section: 'presets', itemId: preset.id, path: [preset.name, label] });
      return {
        ...preset,
        commonPositive: at('상위 프롬프트', preset.commonPositive),
        backPositive: at('하위 프롬프트', preset.backPositive),
        commonNegative: at('공통 네거티브', preset.commonNegative),
      };
    }),
    projects: library.projects.map((project) =>
      project.extraPrompt === undefined
        ? project
        : {
            ...project,
            extraPrompt: map(project.extraPrompt, {
              section: 'projects',
              itemId: project.id,
              path: [project.name, '추가 프롬프트'],
            }),
          },
    ),
    characters: library.characters.map((character) => ({
      ...character,
      promptSets: character.promptSets.map((set) => {
        const at = (label: string, text: string) =>
          map(text, {
            section: 'characters',
            itemId: character.id,
            path: [character.name, set.name, label],
          });
        return {
          ...set,
          positive: at('포지티브', set.positive),
          negative: at('네거티브', set.negative),
        };
      }),
    })),
    emotionSets: library.emotionSets.map((set) => ({
      ...set,
      emotions: set.emotions.map((emotion) => {
        const at = (label: string, text: string) =>
          map(text, {
            section: 'emotionSets',
            itemId: set.id,
            path: [set.name, emotion.name, label],
          });
        return {
          ...emotion,
          prompt: at('프롬프트', emotion.prompt),
          ...(emotion.extraPrompts && {
            extraPrompts: emotion.extraPrompts.map((prompt, index) =>
              at(`캐릭터 ${index + 2}`, prompt),
            ),
          }),
          ...(emotion.negative !== undefined && { negative: at('네거티브', emotion.negative) }),
        };
      }),
    })),
    pieceSets: library.pieceSets.map((set) => ({
      ...set,
      pieces: set.pieces.map((piece) => ({
        ...piece,
        prompt: map(piece.prompt, {
          section: 'pieceSets',
          itemId: set.id,
          path: [set.name, piece.name],
        }),
      })),
    })),
    freeGeneration: {
      ...free,
      prompt: inFree('프롬프트', free.prompt),
      negative: inFree('네거티브', free.negative),
    },
  };
}

export function renamePieceSet(library: Library, setId: string, name: string): Library {
  const set = library.pieceSets.find((item) => item.id === setId);
  if (!set || set.name === name) return library;
  const renamed = patchItem(library, 'pieceSets', setId, (item) => ({ ...item, name }));
  // 이름을 지우는 중(빈 칸)이면 참조는 다시 이름을 쓸 때 바뀐다.
  if (!set.name.trim() || !name.trim()) return renamed;
  return mapPromptTexts(renamed, (text) =>
    renamePieceRefs(text, { setName: set.name }, { setName: name }),
  );
}

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

/** 이미지 파일 복사는 저장소가 한다. */
export function cloneReferenceMeta(reference: Reference, name: string): Reference {
  return {
    ...structuredClone(reference),
    id: readableId(name, 'reference'),
    name,
    updatedAt: new Date().toISOString(),
  };
}

export function touchProject(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

/** 지운 프롬프트 세트를 쓰던 작업은 첫 세트로. */
export function repairPromptSetRefs(library: Library, character: Character): Library {
  const ids = new Set(character.promptSets.map((set) => set.id));
  const broken = (slot: CharacterSlot) =>
    slot.characterId === character.id && !ids.has(slot.promptSetId);
  const repair = (slots: CharacterSlot[]) =>
    slots.map((slot) =>
      broken(slot) ? { ...slot, promptSetId: character.promptSets[0].id } : slot,
    );
  return {
    ...library,
    projects: library.projects.map((project) =>
      project.characters.some(broken)
        ? { ...project, characters: repair(project.characters) }
        : project,
    ),
  };
}
