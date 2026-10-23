import type { GenerationRecord, Library } from '../domain/types';
import { findRanges, replaceAll, type FindQuery, type TextRange } from '../prompts/PromptFind';
import { mapPromptTexts } from './mutations';

export type PromptFieldSection = 'presets' | 'characters' | 'emotionSets' | 'pieceSets' | 'free';

export type PromptField = {
  section: PromptFieldSection;
  /** 자유 생성은 빈 값 */
  itemId: string;
  /** 항목 이름부터 칸 이름까지 */
  path: string[];
  text: string;
};

export type PromptFieldHit = PromptField & { ranges: TextRange[] };

/** `mapPromptTexts`와 같은 칸을 돈다. */
export function listPromptFields(library: Library): PromptField[] {
  const fields: PromptField[] = [];
  const add = (section: PromptFieldSection, itemId: string, path: string[], text = '') =>
    fields.push({ section, itemId, path, text });
  for (const preset of library.presets) {
    add('presets', preset.id, [preset.name, '공통 포지티브'], preset.commonPositive);
    add('presets', preset.id, [preset.name, '공통 네거티브'], preset.commonNegative);
  }
  for (const character of library.characters)
    for (const set of character.promptSets) {
      add('characters', character.id, [character.name, set.name, '포지티브'], set.positive);
      add('characters', character.id, [character.name, set.name, '네거티브'], set.negative);
    }
  for (const set of library.emotionSets)
    for (const emotion of set.emotions) {
      add('emotionSets', set.id, [set.name, emotion.name, '프롬프트'], emotion.prompt);
      emotion.extraPrompts?.forEach((prompt, index) =>
        add('emotionSets', set.id, [set.name, emotion.name, `캐릭터 ${index + 2}`], prompt),
      );
      add('emotionSets', set.id, [set.name, emotion.name, '네거티브'], emotion.negative);
    }
  for (const set of library.pieceSets)
    for (const piece of set.pieces) add('pieceSets', set.id, [set.name, piece.name], piece.prompt);
  add('free', '', ['프롬프트'], library.freeGeneration.prompt);
  add('free', '', ['네거티브'], library.freeGeneration.negative);
  return fields;
}

export function findInLibrary(library: Library, query: FindQuery): PromptFieldHit[] {
  return listPromptFields(library)
    .map((field) => ({ ...field, ranges: findRanges(field.text, query) }))
    .filter((field) => field.ranges.length > 0);
}

export function replaceInLibrary(library: Library, query: FindQuery, replacement: string): Library {
  return mapPromptTexts(library, (text) => replaceAll(text, query, replacement));
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
