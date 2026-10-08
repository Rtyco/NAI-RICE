import type { Rect } from '../domain/types';
import { clampRect } from './rects';

export type PixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type BackgroundDetection = {
  mode: 'transparent' | 'solid' | 'unknown';
  backgroundMask: Uint8Array;
  referenceRect: Rect;
  confidence: number;
  backgroundColor?: [number, number, number];
  warnings: string[];
};

const indexOf = (x: number, y: number, width: number) => y * width + x;

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)] ?? 255;
}

function edgeIndices(width: number, height: number): number[] {
  const result: number[] = [];
  for (let x = 0; x < width; x += 1) {
    result.push(indexOf(x, 0, width), indexOf(x, height - 1, width));
  }
  for (let y = 1; y < height - 1; y += 1) {
    result.push(indexOf(0, y, width), indexOf(width - 1, y, width));
  }
  return result;
}

function rectFromForeground(
  foreground: Uint8Array,
  width: number,
  height: number,
  padding: number,
): Rect {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!foreground[indexOf(x, y, width)]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };
  return clampRect(
    {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 1 + padding * 2,
      height: maxY - minY + 1 + padding * 2,
    },
    width,
    height,
  );
}

function removeSmallForeground(
  foreground: Uint8Array,
  background: Uint8Array,
  width: number,
  height: number,
  minimumArea: number,
): void {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  for (let start = 0; start < foreground.length; start += 1) {
    if (!foreground[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    const component: number[] = [];
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const current = queue[head++];
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && foreground[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (component.length < minimumArea) {
      for (const pixel of component) {
        foreground[pixel] = 0;
        background[pixel] = 1;
      }
    }
  }
}

export function detectBackground(
  image: PixelBuffer,
  threshold = 16,
  padding = 12,
): BackgroundDetection {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) throw new Error('픽셀 버퍼 크기가 캔버스와 달라.');
  const edges = edgeIndices(width, height);
  const transparentEdges = edges.filter((pixel) => data[pixel * 4 + 3] < 16).length;
  const backgroundMask = new Uint8Array(width * height);
  const foreground = new Uint8Array(width * height);
  const minimumArea = Math.max(16, Math.floor(width * height * 0.0001));

  if (transparentEdges / Math.max(1, edges.length) >= 0.1) {
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      if (data[pixel * 4 + 3] < 16) backgroundMask[pixel] = 1;
      else foreground[pixel] = 1;
    }
    removeSmallForeground(foreground, backgroundMask, width, height, minimumArea);
    return {
      mode: 'transparent',
      backgroundMask,
      referenceRect: rectFromForeground(foreground, width, height, padding),
      confidence: Math.min(1, 0.8 + transparentEdges / edges.length / 5),
      warnings: [],
    };
  }

  const red = edges.map((pixel) => data[pixel * 4]);
  const green = edges.map((pixel) => data[pixel * 4 + 1]);
  const blue = edges.map((pixel) => data[pixel * 4 + 2]);
  const backgroundColor: [number, number, number] = [median(red), median(green), median(blue)];
  const matches = (pixel: number): boolean => {
    const offset = pixel * 4;
    const distance = Math.hypot(
      data[offset] - backgroundColor[0],
      data[offset + 1] - backgroundColor[1],
      data[offset + 2] - backgroundColor[2],
    );
    return distance <= threshold;
  };
  const uniformRatio = edges.filter(matches).length / Math.max(1, edges.length);
  if (uniformRatio < 0.85) {
    return {
      mode: 'unknown',
      backgroundMask,
      referenceRect: { x: 0, y: 0, width, height },
      confidence: uniformRatio,
      backgroundColor,
      warnings: ['가장자리 배경이 균일하지 않습니다. 보호 영역을 직접 지정하십시오.'],
    };
  }

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const pixel of edges) {
    if (!backgroundMask[pixel] && matches(pixel)) {
      backgroundMask[pixel] = 1;
      queue[tail++] = pixel;
    }
  }
  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);
    const neighbors = [
      x > 0 ? current - 1 : -1,
      x + 1 < width ? current + 1 : -1,
      y > 0 ? current - width : -1,
      y + 1 < height ? current + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && !backgroundMask[neighbor] && matches(neighbor)) {
        backgroundMask[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }
  for (let pixel = 0; pixel < foreground.length; pixel += 1) {
    foreground[pixel] = backgroundMask[pixel] ? 0 : 1;
  }
  removeSmallForeground(foreground, backgroundMask, width, height, minimumArea);
  return {
    mode: 'solid',
    backgroundMask,
    referenceRect: rectFromForeground(foreground, width, height, padding),
    confidence: uniformRatio,
    backgroundColor,
    warnings: [],
  };
}
