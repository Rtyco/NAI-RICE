import { describe, expect, it } from 'vitest';
import { computeLayout, freePlacementOf, imageBoxOf } from '../../src/core/imaging/CanvasLayout';
import {
  dragBox,
  handleAt,
  handlePoint,
  normalizeDegrees,
  type ImageBox,
} from '../../src/core/imaging/FreeTransform';
import { DEFAULT_LAYOUT } from '../../src/core/model/defaults';

const box: ImageBox = { cx: 100, cy: 100, width: 100, height: 50, rotation: 0, flipX: false };
const none = { shift: false, alt: false };

describe('자유 배치 레이아웃', () => {
  it('지금 배치를 그대로 옮겨 오면 같은 자리에 그려', () => {
    for (const fit of ['contain', 'cover'] as const) {
      const before = computeLayout({ ...DEFAULT_LAYOUT, fit, anchor: 'top' }, 1000, 2000);
      const free = freePlacementOf(imageBoxOf(before), before.referenceArea, 1000, 2000);
      const after = computeLayout({ ...DEFAULT_LAYOUT, fit: 'free', free }, 1000, 2000);
      expect(after.imagePlacement.x).toBeCloseTo(before.imagePlacement.x);
      expect(after.imagePlacement.y).toBeCloseTo(before.imagePlacement.y);
      expect(after.imagePlacement.width).toBeCloseTo(before.imagePlacement.width);
      expect(after.imagePlacement.height).toBeCloseTo(before.imagePlacement.height);
    }
  });

  it('참고 영역 비율이 바뀌어도 영역 안에서의 위치와 크기 비율을 유지해', () => {
    const free = { x: 0.25, y: 0.75, scaleX: 0.5, scaleY: 0.5, rotation: 30, flipX: true };
    const half = computeLayout({ ...DEFAULT_LAYOUT, fit: 'free', free }, 100, 100);
    expect(half.imagePlacement.x + half.imagePlacement.width / 2).toBeCloseTo(152);
    expect(half.imagePlacement.y + half.imagePlacement.height / 2).toBeCloseTo(624);
    expect(half.imagePlacement.width).toBeCloseTo(304);
    expect(half.rotation).toBe(30);
    expect(half.flipX).toBe(true);
    const wide = computeLayout(
      { ...DEFAULT_LAYOUT, fit: 'free', free, referenceSide: 'right', referenceRatio: 0.25 },
      100,
      100,
    );
    expect(wide.imagePlacement.x + wide.imagePlacement.width / 2).toBeCloseTo(912 + 304 * 0.25);
  });

  it('free 값이 없으면 전체 보이기로 그려', () => {
    const contain = computeLayout(DEFAULT_LAYOUT, 1000, 2000);
    const free = computeLayout({ ...DEFAULT_LAYOUT, fit: 'free' }, 1000, 2000);
    expect(free.imagePlacement).toEqual(contain.imagePlacement);
  });
});

describe('자유 변형 손잡이', () => {
  it('손잡이, 안쪽, 바깥을 구분해', () => {
    expect(handleAt(box, 150, 125, 6)).toBe('se');
    expect(handleAt(box, 100, 75, 6)).toBe('n');
    expect(handleAt(box, 110, 100, 6)).toBe('move');
    expect(handleAt(box, 300, 100, 6)).toBe('rotate');
  });

  it('회전한 상자의 손잡이 위치를 돌려서 계산해', () => {
    const point = handlePoint({ ...box, rotation: 90 }, 'e');
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(150);
  });

  it('모서리는 맞은편을 고정하고 비율을 유지해 키워', () => {
    const next = dragBox(box, 'se', { x: 150, y: 125 }, { x: 250, y: 175 }, none);
    expect(next.width).toBeCloseTo(200);
    expect(next.height).toBeCloseTo(100);
    expect(next.cx - next.width / 2).toBeCloseTo(50);
    expect(next.cy - next.height / 2).toBeCloseTo(75);
  });

  it('Shift를 누르면 모서리도 비율을 무시하고, Alt면 가운데를 고정해', () => {
    const free = dragBox(
      box,
      'se',
      { x: 150, y: 125 },
      { x: 250, y: 125 },
      { shift: true, alt: false },
    );
    expect(free.width).toBeCloseTo(200);
    expect(free.height).toBeCloseTo(50);
    const centered = dragBox(
      box,
      'e',
      { x: 150, y: 100 },
      { x: 170, y: 100 },
      { shift: false, alt: true },
    );
    expect(centered.width).toBeCloseTo(140);
    expect(centered.cx).toBeCloseTo(100);
  });

  it('변은 한 방향만 늘리고, 회전한 상자에서도 맞은편 변을 고정해', () => {
    const rotated = { ...box, rotation: 90 };
    const next = dragBox(rotated, 'e', { x: 100, y: 150 }, { x: 100, y: 170 }, none);
    expect(next.width).toBeCloseTo(120);
    expect(next.height).toBeCloseTo(50);
    expect(next.cx).toBeCloseTo(100);
    expect(next.cy).toBeCloseTo(110);
  });

  it('최소 크기 아래로 줄이지 않아', () => {
    const next = dragBox(box, 'e', { x: 150, y: 100 }, { x: -500, y: 100 }, none);
    expect(next.width).toBe(8);
  });

  it('회전은 중심 기준이고 Shift면 15도 단위로 맞춰', () => {
    const quarter = dragBox(box, 'rotate', { x: 200, y: 100 }, { x: 100, y: 200 }, none);
    expect(quarter.rotation).toBeCloseTo(90);
    const snapped = dragBox(
      box,
      'rotate',
      { x: 200, y: 100 },
      { x: 200, y: 120 },
      {
        shift: true,
        alt: false,
      },
    );
    expect(snapped.rotation).toBe(15);
    expect(normalizeDegrees(270)).toBe(-90);
  });

  it('Shift로 옮기면 많이 움직인 축으로만 옮겨', () => {
    const next = dragBox(box, 'move', { x: 0, y: 0 }, { x: 30, y: 5 }, { shift: true, alt: false });
    expect(next.cx).toBe(130);
    expect(next.cy).toBe(100);
  });
});
