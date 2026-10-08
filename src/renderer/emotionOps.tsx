import type { Emotion, EmotionSet } from '../core/domain/types';
import { projectsUsing } from '../core/model/defaults';
import {
  addEmotion,
  duplicateEmotion,
  patchItem,
  removeEmotion,
  updateEmotion,
} from '../core/model/mutations';
import { confirmDialog, promptDialog } from './components/Dialogs';
import type { MenuItem } from './components/ContextMenu';
import { generateEmotions } from './actions';
import {
  deleteGenerations,
  emotionRecords,
  openEmotion,
  run,
  toast,
  updateLibrary,
  updateProject,
  useStore,
} from './store';
import { libraryApi } from './desktop';
import { clearEmotionResults } from './generationOps';

export function updateEmotionSet(id: string, recipe: (set: EmotionSet) => EmotionSet): void {
  updateLibrary((library) => patchItem(library, 'emotionSets', id, recipe));
}

export function patchEmotion(
  setId: string,
  emotionId: string,
  patch: Partial<Omit<Emotion, 'id'>>,
): void {
  updateEmotionSet(setId, (set) => updateEmotion(set, emotionId, patch));
}

export function addEmotionTo(setId: string): string | undefined {
  updateEmotionSet(setId, (set) => addEmotion(set));
  return useStore
    .getState()
    .library?.emotionSets.find((set) => set.id === setId)
    ?.emotions.at(-1)?.id;
}

export async function renameEmotion(setId: string, emotion: Emotion): Promise<void> {
  const name = await promptDialog({
    title: '감정 이름 변경',
    label: '이름',
    initial: emotion.name,
    confirmLabel: '변경',
  });
  if (name) patchEmotion(setId, emotion.id, { name });
}

export function duplicateEmotionIn(setId: string, emotionId: string): string | undefined {
  let copyId: string | undefined;
  updateEmotionSet(setId, (set) => {
    const result = duplicateEmotion(set, emotionId);
    copyId = result.copy?.id;
    return result.set;
  });
  return copyId;
}

function sharedNotice(setId: string, projectId?: string): string {
  const library = useStore.getState().library!;
  const others = projectsUsing(library, 'emotionSet', setId).filter(
    (project) => project.id !== projectId,
  );
  return others.length
    ? ` 이 감정 모음은 다른 작업 ${others.length}개(${others.map((p) => p.name).join(', ')})에서도 쓰입니다.`
    : '';
}

/** 감정 모음에서 감정을 지운다. 작업 화면에서 부르면 그 작업의 생성 결과도 함께 지운다. */
export async function deleteEmotion(
  setId: string,
  emotion: Emotion,
  projectId?: string,
): Promise<boolean> {
  const records = projectId
    ? emotionRecords(useStore.getState().generations[projectId], emotion.id)
    : [];
  const ok = await confirmDialog({
    title: '감정 삭제',
    message: (
      <p>
        <b>{emotion.name}</b> 감정을 삭제합니다.
        {records.length ? ` 이 작업의 생성 결과 ${records.length}장도 함께 삭제됩니다.` : ''}
        {sharedNotice(setId, projectId)}
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  await run('감정을 삭제하는 중', async () => {
    if (projectId && records.length)
      await deleteGenerations(
        projectId,
        records.map((record) => record.id),
      );
    if (useStore.getState().detailEmotionId === emotion.id) openEmotion(undefined);
    updateEmotionSet(setId, (set) => removeEmotion(set, emotion.id));
  });
  return true;
}

/** 여러 감정을 한 번에 지운다. 작업 화면에서 부르면 그 작업의 생성 결과도 함께 지운다. */
export async function deleteEmotions(
  setId: string,
  emotions: Emotion[],
  projectId?: string,
): Promise<boolean> {
  if (!emotions.length) return false;
  if (emotions.length === 1) return deleteEmotion(setId, emotions[0], projectId);
  const generations = projectId ? useStore.getState().generations[projectId] : undefined;
  const records = emotions.flatMap((emotion) => emotionRecords(generations, emotion.id));
  const ok = await confirmDialog({
    title: `감정 ${emotions.length}개 삭제`,
    message: (
      <p>
        {emotions
          .slice(0, 6)
          .map((emotion) => emotion.name)
          .join(', ')}
        {emotions.length > 6 ? ` 외 ${emotions.length - 6}개` : ''} 감정을 삭제합니다.
        {records.length ? ` 이 작업의 생성 결과 ${records.length}장도 함께 삭제됩니다.` : ''}
        {sharedNotice(setId, projectId)}
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  const ids = new Set(emotions.map((emotion) => emotion.id));
  await run('감정을 삭제하는 중', async () => {
    if (projectId && records.length)
      await deleteGenerations(
        projectId,
        records.map((record) => record.id),
      );
    const detail = useStore.getState().detailEmotionId;
    if (detail && ids.has(detail)) openEmotion(undefined);
    updateEmotionSet(setId, (set) => ({
      ...set,
      emotions: set.emotions.filter((emotion) => !ids.has(emotion.id)),
    }));
  });
  return true;
}

/** 갤러리 카드 우클릭 메뉴. */
export function emotionMenu(
  projectId: string,
  set: EmotionSet,
  emotion: Emotion,
  excluded: boolean,
): MenuItem[] {
  const records = emotionRecords(useStore.getState().generations[projectId], emotion.id);
  return [
    { label: '열기', onSelect: () => openEmotion(emotion.id) },
    {
      label: '이 감정만 생성',
      disabled: !emotion.prompt.trim(),
      onSelect: () => void generateEmotions(projectId, [emotion.id]),
    },
    'divider',
    { label: '이름 변경', onSelect: () => void renameEmotion(set.id, emotion) },
    {
      label: '감정 복제',
      hint: '같은 프롬프트로 하나 더',
      onSelect: () => {
        duplicateEmotionIn(set.id, emotion.id);
        toast(`${emotion.name}을(를) 복제했습니다.`);
      },
    },
    {
      label: '프롬프트 복사',
      disabled: !emotion.prompt,
      onSelect: () =>
        void navigator.clipboard
          .writeText(emotion.prompt)
          .then(() => toast('감정 프롬프트를 클립보드에 복사했습니다.')),
    },
    {
      label: excluded ? '일괄 생성에 포함' : '일괄 생성에서 제외',
      onSelect: () =>
        updateProject(projectId, (project) => ({
          ...project,
          excludedEmotionIds: excluded
            ? project.excludedEmotionIds.filter((id) => id !== emotion.id)
            : [...project.excludedEmotionIds, emotion.id],
        })),
    },
    {
      label: '결과 폴더 열기',
      onSelect: () =>
        void run('폴더를 여는 중', () =>
          records[0]
            ? libraryApi().showGeneration(projectId, records[0].id)
            : libraryApi().openInExplorer({
                kind: 'emotion',
                projectId,
                emotionName: emotion.name,
              }),
        ),
    },
    'divider',
    {
      label: '결과만 삭제',
      hint: '대표 이미지는 남김',
      disabled: !records.length,
      onSelect: () => void clearEmotionResults(projectId, [emotion]),
    },
    {
      label: '감정 삭제',
      danger: true,
      onSelect: () => void deleteEmotion(set.id, emotion, projectId),
    },
  ];
}
