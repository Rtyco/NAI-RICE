import { describe, expect, it } from 'vitest';
import { createDefaultLibrary } from '../../src/core/model/defaults';
import { librarySchema } from '../../src/core/validation/schemas';

describe('설정 읽기', () => {
  it('1.1.4 이하 화면 설정에는 프롬프트 글자 크기 기본값(13px)이 들어간다', () => {
    const library = createDefaultLibrary();
    const parsed = librarySchema.parse({
      ...library,
      settings: { ...library.settings, appearance: { theme: 'rose', mode: 'light' } },
    });
    expect(parsed.settings.appearance).toEqual({
      theme: 'rose',
      mode: 'light',
      promptFontSize: 13,
    });
  });
});
