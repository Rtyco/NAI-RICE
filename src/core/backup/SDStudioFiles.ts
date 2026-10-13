import { z } from 'zod';
import type { Character, CharacterPromptSet, EmotionSet, PieceSet } from '../domain/types';
import { createCharacter, createPromptSet, newId } from '../model/defaults';
import { pieceRefsIn } from '../prompts/PromptPieces';

/** SDStudio 프로젝트 파일(ISession)은 이 다섯 칸이 있어야 프로젝트로 읽힌다(`isValidSession`). */
type SDStudioSceneFile = {
  version: 1;
  name: string;
  presets: Record<string, never>;
  presetShareds: Record<string, never>;
  inpaints: Record<string, never>;
  scenes: Record<string, unknown>;
  library: Record<string, { name: string; version: number; pieces: unknown[] }>;
};

function uniqueKey(name: string, taken: Set<string>): string {
  let key = name.trim() || '씬';
  for (let index = 2; taken.has(key); index += 1) key = `${name} ${index}`;
  taken.add(key);
  return key;
}

/**
 * SDStudio 「현재 프로젝트에 씬만 불러오기」로 읽히는 프로젝트 파일. 씬 프롬프트는 캐릭터마다
 * `characterPrompts[j]`에 넣는다. `presetShareds`가 없으면 SDStudio가 읽다가 멈춘다.
 */
export function exportSDStudioScenes(set: EmotionSet, pieceSets: PieceSet[]): SDStudioSceneFile {
  const taken = new Set<string>();
  const scenes: Record<string, unknown> = {};
  for (const emotion of set.emotions) {
    const name = uniqueKey(emotion.name, taken);
    scenes[name] = {
      type: 'scene',
      name,
      resolution: 'portrait',
      slots: [
        [
          {
            id: newId(),
            prompt: '',
            characterPrompts: [emotion.prompt, ...(emotion.extraPrompts ?? [])],
            enabled: true,
          },
        ],
      ],
      meta: {},
      imageMap: [],
      mains: [],
    };
  }
  const used = new Set(
    set.emotions.flatMap((emotion) =>
      [emotion.prompt, ...(emotion.extraPrompts ?? [])].flatMap((text) =>
        pieceRefsIn(text).map((ref) => ref.setName),
      ),
    ),
  );
  const library = Object.fromEntries(
    pieceSets
      .filter((pieceSet) => used.has(pieceSet.name))
      .map((pieceSet) => [pieceSet.name, exportSDStudioPieceSet(pieceSet)]),
  );
  return {
    version: 1,
    name: set.name,
    presets: {},
    presetShareds: {},
    inpaints: {},
    scenes,
    library,
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
