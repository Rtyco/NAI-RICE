import { describe, expect, it } from 'vitest';
import type { RefineSettings } from '../../src/core/domain/types';
import { estimateRemainingMs } from '../../src/core/jobs/QueueView';
import { DEFAULT_LINE_FIX } from '../../src/core/model/defaults';
import { formatEstimate } from '../../src/renderer/lib/duration';

const at = (seconds: number) => new Date(seconds * 1000).toISOString();
const done = (start: number, end: number) => ({
  status: 'completed' as const,
  startedAt: at(start),
  completedAt: at(end),
});
const queued = { status: 'queued' as const };
const refine: RefineSettings = {
  model: 'nai-diffusion-4-5-full-inpainting',
  prompt: 'empty',
  size: { width: 128, height: 128 },
  fit: 'crop',
  strength: 0.3,
  noise: 0,
  count: 1,
  seedMode: 'source',
};

describe('estimateRemainingMs', () => {
  it('끝낸 작업이 없으면 셀 수 없어', () => {
    expect(estimateRemainingMs([queued], 0)).toBeUndefined();
  });

  it('최근에 끝낸 작업의 평균 시간에 남은 작업 수를 곱해', () => {
    expect(estimateRemainingMs([done(0, 10), done(10, 30), queued, queued], 30_000)).toBe(30_000);
  });

  it('생성 중인 작업은 지난 시간만큼 빼되, 평균보다 오래 걸려도 0 아래로 내리지 않아', () => {
    const jobs = [done(0, 20), { status: 'generating' as const, startedAt: at(100) }, queued];
    expect(estimateRemainingMs(jobs, 105_000)).toBe(35_000);
    expect(estimateRemainingMs(jobs, 200_000)).toBe(20_000);
  });

  it('원본이 끝나야 붙는 다듬기와 구분선 지우기도 세', () => {
    const history = [done(0, 10)];
    expect(estimateRemainingMs([...history, { ...queued, refine }], 0)).toBe(20_000);
    expect(
      estimateRemainingMs([...history, { ...queued, refine: { ...refine, count: 2 } }], 0),
    ).toBe(30_000);
    expect(
      estimateRemainingMs([...history, { ...queued, lineFix: DEFAULT_LINE_FIX, refine }], 0),
    ).toBe(30_000);
  });

  it('오래된 기록은 빼고 최근에 끝낸 10개만 재', () => {
    const recent = Array.from({ length: 10 }, (_, i) => done(1000 + i * 10, 1010 + i * 10));
    const old = Array.from({ length: 5 }, (_, i) => done(i * 100, i * 100 + 90));
    expect(estimateRemainingMs([...recent, ...old, queued], 0)).toBe(10_000);
  });
});

describe('formatEstimate', () => {
  it('분 단위로 반올림하고, 1시간부터는 시간과 분으로 써', () => {
    expect(formatEstimate(20_000)).toBe('1분 미만');
    expect(formatEstimate(90_000)).toBe('약 2분');
    expect(formatEstimate(65 * 60_000)).toBe('약 1시간 5분');
    expect(formatEstimate(120 * 60_000)).toBe('약 2시간');
  });
});
