import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Emotion, GenerationSummary, SceneOption } from '../../src/core/domain/types';
import { renderExportFilename } from '../../src/core/output/OutputFilename';
import type * as PicksModule from '../../src/renderer/exportPicks';

let picks: typeof PicksModule;

beforeAll(async () => {
  // store는 창이 닫힐 때 저장하려고 처음부터 window에 귀를 기울인다.
  vi.stubGlobal('window', { addEventListener: () => undefined });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  picks = await import('../../src/renderer/exportPicks');
});

const option = (id: string): SceneOption => ({
  id,
  prompt: id,
  characterPrompts: [],
  enabled: true,
});
const emotions: Emotion[] = [
  { id: 'a', name: '기쁨', prompt: '', slots: [[option('day'), option('night')]] },
  { id: 'b', name: '슬픔', prompt: '' },
];
const record = (id: string, emotionId: string, minute: number, comboKey?: string) =>
  ({
    id,
    emotionId,
    comboKey,
    comboName: comboKey,
    createdAt: `2026-10-24T00:${String(minute).padStart(2, '0')}:00.000Z`,
  }) as GenerationSummary;
const records = [
  record('a-day-1', 'a', 1, 'day'),
  record('a-day-2', 'a', 2, 'day'),
  record('a-night', 'a', 3, 'night'),
  record('b-1', 'b', 4),
];
const ids = (scope: 'scene' | 'combo' | 'all', favorites: Record<string, string> = {}) =>
  picks.exportPicks(emotions, records, favorites, 'favorite', scope).map((item) => item.record.id);

describe('exportPicks', () => {
  it('씬마다 한 장은 대표, 없으면 최신', () => {
    expect(ids('scene')).toEqual(['a-night', 'b-1']);
    expect(ids('scene', { a: 'a-day-1' })).toEqual(['a-day-1', 'b-1']);
  });

  it('조합마다 한 장은 조합 순서대로, 대표가 그 조합에 있을 때만 대표', () => {
    expect(ids('combo')).toEqual(['a-day-2', 'a-night', 'b-1']);
    expect(ids('combo', { a: 'a-day-1' })).toEqual(['a-day-1', 'a-night', 'b-1']);
  });

  it('모든 생성 이미지', () => {
    expect(ids('all')).toEqual(['a-night', 'a-day-2', 'a-day-1', 'b-1']);
  });
});

describe('조합 이름 토큰', () => {
  const scene = {
    emotion: '기쁨',
    number: 1,
    total: 2,
    character: '',
    project: '',
    seed: 1,
    model: '',
    createdAt: '2026-10-24T00:00:00.000Z',
  };

  it('조합이 없으면 앞의 구분 글자와 함께 빠진다', () => {
    expect(renderExportFilename('{emotion}_{combo}', { ...scene, combo: 'day · smile' })).toBe(
      '기쁨_day · smile',
    );
    expect(renderExportFilename('{emotion}_{combo}_{seed}', scene)).toBe('기쁨_1');
  });
});
