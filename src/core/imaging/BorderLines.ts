import type { Rect } from '../domain/types';
import type { PixelBuffer } from './BackgroundDetector';

/** 세로선은 x, 가로선은 y 범위. `to`는 포함하지 않는다. */
export type BorderLine = { axis: 'vertical' | 'horizontal'; from: number; to: number };

/** RGB 중 가장 밝은 값이 이보다 작으면 선 색으로 본다. 크롭 결과 실측: 선 70·120 모두 100%, 그 밖은 13%·34%. */
const DARK_BELOW = 100;
/** 캐릭터가 선을 일부 가려도 잡는다. */
const MIN_COVERAGE = 0.6;
/** 인페인트가 그린 선은 8px 안팎이었다(2026-10-28 크롭 결과). 넓은 어두운 배경은 선으로 보지 않는다. */
const MAX_THICKNESS = 24;
const BAND = 48;
/** NovelAI 마스크 한 칸 */
const CELL = 8;

function coverage(
  image: PixelBuffer,
  area: Rect,
  axis: BorderLine['axis'],
  position: number,
): number {
  const { width, data } = image;
  const length = axis === 'vertical' ? area.height : area.width;
  let dark = 0;
  for (let step = 0; step < length; step += 1) {
    const x = axis === 'vertical' ? position : area.x + step;
    const y = axis === 'vertical' ? area.y + step : position;
    const offset = (y * width + x) * 4;
    if (Math.max(data[offset], data[offset + 1], data[offset + 2]) < DARK_BELOW) dark += 1;
  }
  return dark / Math.max(1, length);
}

/** `positions` 순서(가장자리 → 안쪽)로 보며 이어진 선 줄을 묶는다. 띠 끝까지 이어지면 배경이라 버린다. */
function linesInBand(
  positions: number[],
  isLine: (position: number) => boolean,
  axis: BorderLine['axis'],
): BorderLine[] {
  const lines: BorderLine[] = [];
  let run: number[] = [];
  const close = (reachedEnd: boolean) => {
    if (run.length && run.length <= MAX_THICKNESS && !reachedEnd) {
      const from = Math.min(...run);
      lines.push({ axis, from, to: Math.max(...run) + 1 });
    }
    run = [];
  };
  for (const position of positions) {
    if (isLine(position)) run.push(position);
    else close(false);
  }
  close(true);
  return lines;
}

/** 크롭된 결과(`area`, 64 배수 여백 제외)의 네 가장자리 띠에서 끝까지 이어진 어두운 직선을 찾는다. */
export function detectBorderLines(image: PixelBuffer, area: Rect): BorderLine[] {
  if (image.data.length !== image.width * image.height * 4)
    throw new Error('픽셀 버퍼 크기가 캔버스와 다릅니다.');
  const lines: BorderLine[] = [];
  for (const axis of ['vertical', 'horizontal'] as const) {
    const start = axis === 'vertical' ? area.x : area.y;
    const size = axis === 'vertical' ? area.width : area.height;
    const band = Math.min(BAND, Math.floor(size / 4));
    const isLine = (position: number) => coverage(image, area, axis, position) >= MIN_COVERAGE;
    const near = Array.from({ length: band }, (_, index) => start + index);
    const far = Array.from({ length: band }, (_, index) => start + size - 1 - index);
    lines.push(...linesInBand(near, isLine, axis), ...linesInBand(far, isLine, axis));
  }
  return lines;
}

/** 선마다 양옆 `marginPx`를 더해 NovelAI 마스크 칸에 맞춘다. 1이 다시 그릴 곳이다. */
export function borderLineMask(
  width: number,
  height: number,
  area: Rect,
  lines: BorderLine[],
  marginPx: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const snapDown = (value: number) => Math.max(0, Math.floor(value / CELL) * CELL);
  const snapUp = (value: number, limit: number) => Math.min(limit, Math.ceil(value / CELL) * CELL);
  for (const line of lines) {
    const vertical = line.axis === 'vertical';
    const from = snapDown(line.from - marginPx);
    const to = snapUp(line.to + marginPx, vertical ? width : height);
    const along = vertical
      ? [snapDown(area.y), snapUp(area.y + area.height, height)]
      : [snapDown(area.x), snapUp(area.x + area.width, width)];
    for (let a = along[0]; a < along[1]; a += 1)
      for (let b = from; b < to; b += 1) mask[vertical ? a * width + b : b * width + a] = 1;
  }
  return mask;
}
