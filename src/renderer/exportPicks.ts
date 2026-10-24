import type { Emotion, ExportScope, GenerationSummary } from '../core/domain/types';
import { sceneCombos } from '../core/model/sceneCombos';
import { coverRecord, emotionRecords } from './store';

export type ExportPick = {
  /** 고르기 해제를 기억하는 키. 대표 이미지를 바꿔도 같은 자리면 같다. */
  key: string;
  emotion: Emotion;
  /** 씬 모음 안 순서, 1부터 */
  number: number;
  record: GenerationSummary;
};

export function exportPicks(
  emotions: Emotion[],
  records: GenerationSummary[] | undefined,
  favorites: Record<string, string>,
  target: 'favorite' | 'latest',
  scope: ExportScope,
): ExportPick[] {
  return emotions.flatMap((emotion, index) => {
    const own = emotionRecords(records, emotion.id);
    const base = { emotion, number: index + 1 };
    if (scope === 'all') return own.map((record) => ({ ...base, key: record.id, record }));
    const groups = new Map<string, GenerationSummary[]>();
    if (scope === 'scene') groups.set('', own);
    else {
      // 지금 조합 순서대로, 후보를 지운 조합의 결과는 뒤에
      for (const combo of sceneCombos(emotion)) groups.set(combo.key, []);
      for (const record of own) {
        const key = record.comboKey ?? '';
        groups.set(key, [...(groups.get(key) ?? []), record]);
      }
    }
    return [...groups].flatMap(([comboKey, group]) => {
      const record = coverRecord(group, favorites[emotion.id], target);
      return record ? [{ ...base, key: `${emotion.id}\n${comboKey}`, record }] : [];
    });
  });
}
