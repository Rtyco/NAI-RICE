import { describe, expect, it } from 'vitest';
import {
  buildGenerationMask,
  inferSavedExpansion,
  manualOverrides,
} from '../../src/core/imaging/MaskBuilder';
import { cropOutside } from '../../src/core/imaging/OutputCropper';
import { expandRect } from '../../src/core/imaging/rects';

describe('expandRect', () => {
  it('캔버스 가장자리에 붙은 쪽은 잘라 내고 반대쪽 여백을 두 배로 늘리지 않아', () => {
    // 자동 구성 1024×1024, 왼쪽 레퍼런스 256px, 확장 8px
    expect(expandRect({ x: 0, y: 0, width: 256, height: 1024 }, 8, 1024, 1024)).toEqual({
      x: 0,
      y: 0,
      width: 264,
      height: 1024,
    });
  });
});

describe('cropOutside', () => {
  it('보호 영역과 겹치는 쪽을 잘라 결과 크롭이 보호 영역 바로 뒤에서 시작해', () => {
    const generation = { x: 256, y: 0, width: 768, height: 1024 };
    const blocked = expandRect({ x: 0, y: 0, width: 256, height: 1024 }, 8, 1024, 1024);
    expect(cropOutside(generation, blocked)).toEqual({ x: 264, y: 0, width: 760, height: 1024 });
  });

  it('레퍼런스가 오른쪽·위쪽에 있어도 겹치는 쪽만 잘라', () => {
    expect(
      cropOutside(
        { x: 0, y: 0, width: 768, height: 1024 },
        { x: 760, y: 0, width: 264, height: 1024 },
      ),
    ).toEqual({ x: 0, y: 0, width: 760, height: 1024 });
    expect(
      cropOutside(
        { x: 0, y: 200, width: 832, height: 1016 },
        { x: 0, y: 0, width: 832, height: 216 },
      ),
    ).toEqual({ x: 0, y: 216, width: 832, height: 1000 });
  });

  it('겹치지 않으면 그대로 둬', () => {
    const output = { x: 300, y: 0, width: 700, height: 1024 };
    expect(cropOutside(output, { x: 0, y: 0, width: 264, height: 1024 })).toBe(output);
  });
});

describe('저장된 마스크', () => {
  // 왼쪽 4칸 레퍼런스, 16×4 캔버스
  const width = 16;
  const height = 4;
  const base = {
    width,
    height,
    backgroundMask: Uint8Array.from({ length: width * height }, (_, pixel) =>
      pixel % width >= 4 ? 1 : 0,
    ),
    referenceRect: { x: 0, y: 0, width: 4, height },
  };

  it('예전 두 배 확장으로 저장된 띠는 자동으로 보고, 붓으로 칠한 픽셀만 남겨', () => {
    // 예전 버전은 확장 2px가 오른쪽으로 4px 들어갔다(4~7번 칸 보호).
    const saved = Uint8Array.from(base.backgroundMask, (value, pixel) =>
      value && pixel % width >= 8 ? 1 : 0,
    );
    const painted = 2 * width + 15;
    saved[painted] = 0;
    expect(inferSavedExpansion(saved, base)).toBe(4);

    const overrides = manualOverrides(saved, [
      buildGenerationMask({ ...base, expansionPx: 2 }),
      buildGenerationMask({ ...base, expansionPx: inferSavedExpansion(saved, base) }),
    ]);
    expect(Array.from(overrides).filter((value) => value >= 0)).toEqual([0]);

    // 이제 확장 2px는 정확히 2칸(4~5번)만 보호하고, 칠한 픽셀은 그대로 보호된다.
    const mask = buildGenerationMask({ ...base, expansionPx: 2, overrides });
    expect(mask[5]).toBe(0);
    expect(mask[6]).toBe(1);
    expect(mask[painted]).toBe(0);
  });
});
