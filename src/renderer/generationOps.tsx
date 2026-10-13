import type { GenerationSummary } from '../core/domain/types';
import { confirmDialog, openDialog } from './components/Dialogs';
import { DirectorToolDialog } from './components/DirectorToolDialog';
import { Img2ImgDialog } from './components/Img2ImgDialog';
import { SceneSetDialog } from './components/SceneSetDialog';
import { FREE_PROJECT_ID } from '../core/model/defaults';
import { deleteGenerations, emotionRecords, run, toast, useStore } from './store';

export function favoriteIds(projectId: string): Set<string> {
  const project = useStore.getState().library?.projects.find((item) => item.id === projectId);
  return new Set(Object.values(project?.favorites ?? {}));
}

/** 썸네일과 진단 캔버스도 함께 휴지통으로 보낸다. */
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
          ` 대표 이미지 ${pickedFavorites}장이 포함되어 있어 해당 씬의 대표 지정이 풀립니다.`}
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

/** 지웠으면 다음(없으면 이전) 결과를 보여 준다. */
export async function deleteShownResult(
  projectId: string,
  records: GenerationSummary[],
  record: GenerationSummary,
  show: (id: string) => void,
): Promise<void> {
  const position = records.findIndex((item) => item.id === record.id);
  const neighbor = records[position + 1] ?? records[position - 1];
  if ((await deleteResults(projectId, [record])) && neighbor) show(neighbor.id);
}

/** 감정과 대표 이미지는 남긴다. */
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
        {emotions.length > names.length ? ` 외 ${emotions.length - names.length}개` : ''} 씬의 결과{' '}
        {targets.length}장을 Windows 휴지통으로 이동합니다(전체 캔버스 포함). 씬은 그대로 둡니다.
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

export function openImg2ImgDialog(projectId: string, records: GenerationSummary[]): void {
  if (!records.length) return;
  void openDialog((close) => (
    <Img2ImgDialog projectId={projectId} records={records} close={close} />
  ));
}

export function openDirectorToolDialog(projectId: string, records: GenerationSummary[]): void {
  if (!records.length) return;
  // 작업 결과 한 장이면 씬 세트 만들기 창으로 넘어갈 수 있다.
  const sceneSet =
    projectId !== FREE_PROJECT_ID && records.length === 1
      ? () => openSceneSetDialog(projectId, records[0])
      : undefined;
  void openDialog((close) => (
    <DirectorToolDialog
      projectId={projectId}
      records={records}
      onSceneSet={sceneSet}
      close={close}
    />
  ));
}

export function openSceneSetDialog(projectId: string, record: GenerationSummary): void {
  void openDialog((close) => (
    <SceneSetDialog projectId={projectId} record={record} close={close} />
  ));
}
