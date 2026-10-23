/** 채널마다 차이가 `tolerance` 이하인 4방향 연결 영역. `pixels`는 바탕과 그린 것을 합친 색. */
export function floodRegion(
  pixels: Uint32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number,
): Uint8Array {
  const region = new Uint8Array(width * height);
  const seed = pixels[startY * width + startX];
  const near = (value: number) =>
    Math.abs((value & 255) - (seed & 255)) <= tolerance &&
    Math.abs(((value >> 8) & 255) - ((seed >> 8) & 255)) <= tolerance &&
    Math.abs(((value >> 16) & 255) - ((seed >> 16) & 255)) <= tolerance &&
    Math.abs(((value >>> 24) & 255) - ((seed >>> 24) & 255)) <= tolerance;
  const stack = [startY * width + startX];
  while (stack.length) {
    const index = stack.pop()!;
    if (region[index] || !near(pixels[index])) continue;
    region[index] = 1;
    const x = index % width;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (index >= width) stack.push(index - width);
    if (index < width * (height - 1)) stack.push(index + width);
  }
  return region;
}
