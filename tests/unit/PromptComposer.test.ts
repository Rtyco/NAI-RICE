import { describe, expect, it } from 'vitest';
import {
  composeSeparatedPrompts,
  referenceInsetCount,
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
    expect(prompts).toEqual({ commonPositive: 'masterpiece', characterPositive: 'girl, reference inset' });
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

  it('감정 프롬프트를 공통 프롬프트 맨 끝(품질 태그·reference inset 앞)에 붙일 수 있어', () => {
    const prompts = composeSeparatedPrompts({
      commonPositive: 'masterpiece',
      qualityTags: 'very aesthetic',
      characterPositive: 'girl, silver hair',
      emotion: 'smile',
      emotionPosition: 'common-end',
      referenceInset: { enabled: true, position: 'common-end' },
    });
    expect(prompts).toEqual({
      commonPositive: 'masterpiece, smile, reference inset, very aesthetic',
      characterPositive: 'girl, silver hair',
    });
  });
});
