import type { DividerLine } from '../domain/types';

type Region = { x0: number; y0: number; width: number; height: number };

/** 오른쪽·아래 이웃과 값이 다른 픽셀을 감싼 사각형을 `reach`만큼 넓힌 곳. 경계가 없으면 undefined */
function boundaryRegion(
  mask: Uint8Array,
  width: number,
  height: number,
  reach: number,
): Region | undefined {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const value = !mask[row + x];
      const differs =
        (x + 1 < width && value !== !mask[row + x + 1]) ||
        (y + 1 < height && value !== !mask[row + width + x]);
      if (!differs) continue;
      if (x < left) left = x;
      if (x + 1 > right) right = x + 1;
      if (y < top) top = y;
      if (y + 1 > bottom) bottom = y + 1;
    }
  }
  if (right < 0) return undefined;
  const x0 = Math.max(0, left - reach);
  const y0 = Math.max(0, top - reach);
  return {
    x0,
    y0,
    width: Math.min(width - 1, right + reach) - x0 + 1,
    height: Math.min(height - 1, bottom + reach) - y0 + 1,
  };
}

/** 영역 안에서 `side` 쪽이 아닌 픽셀까지 정사각 거리가 `reach` 이하면 1. 가로·세로로 나눠 픽셀마다 몇 번만 본다. */
function nearOther(
  mask: Uint8Array,
  stride: number,
  region: Region,
  keep: boolean,
  reach: number,
): Uint8Array {
  const { x0, y0, width, height } = region;
  const across = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const source = (y0 + y) * stride + x0;
    const row = y * width;
    let last = -reach - 1;
    for (let x = 0; x < width; x += 1) {
      if (!mask[source + x] !== keep) last = x;
      if (x - last <= reach) across[row + x] = 1;
    }
    last = width + reach;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (!mask[source + x] !== keep) last = x;
      if (last - x <= reach) across[row + x] = 1;
    }
  }
  if (!reach) return across;
  const near = new Uint8Array(width * height);
  const lastRow = new Int32Array(width).fill(-reach - 1);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (across[row + x]) lastRow[x] = y;
      if (y - lastRow[x] <= reach) near[row + x] = 1;
    }
  }
  lastRow.fill(height + reach);
  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (across[row + x]) lastRow[x] = y;
      if (lastRow[x] - y <= reach) near[row + x] = 1;
    }
  }
  return near;
}

/** `side` 쪽에서 반대쪽까지 정사각 거리가 (gap, gap + size]인 띠. 캔버스 밖은 반대쪽으로 치지 않는다. */
function band(
  mask: Uint8Array,
  stride: number,
  region: Region,
  side: 0 | 1,
  gap: number,
  size: number,
  into: Uint8Array,
): void {
  const keep = !side;
  const outer = nearOther(mask, stride, region, keep, gap + size);
  const inner = gap ? nearOther(mask, stride, region, keep, gap) : undefined;
  for (let y = 0; y < region.height; y += 1) {
    const source = (region.y0 + y) * stride + region.x0;
    const row = y * region.width;
    for (let x = 0; x < region.width; x += 1) {
      if (!mask[source + x] === keep && outer[row + x] && !inner?.[row + x]) into[source + x] = 1;
    }
  }
}

/** 바깥은 NovelAI가 다시 그리지 않아 남고, 안쪽은 생성 영역이라 덮어 그려질 수 있다. */
export function dividerPixels(
  mask: Uint8Array,
  width: number,
  height: number,
  line: Pick<DividerLine, 'widthPx' | 'placement' | 'gapPx'>,
): Uint8Array {
  if (mask.length !== width * height) throw new Error('마스크 크기가 캔버스와 다릅니다.');
  const size = Math.max(0, Math.round(line.widthPx));
  const gap = line.placement === 'center' ? 0 : Math.max(0, Math.round(line.gapPx));
  const ring = new Uint8Array(width * height);
  // 경계에서 이만큼 넘는 곳은 띠에 들 수 없어 붓질 중에도 경계 둘레만 계산한다.
  const region = size ? boundaryRegion(mask, width, height, gap + size) : undefined;
  if (!region) return ring;
  if (line.placement === 'inside') band(mask, width, region, 1, gap, size, ring);
  else if (line.placement === 'outside') band(mask, width, region, 0, gap, size, ring);
  else {
    band(mask, width, region, 0, 0, Math.ceil(size / 2), ring);
    if (size > 1) band(mask, width, region, 1, 0, Math.floor(size / 2), ring);
  }
  return ring;
}
