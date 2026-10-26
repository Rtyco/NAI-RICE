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
  /** 조합 칸이 있는 씬의 결과만. 지금 조합 순서이고, 후보를 지운 조합은 그 뒤다. */
  comboNumber?: { number: number; total: number };
};

function comboOrder(emotion: Emotion, records: GenerationSummary[]): string[] {
  const keys = new Set(sceneCombos(emotion).map((combo) => combo.key));
  for (const record of records) keys.add(record.comboKey ?? '');
  return [...keys].filter(Boolean);
}

export function exportPicks(
  emotions: Emotion[],
  records: GenerationSummary[] | undefined,
  favorites: Record<string, string>,
  target: 'favorite' | 'latest',
  scope: ExportScope,
): ExportPick[] {
  return emotions.flatMap((emotion, index) => {
    const own = emotionRecords(records, emotion.id);
    const order = comboOrder(emotion, own);
    const pick = (key: string, record: GenerationSummary): ExportPick => {
      const at = record.comboKey ? order.indexOf(record.comboKey) : -1;
      return {
        key,
        emotion,
        number: index + 1,
        record,
        ...(at >= 0 && { comboNumber: { number: at + 1, total: order.length } }),
      };
    };
    if (scope === 'all') return own.map((record) => pick(record.id, record));
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
      return record ? [pick(`${emotion.id}\n${comboKey}`, record)] : [];
    });
  });
}
