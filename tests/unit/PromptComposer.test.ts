import { describe, expect, it } from 'vitest';
import {
  composeSeparatedPrompts,
  referenceInsetCount,
  splitAtLastMarker,
} from '../../src/core/prompts/PromptComposer';

describe('composeSeparatedPrompts', () => {
  it('직접 쓴 reference inset은 그 자리에 두고 하나 더 넣지 않아', () => {
    const prompts = composeSeparatedPrompts({
      commonPositive: '1girl, [soft light]',
      characterPositive: ', blue hair,',
      emotion: '{smile:1.2}, reference inset',
    });

    expect(prompts.commonPositive).toBe('1girl, [soft light]');
    expect(prompts.characterPositive).toBe('blue hair, {smile:1.2}, reference inset');
    expect(referenceInsetCount(prompts.commonPositive)).toBe(0);
    expect(referenceInsetCount(prompts.characterPositive)).toBe(1);
  });

  it('reference inset을 고른 위치에 넣고, 품질 태그보다 앞에 둬', () => {
    const base = {
      commonPositive: 'masterpiece',
      qualityTags: 'very aesthetic',
      characterPositive: 'girl, silver hair',
      emotion: 'smile',
    };
    const at = (position: 'common-start' | 'common-end' | 'character-start' | 'character-end') =>
      composeSeparatedPrompts({ ...base, referenceInset: { enabled: true, position } });

    expect(at('common-start').commonPositive).toBe('reference inset, masterpiece, very aesthetic');
    expect(at('common-end').commonPositive).toBe('masterpiece, reference inset, very aesthetic');
    expect(at('character-start')).toEqual({
      commonPositive: 'masterpiece, very aesthetic',
      characterPositive: 'girl, reference inset, silver hair, smile',
    });
    expect(at('character-end').characterPositive).toBe('girl, silver hair, smile, reference inset');
  });

  it('캐릭터 맨 앞은 성별 태그가 없으면 정말 맨 앞에 넣어', () => {
    const prompts = composeSeparatedPrompts({
      characterPositive: 'silver hair',
      referenceInset: { enabled: true, position: 'character-start' },
    });
    expect(prompts.characterPositive).toBe('reference inset, silver hair');
    expect(
      composeSeparatedPrompts({
        characterPositive: '1girl, red eyes',
        referenceInset: { enabled: true, position: 'character-start' },
      }).characterPositive,
    ).toBe('1girl, reference inset, red eyes');
  });

  it('끄면 넣지 않고 직접 쓴 reference inset도 지우지 않아', () => {
    const prompts = composeSeparatedPrompts({
      commonPositive: 'masterpiece',
      characterPositive: 'girl, reference inset',
      referenceInset: { enabled: false, position: 'common-start' },
    });
    expect(prompts).toEqual({
      commonPositive: 'masterpiece',
      characterPositive: 'girl, reference inset',
    });
    expect(
      composeSeparatedPrompts({
        commonPositive: 'masterpiece',
        referenceInset: { enabled: false, position: 'common-start' },
      }).commonPositive,
    ).toBe('masterpiece');
  });

  it('비어 있는 캐릭터 프롬프트는 공통 프롬프트에 합치지 않아', () => {
    expect(composeSeparatedPrompts({ commonPositive: 'cinematic lighting' })).toEqual({
      commonPositive: 'reference inset, cinematic lighting',
      characterPositive: '',
    });
  });

  it('감정 프롬프트를 상위와 하위 사이(품질 태그·reference inset 앞)에 넣을 수 있어', () => {
    const prompts = composeSeparatedPrompts({
      commonPositive: 'masterpiece',
      qualityTags: 'very aesthetic',
      characterPositive: 'girl, silver hair',
      backPositive: 'detailed',
      emotion: 'smile',
      emotionPosition: 'middle',
      referenceInset: { enabled: true, position: 'common-end' },
    });
    expect(prompts).toEqual({
      commonPositive: 'masterpiece, smile, detailed, reference inset, very aesthetic',
      characterPositive: 'girl, silver hair',
    });
  });
});

describe('SDStudio 상위·추가·중간·하위', () => {
  const common = (front: string, emotion: string, back = '', extraPrompt = '') =>
    composeSeparatedPrompts({
      commonPositive: front,
      extraPrompt,
      backPositive: back,
      qualityTags: 'very aesthetic',
      emotion,
      emotionPosition: 'middle',
      referenceInset: { enabled: false, position: 'common-end' },
    }).commonPositive;

  it('상위·추가 뒤, 하위 앞에 씬을 넣어', () => {
    expect(common('masterpiece', 'smile', 'detailed background', 'night')).toBe(
      'masterpiece, night, smile, detailed background, very aesthetic',
    );
  });

  it('상위의 | 자리마다 씬을 |로 나눈 조각을 차례로 넣고, 남는 조각은 상위 끝에 붙여', () => {
    expect(common('1girl, |', 'smile', 'masterpiece')).toBe(
      '1girl, smile, masterpiece, very aesthetic',
    );
    expect(common('a, |, b', 'x, |, y', 'c')).toBe('a, x, b, y, c, very aesthetic');
    expect(common('a, |, b', 'x', 'c')).toBe('a, x, b, c, very aesthetic');
    expect(common('a, |, b', 'x, |, y, |, z')).toBe('a, x, b, y, z, very aesthetic');
    expect(common('a\n|\nb', '')).toBe('a, b, very aesthetic');
    expect(common('a, b', 'x, |, y')).toBe('a, b, x, y, very aesthetic');
  });

  it('추가 프롬프트는 상위 끝에 붙은 채로 | 자리를 함께 채워', () => {
    // SDStudio: 상위 a, |와 추가 e → a, |, e. 중간 x는 자리에, e는 그 뒤에 남는다.
    expect(common('a, |', 'x', 'c', 'e')).toBe('a, x, e, c, very aesthetic');
  });

  it('하위의 |는 자리가 아니라 지워', () => {
    expect(common('a', 'x', 'b, |, c')).toBe('a, x, b, c, very aesthetic');
  });

  it('{a|b}와 붙여 쓴 a|b는 자리가 아니야', () => {
    expect(common('{a|b}, c|d', 'x')).toBe('{a|b}, c|d, x, very aesthetic');
  });

  it('캐릭터 뒤에 붙이면 상위의 | 자리를 지우고, 캐릭터 프롬프트의 | 자리는 늘 써', () => {
    const prompts = composeSeparatedPrompts({
      commonPositive: 'a, |, b',
      extraPrompt: 'e',
      backPositive: 'c',
      characterPositive: 'girl, |, silver hair',
      emotion: 'smile',
      emotionPosition: 'character-end',
      referenceInset: { enabled: false, position: 'common-end' },
    });
    expect(prompts).toEqual({
      commonPositive: 'a, b, e, c',
      characterPositive: 'girl, smile, silver hair',
    });
  });
});

describe('splitAtLastMarker', () => {
  it('마지막 | 자리 앞은 상위, 뒤는 하위로 나눠', () => {
    expect(splitAtLastMarker('a, |, b, |, c')).toEqual({ front: 'a, |, b', back: 'c' });
    expect(splitAtLastMarker('a\n|\nb')).toEqual({ front: 'a', back: 'b' });
    expect(splitAtLastMarker('a, |')).toEqual({ front: 'a', back: '' });
    expect(splitAtLastMarker('{a|b}')).toBeUndefined();
  });
});
