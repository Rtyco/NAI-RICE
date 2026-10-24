import { describe, expect, it } from 'vitest';
import {
  createCharacter,
  createDefaultLibrary,
  createEmotion,
  createEmotionSet,
  createPieceSet,
  createPreset,
  createProject,
  createPromptSet,
} from '../../src/core/model/defaults';
import {
  findInLibrary,
  findInRecord,
  listPromptFields,
  replaceInLibrary,
} from '../../src/core/model/promptFields';
import { findRanges, replaceAll, snippetAround } from '../../src/core/prompts/PromptFind';
import type { GenerationRecord } from '../../src/core/domain/types';

const tag = (text: string) => ({ text, wholeTag: true });
const plain = (text: string) => ({ text, wholeTag: false });
const found = (text: string, query: { text: string; wholeTag: boolean }) =>
  findRanges(text, query).map((range) => text.slice(range.start, range.end));

describe('프롬프트 찾기', () => {
  it('태그 단위는 쉼표·줄바꿈·괄호·가중치로 나뉜 태그와 통째로 같을 때만 찾아', () => {
    const text = 'silver hair, hairband, {hair}, 1.2::hair::, [ hair ]\nhair|Hair';
    expect(found(text, tag('hair'))).toEqual(['hair', 'hair', 'hair', 'hair', 'Hair']);
    expect(found(text, plain('hair'))).toHaveLength(7);
    const tags = 'red, silver hair,  blue eyes, x';
    expect(found(tags, tag('silver hair,blue eyes'))).toEqual(['silver hair,  blue eyes']);
    expect(found(tags, tag('hair, blue eyes'))).toEqual([]);
    expect(found('silver hair', tag(' silver hair '))).toEqual(['silver hair']);
  });

  it('조각 참조 안은 찾지 않아', () => {
    expect(found('<smile.big>, smile', tag('smile'))).toEqual(['smile']);
    expect(findRanges('<얼굴.smile>', plain('smile'))).toEqual([]);
  });

  it('특수 문자는 글자 그대로 찾고 빈 검색어는 아무것도 찾지 않아', () => {
    expect(found('a (b), c', plain('(b)'))).toEqual(['(b)']);
    expect(findRanges('a, b', tag('  '))).toEqual([]);
  });

  it('태그를 지우면 붙어 있던 쉼표도 함께 지워', () => {
    expect(replaceAll('a, smile, b', tag('smile'), '')).toBe('a, b');
    expect(replaceAll('smile, a', tag('smile'), '')).toBe('a');
    expect(replaceAll('x, smile, smile', tag('smile'), '')).toBe('x');
    expect(replaceAll('smile, smile, x', tag('smile'), '')).toBe('x');
    expect(replaceAll('a, smile, b', tag('smile'), ' grin ')).toBe('a, grin, b');
    expect(replaceAll('cats, dog', plain('s'), '')).toBe('cat, dog');
  });

  it('찾은 곳 앞뒤를 줄여서 보여 줘', () => {
    const text = `${'a'.repeat(40)}, smile\nb`;
    const [range] = findRanges(text, tag('smile'));
    expect(snippetAround(text, range, 4)).toEqual({
      before: '…aa, ',
      match: 'smile',
      after: ' ⏎ b',
    });
  });
});

describe('라이브러리 찾기·바꾸기', () => {
  it('찾는 칸과 바꾸는 칸이 같아', () => {
    const base = createDefaultLibrary();
    const preset = createPreset('P', {
      commonPositive: 'smile',
      backPositive: 'smile',
      commonNegative: 'smile, bad',
    });
    const project = {
      ...createProject('작업', { presetId: preset.id, emotionSetId: 's', referenceId: '' }),
      extraPrompt: 'smile',
    };
    const emotion = {
      ...createEmotion('기쁨', 'smile'),
      extraPrompts: ['smile'],
      negative: 'smile',
    };
    const library = {
      ...base,
      presets: [preset],
      projects: [project],
      emotionSets: [{ id: 's', name: '씬', emotions: [emotion] }],
      freeGeneration: { ...base.freeGeneration, prompt: 'smile', negative: 'smile' },
    };
    const hits = findInLibrary(library, tag('smile'));
    expect(hits.map((hit) => [hit.section, ...hit.path])).toEqual([
      ['presets', 'P', '상위 프롬프트'],
      ['presets', 'P', '하위 프롬프트'],
      ['presets', 'P', '공통 네거티브'],
      ['projects', '작업', '추가 프롬프트'],
      ['emotionSets', '씬', '기쁨', '프롬프트'],
      ['emotionSets', '씬', '기쁨', '캐릭터 2'],
      ['emotionSets', '씬', '기쁨', '네거티브'],
      ['free', '프롬프트'],
      ['free', '네거티브'],
    ]);
    const replaced = replaceInLibrary(library, tag('smile'), 'grin');
    expect(findInLibrary(replaced, tag('smile'))).toEqual([]);
    expect(findInLibrary(replaced, tag('grin'))).toHaveLength(hits.length);
    expect(replaced.presets[0].commonNegative).toBe('grin, bad');
    expect(listPromptFields(replaced)).toHaveLength(listPromptFields(library).length);
  });

  it('「이 항목」은 그 항목의 칸만 찾고 바꿔', () => {
    const base = createDefaultLibrary();
    const a = createPreset('A', { commonPositive: 'smile' });
    const b = createPreset('B', { commonPositive: 'smile' });
    const library = { ...base, presets: [a, b] };
    const only = { section: 'presets' as const, itemId: b.id };
    expect(findInLibrary(library, tag('smile'), 'prompts', only).map((hit) => hit.path[0])).toEqual(
      ['B'],
    );
    const replaced = replaceInLibrary(library, tag('smile'), 'grin', 'prompts', only);
    expect(replaced.presets.map((preset) => preset.commonPositive)).toEqual(['smile', 'grin']);
  });

  it('이름만 찾으면 태그 단위와 관계없이 글자가 든 이름을 찾고, 조각 이름을 바꾸면 참조도 바꿔', () => {
    const base = createDefaultLibrary();
    const set = createEmotionSet('기본 씬 6종', [
      { name: '중립', prompt: '중립' },
      { name: '기쁨', prompt: '' },
    ]);
    const character = createCharacter('아리아', [createPromptSet('중립 복장')]);
    const pieces = createPieceSet('표정', [{ name: '중립', prompt: 'neutral' }]);
    const library = {
      ...base,
      emotionSets: [set],
      characters: [character],
      pieceSets: [pieces],
      presets: [createPreset('P', { commonPositive: '<표정.중립>' })],
    };
    const hits = findInLibrary(library, tag('중립'), 'names');
    expect(hits.map((hit) => [hit.section, ...hit.path])).toEqual([
      ['characters', '아리아', '중립 복장', '세트 이름'],
      ['emotionSets', '기본 씬 6종', '중립', '씬 이름'],
      ['pieceSets', '표정', '중립', '조각 이름'],
    ]);
    expect(findInLibrary(library, tag('기본'), 'names').map((hit) => hit.path.at(-1))).toEqual([
      '이름',
    ]);

    const replaced = replaceInLibrary(library, tag('중립'), '무표정', 'names');
    expect(replaced.emotionSets[0].emotions.map((emotion) => emotion.name)).toEqual([
      '무표정',
      '기쁨',
    ]);
    expect(replaced.emotionSets[0].emotions[0].prompt).toBe('중립');
    expect(replaced.characters[0].promptSets[0].name).toBe('무표정 복장');
    expect(replaced.presets[0].commonPositive).toBe('<표정.무표정>');
    expect(
      replaceInLibrary(library, tag('중립'), '', 'names').emotionSets[0].emotions[0].name,
    ).toBe('중립');
    expect(replaceInLibrary(library, tag('표정'), 'a.b', 'names').pieceSets[0].name).toBe('표정');
  });

  it('생성 기록은 실제로 보낸 프롬프트에서 찾아', () => {
    const record = {
      projectId: 'p',
      id: 'r',
      emotionId: 'e',
      emotionName: '기쁨',
      createdAt: '2026-10-23T00:00:00.000Z',
      prompt: 'masterpiece',
      negativePrompt: 'bad',
      characterPrompt: '1girl, smile',
      characterNegativePrompt: '',
      extraCharacters: [{ name: 'B', prompt: 'smile', negative: '' }],
    } as unknown as GenerationRecord;
    expect(findInRecord(record, tag('smile'))).toMatchObject({
      field: '캐릭터 포지티브',
      range: { start: 7, end: 12 },
      count: 2,
    });
    expect(findInRecord(record, tag('nothing'))).toBeUndefined();
  });
});
