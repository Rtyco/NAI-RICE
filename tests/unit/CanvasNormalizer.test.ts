import { describe, expect, it } from 'vitest';
import { normalizeCanvasSize } from '../../src/core/imaging/CanvasNormalizer';

describe('normalizeCanvasSize', () => {
  it('1280×800을 늘이지 않고 1280×832로 패딩해', () => {
    expect(normalizeCanvasSize(1280, 800, 64)).toEqual({
      width: 1280,
      height: 832,
      paddingRight: 0,
      paddingBottom: 32,
      transform: {
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
        originalWidth: 1280,
        originalHeight: 800,
      },
    });
  });
});
