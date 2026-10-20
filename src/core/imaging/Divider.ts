/** 생성 영역 바로 바깥의 띠. 안쪽에 그리면 NovelAI가 덮어 그려 경계가 사라진다. */
export function dividerPixels(
  mask: Uint8Array,
  width: number,
  height: number,
  widthPx: number,
): Uint8Array {
  if (mask.length !== width * height) throw new Error('마스크 크기가 캔버스와 다릅니다.');
  const reach = Math.max(0, Math.round(widthPx));
  const ring = new Uint8Array(width * height);
  if (!reach) return ring;
  // 정사각 이웃이라 모서리가 비지 않는다. 가로·세로로 나눠 픽셀마다 몇 번만 본다.
  const near = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let last = -Infinity;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x]) last = x;
      if (x - last <= reach) near[row + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (mask[row + x]) last = x;
      if (last - x <= reach) near[row + x] = 1;
    }
  }
  const lastRow = new Float64Array(width).fill(-Infinity);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (near[row + x]) lastRow[x] = y;
      if (y - lastRow[x] <= reach && !mask[row + x]) ring[row + x] = 1;
    }
  }
  lastRow.fill(Infinity);
  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (near[row + x]) lastRow[x] = y;
      if (lastRow[x] - y <= reach && !mask[row + x]) ring[row + x] = 1;
    }
  }
  return ring;
}
