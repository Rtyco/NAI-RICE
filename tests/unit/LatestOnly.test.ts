import { describe, expect, it } from 'vitest';
import { LatestOnly } from '../../src/renderer/lib/LatestOnly';

describe('LatestOnly', () => {
  it('진행 중에 들어온 값은 마지막 것만 이어서 처리한다', async () => {
    const seen: number[] = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => (release = resolve));
    const runner = new LatestOnly<number>(async (value) => {
      seen.push(value);
      if (value === 1) await first;
    });
    runner.push(1);
    runner.push(2);
    runner.push(3);
    expect(runner.busy).toBe(true);
    release();
    await new Promise((resolve) => setTimeout(resolve));
    expect(seen).toEqual([1, 3]);
    expect(runner.busy).toBe(false);
  });

  it('clear로 남은 값을 버린다', async () => {
    const seen: number[] = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => (release = resolve));
    const runner = new LatestOnly<number>(async (value) => {
      seen.push(value);
      await first;
    });
    runner.push(1);
    runner.push(2);
    runner.clear();
    release();
    await new Promise((resolve) => setTimeout(resolve));
    expect(seen).toEqual([1]);
  });
});
