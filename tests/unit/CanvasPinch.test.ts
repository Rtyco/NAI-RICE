import { describe, expect, it } from 'vitest';
import { pinchView } from '../../src/renderer/components/canvasViewport';

describe('두 손가락 확대', () => {
  const start = { distance: 100, mid: { x: 50, y: 20 }, scale: 1, from: { x: 10, y: 0 } };

  it('손가락 사이가 벌어진 만큼 키우고 가운데 지점은 손가락 가운데에 남아', () => {
    const { scale, offset } = pinchView(start, { distance: 200, mid: { x: 50, y: 20 } });
    expect(scale).toBe(2);
    // 가운데 지점은 캔버스 원점에서 (40, 20) 떨어져 있었고, 두 배면 (80, 40)이다.
    expect(offset).toEqual({ x: 50 - 80, y: 20 - 40 });
  });

  it('배율은 그대로 두고 손가락을 옮기면 같이 움직여', () => {
    const { scale, offset } = pinchView(start, { distance: 100, mid: { x: 80, y: 60 } });
    expect(scale).toBe(1);
    expect(offset).toEqual({ x: 40, y: 40 });
  });
});
