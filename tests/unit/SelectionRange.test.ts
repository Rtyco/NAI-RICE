import { describe, expect, it } from 'vitest';
import { rangeBetween } from '../../src/renderer/components/useBoxSelection';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('Shift 클릭 범위', () => {
  it('기준과 누른 항목 사이를 목록 순서로, 거꾸로 눌러도 같게', () => {
    expect(rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(rangeBetween(ids, 'c', 'c')).toEqual(['c']);
  });

  it('기준이 없거나 목록 밖(검색으로 숨음)이면 범위가 없어', () => {
    expect(rangeBetween(ids, undefined, 'c')).toBeUndefined();
    expect(rangeBetween(ids, 'z', 'c')).toBeUndefined();
  });
});
