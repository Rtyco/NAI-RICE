import type { GenerationSummary } from '../core/domain/types';
import { confirmDialog } from './components/Dialogs';
import { deleteGenerations, emotionRecords, run, toast, useStore } from './store';

/** 작업에서 대표 이미지로 지정한 생성 기록 ID. */
export function favoriteIds(projectId: string): Set<string> {
  const project = useStore.getState().library?.projects.find((item) => item.id === projectId);
  return new Set(Object.values(project?.favorites ?? {}));
}

/**
 * 생성 결과를 지운다. 결과 이미지와 썸네일, 같은 결과의 진단 캔버스(전체 캔버스·메타데이터)를 함께
 * 휴지통으로 보낸다. 감정 상세에서 고른 결과를 지울 때 쓴다.
 */
export async function deleteResults(
  projectId: string,
  records: GenerationSummary[],
): Promise<boolean> {
  if (!records.length) return false;
  const favorites = favoriteIds(projectId);
  const pickedFavorites = records.filter((record) => favorites.has(record.id)).length;
  const ok = await confirmDialog({
    title: records.length === 1 ? '생성 결과 삭제' : `생성 결과 ${records.length}장 삭제`,
    message: (
      <p>
        {records.length === 1 ? '이 결과' : `결과 ${records.length}장`}의 이미지와 전체 캔버스를
        Windows 휴지통으로 이동합니다.
        {pickedFavorites > 0 &&
          ` 대표 이미지 ${pickedFavorites}장이 포함되어 있어 해당 감정의 대표 지정이 풀립니다.`}
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  await run('결과를 삭제하는 중', () =>
    deleteGenerations(
      projectId,
      records.map((record) => record.id),
    ),
  );
  return true;
}

/** 갤러리에서 고른 감정들의 결과만 지운다. 감정 자체와 대표 이미지는 남긴다. */
export async function clearEmotionResults(
  projectId: string,
  emotions: Array<{ id: string; name: string }>,
): Promise<boolean> {
  const all = useStore.getState().generations[projectId];
  const favorites = favoriteIds(projectId);
  const records = emotions.flatMap((emotion) => emotionRecords(all, emotion.id));
  const targets = records.filter((record) => !favorites.has(record.id));
  const kept = records.length - targets.length;
  if (!targets.length) {
    toast(kept ? '대표 이미지 말고는 지울 결과가 없습니다.' : '지울 결과가 없습니다.');
    return false;
  }
  const names = emotions.slice(0, 6).map((emotion) => emotion.name);
  const ok = await confirmDialog({
    title: '결과만 삭제',
    message: (
      <p>
        {names.join(', ')}
        {emotions.length > names.length ? ` 외 ${emotions.length - names.length}개` : ''} 감정의
        결과 {targets.length}장을 Windows 휴지통으로 이동합니다(전체 캔버스 포함). 감정은 그대로
        둡니다.
        {kept > 0 && ` 대표 이미지 ${kept}장은 남깁니다.`}
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  await run('결과를 삭제하는 중', () =>
    deleteGenerations(
      projectId,
      targets.map((record) => record.id),
    ),
  );
  return true;
}
