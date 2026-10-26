import type { Emotion, EmotionSet, GenerationSummary } from '../core/domain/types';
import { generationKindFor, hasScenePrompt, projectsUsing } from '../core/model/defaults';
import {
  addEmotion,
  duplicateEmotion,
  patchItem,
  removeEmotion,
  setEmotionsExcluded,
  updateEmotion,
} from '../core/model/mutations';
import { confirmDialog, promptDialog } from './components/dialogStack';
import type { MenuItem } from './components/contextMenuStore';
import { generateEmotions } from './actions';
import {
  coverRecord,
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
import {
  forgetSceneImages,
  makeReferenceFromRecord,
  sendToFreeImg2Img,
  sendToSceneImg2Img,
} from './freeImageOps';
import {
  clearEmotionResults,
  openDirectorToolDialog,
  openImg2ImgDialog,
  openSceneSetDialog,
} from './generationOps';

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
    title: '씬 이름 변경',
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
    ? ` 이 씬 모음은 다른 작업 ${others.length}개(${others.map((p) => p.name).join(', ')})에서도 쓰입니다.`
    : '';
}

/** 작업 화면에서 부르면 그 작업의 결과도 지운다. */
export async function deleteEmotion(
  setId: string,
  emotion: Emotion,
  projectId?: string,
): Promise<boolean> {
  const records = projectId
    ? emotionRecords(useStore.getState().generations[projectId], emotion.id)
    : [];
  const ok = await confirmDialog({
    title: '씬 삭제',
    message: (
      <p>
        <b>{emotion.name}</b> 씬을 삭제합니다.
        {records.length ? ` 이 작업의 생성 결과 ${records.length}장도 함께 삭제됩니다.` : ''}
        {sharedNotice(setId, projectId)}
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  await run('씬을 삭제하는 중', async () => {
    if (projectId && records.length)
      await deleteGenerations(
        projectId,
        records.map((record) => record.id),
      );
    if (useStore.getState().detailEmotionId === emotion.id) openEmotion(undefined);
    updateEmotionSet(setId, (set) => removeEmotion(set, emotion.id));
    forgetSceneImages([emotion.id]);
  });
  return true;
}

/** 작업 화면에서 부르면 그 작업의 결과도 지운다. */
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
    title: `씬 ${emotions.length}개 삭제`,
    message: (
      <p>
        {emotions
          .slice(0, 6)
          .map((emotion) => emotion.name)
          .join(', ')}
        {emotions.length > 6 ? ` 외 ${emotions.length - 6}개` : ''} 씬을 삭제합니다.
        {records.length ? ` 이 작업의 생성 결과 ${records.length}장도 함께 삭제됩니다.` : ''}
        {sharedNotice(setId, projectId)}
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  const ids = new Set(emotions.map((emotion) => emotion.id));
  await run('씬을 삭제하는 중', async () => {
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
    forgetSceneImages(ids);
  });
  return true;
}

export function emotionMenu(
  projectId: string,
  set: EmotionSet,
  emotion: Emotion,
  excluded: boolean,
): MenuItem[] {
  const records = emotionRecords(useStore.getState().generations[projectId], emotion.id);
  const withCover = (action: (cover: GenerationSummary) => void) => {
    const favorite = useStore.getState().library?.projects.find((item) => item.id === projectId)
      ?.favorites[emotion.id];
    const cover = coverRecord(records, favorite);
    if (cover) action(cover);
  };
  const folder = {
    label: '결과 폴더 열기',
    onSelect: () =>
      void run('폴더를 여는 중', () =>
        records[0]
          ? libraryApi().showGeneration(projectId, records[0].id)
          : libraryApi().openInExplorer({
              kind: 'emotion',
              projectId,
              emotionName: emotion.name,
              method: generationKindFor(
                useStore.getState().library?.projects.find((item) => item.id === projectId)?.mode ??
                  'reference',
              ),
            }),
      ),
  };
  // 보기, 생성, 씬 고치기, 대표 이미지, 지우기 순
  return [
    { label: '열기', onSelect: () => openEmotion(emotion.id) },
    folder,
    'divider',
    {
      label: '이 씬만 생성',
      disabled: !hasScenePrompt(emotion),
      onSelect: () => void generateEmotions(projectId, [emotion.id]),
    },
    {
      label: excluded ? '일괄 생성에 포함' : '일괄 생성에서 제외',
      onSelect: () =>
        updateProject(projectId, (project) =>
          setEmotionsExcluded(project, [emotion.id], !excluded),
        ),
    },
    'divider',
    { label: '이름 변경', onSelect: () => void renameEmotion(set.id, emotion) },
    {
      label: '씬 복제',
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
          .then(() => toast('씬 프롬프트를 클립보드에 복사했습니다.')),
    },
    'divider',
    { heading: records.length ? '대표 이미지 (없으면 최신)' : '대표 이미지 (결과 없음)' },
    {
      label: '다듬기',
      disabled: !records.length,
      onSelect: () => withCover((cover) => openImg2ImgDialog(projectId, [cover])),
    },
    {
      label: '이 이미지로 i2i',
      disabled: !records.length,
      onSelect: () => withCover((cover) => void sendToSceneImg2Img(projectId, emotion.id, cover)),
    },
    {
      label: '디렉터 툴',
      hint: 'Emotion·배경 제거 등',
      disabled: !records.length,
      onSelect: () => withCover((cover) => openDirectorToolDialog(projectId, [cover])),
    },
    {
      label: '이 이미지로 씬 표정 만들기',
      hint: 'Emotion 툴',
      disabled: !records.length,
      onSelect: () => withCover((cover) => openSceneSetDialog(projectId, cover)),
    },
    {
      label: '자유 생성으로 보내기',
      disabled: !records.length,
      onSelect: () => withCover((cover) => void sendToFreeImg2Img(projectId, cover)),
    },
    {
      label: '인페인트 만들기',
      disabled: !records.length,
      onSelect: () => withCover((cover) => void makeReferenceFromRecord(projectId, cover)),
    },
    'divider',
    {
      label: '결과만 삭제',
      hint: '대표 이미지는 남김',
      disabled: !records.length,
      onSelect: () => void clearEmotionResults(projectId, [emotion]),
    },
    {
      label: '씬 삭제',
      danger: true,
      onSelect: () => void deleteEmotion(set.id, emotion, projectId),
    },
  ];
}

export function emotionsMenu(projectId: string, set: EmotionSet, emotions: Emotion[]): MenuItem[] {
  const state = useStore.getState();
  const project = state.library?.projects.find((item) => item.id === projectId);
  const generations = state.generations[projectId];
  const ids = emotions.map((emotion) => emotion.id);
  const ready = emotions.filter(hasScenePrompt).map((emotion) => emotion.id);
  const excluded = new Set(project?.excludedEmotionIds);
  const covers = emotions
    .map((emotion) =>
      coverRecord(emotionRecords(generations, emotion.id), project?.favorites[emotion.id]),
    )
    .filter((record): record is GenerationSummary => Boolean(record));
  const setExcluded = (exclude: boolean) =>
    updateProject(projectId, (current) => setEmotionsExcluded(current, ids, exclude));
  return [
    { heading: `고른 씬 ${emotions.length}개` },
    {
      label: '고른 씬 생성',
      disabled: !ready.length,
      onSelect: () => void generateEmotions(projectId, ready),
    },
    {
      label: '일괄 생성에 포함',
      disabled: ids.every((id) => !excluded.has(id)),
      onSelect: () => setExcluded(false),
    },
    {
      label: '일괄 생성에서 제외',
      disabled: ids.every((id) => excluded.has(id)),
      onSelect: () => setExcluded(true),
    },
    'divider',
    {
      label: '씬 복제',
      onSelect: () => {
        for (const id of ids) duplicateEmotionIn(set.id, id);
        toast(`씬 ${ids.length}개를 복제했습니다.`);
      },
    },
    'divider',
    {
      heading: covers.length
        ? `대표 이미지 ${covers.length}장 (없으면 최신)`
        : '대표 이미지 (결과 없음)',
    },
    {
      label: '다듬기',
      disabled: !covers.length,
      onSelect: () => openImg2ImgDialog(projectId, covers),
    },
    {
      label: '디렉터 툴',
      hint: 'Emotion·배경 제거 등',
      disabled: !covers.length,
      onSelect: () => openDirectorToolDialog(projectId, covers),
    },
    'divider',
    {
      label: '결과만 삭제',
      hint: '대표 이미지는 남김',
      disabled: !covers.length,
      onSelect: () => void clearEmotionResults(projectId, emotions),
    },
    {
      label: '씬 삭제',
      danger: true,
      onSelect: () => void deleteEmotions(set.id, emotions, projectId),
    },
  ];
}
