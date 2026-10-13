import type { CharacterCenter, CharacterPositionMode } from '../domain/types';
import { modelInfo } from '../providers/NaiModels';

/** V4·V4.5 5×5 칸의 가운데 값(NovelAI 웹과 같다). */
export const POSITION_GRID = [0.1, 0.3, 0.5, 0.7, 0.9] as const;

/** 웹처럼 가운데 줄(가운데 → 왼쪽·오른쪽)부터, 나머지는 가운데에서 가까운 순. */
const DEFAULT_ORDER: CharacterCenter[] = [
  ...[0.5, 0.3, 0.7, 0.1, 0.9].map((x) => ({ x, y: 0.5 })),
  ...[0.1, 0.3, 0.7, 0.9]
    .flatMap((y) => POSITION_GRID.map((x) => ({ x, y })))
    .sort(
      (a, b) =>
        Math.hypot(a.x - 0.5, a.y - 0.5) - Math.hypot(b.x - 0.5, b.y - 0.5) ||
        Math.abs(a.y - 0.5) - Math.abs(b.y - 0.5) ||
        a.x - b.x ||
        a.y - b.y,
    ),
];

function nearest(value: number): number {
  return POSITION_GRID.reduce((best, cell) =>
    Math.abs(cell - value) < Math.abs(best - value) ? cell : best,
  );
}

export function snapToGrid(center: CharacterCenter): CharacterCenter {
  return { x: nearest(center.x), y: nearest(center.y) };
}

/** V5는 어디든(웹은 0.001 단위), V4·V4.5는 5×5 칸. */
export function freeformPosition(model: string): boolean {
  return modelInfo(model)?.generation === 'v5';
}

/** V4·V4.5는 두 명 이상일 때만(웹 `canPositionOneCharacter`). */
export function canPositionCharacters(model: string, count: number): boolean {
  const generation = modelInfo(model)?.generation;
  if (generation === 'v5') return count >= 1;
  return generation === 'v4' && count >= 2;
}

/** 다 찼으면 가운데. */
export function nextCenter(taken: CharacterCenter[]): CharacterCenter {
  const free = DEFAULT_ORDER.find(
    (cell) => !taken.some((center) => Math.hypot(center.x - cell.x, center.y - cell.y) < 0.1),
  );
  return free ?? { x: 0.5, y: 0.5 };
}

/** 이미 정한 위치는 그대로 둔다. */
export function fillCenters(centers: Array<CharacterCenter | undefined>): CharacterCenter[] {
  const result: CharacterCenter[] = [];
  const placed = centers.filter((center): center is CharacterCenter => Boolean(center));
  for (const center of centers) {
    const next = center ?? nextCenter([...placed, ...result]);
    result.push(next);
  }
  return result;
}

/** 위치를 쓰지 않으면 undefined(`use_coords: false`). V4·V4.5는 5×5 칸에 맞춘다. */
export function requestCenters(
  model: string,
  mode: CharacterPositionMode,
  centers: Array<CharacterCenter | undefined>,
): CharacterCenter[] | undefined {
  if (mode !== 'manual' || !canPositionCharacters(model, centers.length)) return undefined;
  const filled = fillCenters(centers);
  return freeformPosition(model) ? filled : filled.map(snapToGrid);
}

/** 열 A~E, 행 1~5 */
export function cellName(center: CharacterCenter): string {
  const snapped = snapToGrid(center);
  return `${'ABCDE'[POSITION_GRID.indexOf(snapped.x as never)]}${POSITION_GRID.indexOf(snapped.y as never) + 1}`;
}
