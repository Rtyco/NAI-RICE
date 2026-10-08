import type { Rect } from '../domain/types';
import { clampRect } from './rects';

type Candidate = { rect: Rect; direction: 'left' | 'right' | 'top' | 'bottom'; score: number };

export function suggestOutputRect(
  reference: Rect,
  canvasWidth: number,
  canvasHeight: number,
  targetAspect = 1,
  preferredDirection?: Candidate['direction'],
): Rect {
  const candidates: Omit<Candidate, 'score'>[] = [
    { direction: 'left', rect: { x: 0, y: 0, width: reference.x, height: canvasHeight } },
    {
      direction: 'right',
      rect: {
        x: reference.x + reference.width,
        y: 0,
        width: canvasWidth - reference.x - reference.width,
        height: canvasHeight,
      },
    },
    { direction: 'top', rect: { x: 0, y: 0, width: canvasWidth, height: reference.y } },
    {
      direction: 'bottom',
      rect: {
        x: 0,
        y: reference.y + reference.height,
        width: canvasWidth,
        height: canvasHeight - reference.y - reference.height,
      },
    },
  ];
  const scored = candidates
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .map(({ rect, direction }) => {
      const area = rect.width * rect.height;
      const aspect = rect.width / rect.height;
      const aspectFitness = Math.min(aspect / targetAspect, targetAspect / aspect);
      const minimumResolutionFitness = Math.min(1, Math.min(rect.width, rect.height) / 512);
      const directionWeight = direction === preferredDirection ? 1.15 : 1;
      return {
        rect,
        direction,
        score: area * aspectFitness * minimumResolutionFitness * directionWeight,
      };
    })
    .sort((a, b) => b.score - a.score);
  return clampRect(
    scored[0]?.rect ?? { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
    canvasWidth,
    canvasHeight,
  );
}

/**
 * 결과 영역에서 보호 영역과 겹치는 부분을 잘라 낸다. 보호 영역은 NovelAI가 그리지 않으므로,
 * 결과에 남으면 원래 배경이 가장자리 띠로 보인다. 남는 사각형 가운데 가장 넓은 쪽을 고른다.
 */
export function cropOutside(output: Rect, blocked: Rect): Rect {
  const right = output.x + output.width;
  const bottom = output.y + output.height;
  const blockedRight = blocked.x + blocked.width;
  const blockedBottom = blocked.y + blocked.height;
  const overlaps =
    blocked.x < right && blockedRight > output.x && blocked.y < bottom && blockedBottom > output.y;
  if (!overlaps) return output;
  const candidates: Rect[] = [];
  if (blockedRight < right) {
    const x = Math.max(output.x, blockedRight);
    candidates.push({ x, y: output.y, width: right - x, height: output.height });
  }
  if (blocked.x > output.x)
    candidates.push({ ...output, width: Math.min(right, blocked.x) - output.x });
  if (blockedBottom < bottom) {
    const y = Math.max(output.y, blockedBottom);
    candidates.push({ x: output.x, y, width: output.width, height: bottom - y });
  }
  if (blocked.y > output.y)
    candidates.push({ ...output, height: Math.min(bottom, blocked.y) - output.y });
  if (!candidates.length) return output;
  return candidates.reduce((best, rect) =>
    rect.width * rect.height > best.width * best.height ? rect : best,
  );
}
