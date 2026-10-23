import { describe, expect, it } from 'vitest';
import { autoscrollSpeed } from '../../src/renderer/useMiddleClickScroll';

describe('휠 클릭 자동 스크롤', () => {
  it('기준점 가까이에서는 멈춰 있다', () => {
    expect(autoscrollSpeed(0)).toBe(0);
    expect(autoscrollSpeed(10)).toBe(0);
    expect(autoscrollSpeed(-10)).toBe(0);
  });

  it('멀어질수록 빨라지고 위로 끌면 위로 간다', () => {
    expect(autoscrollSpeed(20)).toBeGreaterThan(0);
    expect(autoscrollSpeed(60)).toBeGreaterThan(autoscrollSpeed(20));
    expect(autoscrollSpeed(-60)).toBe(-autoscrollSpeed(60));
  });
});
