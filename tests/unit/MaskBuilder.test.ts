import { describe, expect, it } from 'vitest';
import { buildGenerationMask, invertMask } from '../../src/core/imaging/MaskBuilder';

describe('buildGenerationMask', () => {
  it('보호 영역을 KEEP으로 남기고 수동 보정을 우선해', () => {
    const background = new Uint8Array(25).fill(1);
    const overrides = new Int8Array(25).fill(-1);
    overrides[0] = 0;
    overrides[12] = 1;
    const mask = buildGenerationMask({
      width: 5,
      height: 5,
      backgroundMask: background,
      referenceRect: { x: 1, y: 1, width: 3, height: 3 },
      expansionPx: 0,
      overrides,
    });
    expect(mask[0]).toBe(0);
    expect(mask[6]).toBe(0);
    expect(mask[12]).toBe(1);
    expect(mask[24]).toBe(1);
    expect(invertMask(mask)[24]).toBe(0);
  });
});
