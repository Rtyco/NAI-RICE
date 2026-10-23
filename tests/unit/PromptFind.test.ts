import { describe, expect, it } from 'vitest';
import { createDefaultLibrary, createEmotion, createPreset } from '../../src/core/model/defaults';
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
    const preset = createPreset('P', { commonPositive: 'smile', commonNegative: 'smile, bad' });
    const emotion = {
      ...createEmotion('기쁨', 'smile'),
      extraPrompts: ['smile'],
      negative: 'smile',
    };
    const library = {
      ...base,
      presets: [preset],
      emotionSets: [{ id: 's', name: '씬', emotions: [emotion] }],
      freeGeneration: { ...base.freeGeneration, prompt: 'smile', negative: 'smile' },
    };
    const hits = findInLibrary(library, tag('smile'));
    expect(hits.map((hit) => [hit.section, ...hit.path])).toEqual([
      ['presets', 'P', '공통 포지티브'],
      ['presets', 'P', '공통 네거티브'],
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
