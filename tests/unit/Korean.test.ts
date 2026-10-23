import { describe, expect, it } from 'vitest';
import { withRo } from '../../src/renderer/lib/korean';

describe('으로/로', () => {
  it('받침이 있으면 으로, 없거나 ㄹ 받침이면 로', () => {
    expect(withRo('일반 생성')).toBe('일반 생성으로');
    expect(withRo('인페인트')).toBe('인페인트로');
    expect(withRo('레퍼런스')).toBe('레퍼런스로');
    expect(withRo('서울')).toBe('서울로');
  });

  it('한글이 아닌 글자로 끝나면 로', () => {
    expect(withRo('i2i')).toBe('i2i로');
  });
});
