import { describe, expect, it } from 'vitest';
import {
  canPositionCharacters,
  cellName,
  fillCenters,
  nextCenter,
  requestCenters,
  snapToGrid,
} from '../../src/core/model/characterPositions';

describe('캐릭터 위치', () => {
  it('새 캐릭터는 웹처럼 가운데 줄부터 채워', () => {
    expect(fillCenters([undefined, undefined, undefined])).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.5 },
    ]);
    expect(nextCenter([{ x: 0.5, y: 0.5 }])).toEqual({ x: 0.3, y: 0.5 });
    expect(fillCenters([undefined, { x: 0.5, y: 0.5 }])[0]).toEqual({ x: 0.3, y: 0.5 });
  });

  it('5×5 칸에 맞추고 칸 이름을 붙여', () => {
    expect(snapToGrid({ x: 0.62, y: 0.95 })).toEqual({ x: 0.7, y: 0.9 });
    expect(cellName({ x: 0.1, y: 0.1 })).toBe('A1');
    expect(cellName({ x: 0.9, y: 0.5 })).toBe('E3');
  });

  it('V4는 두 명부터, V5는 한 명부터 위치를 정하고 V3는 정하지 않아', () => {
    expect(canPositionCharacters('nai-diffusion-4-5-full-inpainting', 1)).toBe(false);
    expect(canPositionCharacters('nai-diffusion-4-5-full-inpainting', 2)).toBe(true);
    expect(canPositionCharacters('nai-diffusion-5-full-inpainting', 1)).toBe(true);
    expect(canPositionCharacters('nai-diffusion-3-inpainting', 2)).toBe(false);
    const center = { x: 0.123, y: 0.456 };
    expect(requestCenters('nai-diffusion-5-full-inpainting', 'manual', [center])).toEqual([center]);
    expect(requestCenters('nai-diffusion-5-full-inpainting', 'ai', [center])).toBeUndefined();
  });
});
