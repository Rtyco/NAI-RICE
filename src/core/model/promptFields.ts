import type { GenerationRecord, Library, LibrarySection } from '../domain/types';
import { findRanges, replaceAll, type FindQuery, type TextRange } from '../prompts/PromptFind';
import {
  mapPromptTexts,
  patchItem,
  renamePiece,
  renamePieceSet,
  updateEmotion,
  updatePromptSet,
  type PromptField,
} from './mutations';

export type FindPlace = Pick<PromptField, 'section' | 'itemId'>;

export type FindTarget = 'prompts' | 'names';

export type FindField = PromptField & { text: string };

export type FindFieldHit = FindField & { ranges: TextRange[] };

type NameField = FindField & { rename: (library: Library, name: string) => Library };

export function listPromptFields(library: Library): FindField[] {
  const fields: FindField[] = [];
  mapPromptTexts(library, (text, field) => {
    fields.push({ ...field, text });
    return text;
  });
  return fields;
}

/** 항목 이름과 그 안의 프롬프트 세트·씬·조각 이름 */
function listNameFields(library: Library): NameField[] {
  const fields: NameField[] = [];
  const add = (
    section: LibrarySection,
    itemId: string,
    path: string[],
    text: string,
    rename: NameField['rename'],
  ) => fields.push({ section, itemId, path, text, rename });
  const itemName = (section: LibrarySection, item: { id: string; name: string }) =>
    add(section, item.id, [item.name, '이름'], item.name, (current, name) => {
      if (section !== 'pieceSets')
        return patchItem(current, section, item.id, (entry) => ({ ...entry, name }));
      // 점이 들어간 모음 이름은 `<세트.조각>`으로 부를 수 없다.
      return name.includes('.') ? current : renamePieceSet(current, item.id, name);
    });
  for (const preset of library.presets) itemName('presets', preset);
  for (const character of library.characters) {
    itemName('characters', character);
    for (const set of character.promptSets)
      add(
        'characters',
        character.id,
        [character.name, set.name, '세트 이름'],
        set.name,
        (current, name) =>
          patchItem(current, 'characters', character.id, (entry) =>
            updatePromptSet(entry, set.id, { name }),
          ),
      );
  }
  for (const set of library.emotionSets) {
    itemName('emotionSets', set);
    for (const emotion of set.emotions)
      add(
        'emotionSets',
        set.id,
        [set.name, emotion.name, '씬 이름'],
        emotion.name,
        (current, name) =>
          patchItem(current, 'emotionSets', set.id, (entry) =>
            updateEmotion(entry, emotion.id, { name }),
          ),
      );
  }
  for (const reference of library.references) itemName('references', reference);
  for (const reference of library.characterReferences) itemName('characterReferences', reference);
  for (const vibe of library.vibes) itemName('vibes', vibe);
  for (const set of library.pieceSets) {
    itemName('pieceSets', set);
    for (const piece of set.pieces)
      add('pieceSets', set.id, [set.name, piece.name, '조각 이름'], piece.name, (current, name) =>
        renamePiece(current, set.id, piece.id, name),
      );
  }
  return fields;
}

const inPlace = (place: FindPlace, only?: FindPlace) =>
  !only || (place.section === only.section && place.itemId === only.itemId);

/** 이름은 태그 목록이 아니라서 「태그 단위」와 관계없이 글자가 들어 있으면 찾는다. */
function targetQuery(query: FindQuery, target: FindTarget): FindQuery {
  return target === 'names' ? { ...query, wholeTag: false } : query;
}

export function findInLibrary(
  library: Library,
  query: FindQuery,
  target: FindTarget = 'prompts',
  only?: FindPlace,
): FindFieldHit[] {
  const fields = target === 'names' ? listNameFields(library) : listPromptFields(library);
  return fields
    .filter((field) => inPlace(field, only))
    .map(({ section, itemId, path, text }) => ({
      section,
      itemId,
      path,
      text,
      ranges: findRanges(text, targetQuery(query, target)),
    }))
    .filter((field) => field.ranges.length > 0);
}

/** 바꾸면 비게 되는 이름은 그대로 둔다. */
export function replaceInLibrary(
  library: Library,
  query: FindQuery,
  replacement: string,
  target: FindTarget = 'prompts',
  only?: FindPlace,
): Library {
  if (target === 'prompts')
    return mapPromptTexts(library, (text, place) =>
      inPlace(place, only) ? replaceAll(text, query, replacement) : text,
    );
  let next = library;
  for (const field of listNameFields(library)) {
    if (!inPlace(field, only)) continue;
    const name = replaceAll(field.text, targetQuery(query, target), replacement);
    if (name !== field.text && name.trim()) next = field.rename(next, name);
  }
  return next;
}

export type GenerationFindHit = {
  projectId: string;
  id: string;
  emotionId: string;
  emotionName: string;
  createdAt: string;
  /** 처음 찾은 칸 */
  field: string;
  text: string;
  range: TextRange;
  /** 모든 칸에서 찾은 수 */
  count: number;
};

/** 실제로 보낸 프롬프트에서 찾는다. 씬·자유 생성 입력은 그 안에 들어 있다. */
export function findInRecord(
  record: GenerationRecord,
  query: FindQuery,
): GenerationFindHit | undefined {
  const fields: Array<[string, string]> = [
    ['포지티브', record.prompt],
    ['네거티브', record.negativePrompt],
    ['캐릭터 포지티브', record.characterPrompt],
    ['캐릭터 네거티브', record.characterNegativePrompt],
    ...(record.extraCharacters ?? []).flatMap((extra, index): Array<[string, string]> => [
      [`캐릭터 ${index + 2} 포지티브`, extra.prompt],
      [`캐릭터 ${index + 2} 네거티브`, extra.negative],
    ]),
  ];
  let first: { field: string; text: string; range: TextRange } | undefined;
  let count = 0;
  for (const [field, text] of fields) {
    const ranges = findRanges(text, query);
    if (ranges.length && !first) first = { field, text, range: ranges[0] };
    count += ranges.length;
  }
  if (!first) return undefined;
  const { projectId, id, emotionId, emotionName, createdAt } = record;
  return { projectId, id, emotionId, emotionName, createdAt, ...first, count };
}
