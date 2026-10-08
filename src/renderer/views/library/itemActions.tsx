import type {
  Character,
  EmotionSet,
  Library,
  PieceSet,
  Preset,
  Reference,
} from '../../../core/domain/types';
import {
  exportCharacter,
  exportEmotionSet,
  exportPieceSet,
  exportPreset,
} from '../../../core/backup/Backups';
import {
  createCharacter,
  createEmotionSet,
  createPieceSet,
  createPreset,
  createReference,
  projectsUsing,
} from '../../../core/model/defaults';
import {
  cloneCharacter,
  cloneEmotionSet,
  clonePieceSet,
  clonePreset,
  cloneReferenceMeta,
  duplicateName,
  patchItem,
  removeItem,
  removeItemReassigning,
  renamePieceSet,
  uniqueName,
} from '../../../core/model/mutations';
import { modelInfo } from '../../../core/providers/NaiModels';
import { type MenuItem } from '../../components/ContextMenu';
import { confirmDialog, openDialog, promptDialog } from '../../components/Dialogs';
import { DeleteUsedDialog } from './DeleteUsedDialog';
import { SECTIONS } from '../../sections';
import { openLibrary, run, toast, updateLibrary, useStore, type LibrarySection } from '../../store';
import { fileApi, libraryApi } from '../../desktop';

export type Item = { id: string; name: string };

export const LABELS = Object.fromEntries(
  SECTIONS.map((section) => [
    section.id,
    { title: section.label, description: section.usage, kind: section.kind },
  ]),
) as Record<
  LibrarySection,
  { title: string; description: string; kind: (typeof SECTIONS)[number]['kind'] }
>;

/** 이름을 바꾼다. 프롬프트 조각 세트면 그 세트를 부르는 `<세트.조각>` 참조도 함께 바꾼다. */
export function withName(
  library: Library,
  section: LibrarySection,
  id: string,
  name: string,
): Library {
  if (section === 'pieceSets') return renamePieceSet(library, id, name);
  return patchItem(library, section, id, (entry) => ({ ...entry, name }));
}

async function renameItem(section: LibrarySection, item: Item) {
  const name = await promptDialog({
    title: '이름 변경',
    label: '이름',
    initial: item.name,
    confirmLabel: '변경',
  });
  if (name) updateLibrary((library) => withName(library, section, item.id, name));
}

export async function deleteItem(section: LibrarySection, item: Item) {
  const library = useStore.getState().library!;
  if (section === 'presets' && library.presets.length <= 1) {
    toast('생성 설정은 최소 하나가 있어야 합니다.', 'error');
    return;
  }
  if (section === 'pieceSets') {
    const users = projectsUsing(library, 'pieceSet', item.id);
    const ok = await confirmDialog({
      title: '프롬프트 조각 삭제',
      message: (
        <p>
          "{item.name}"을(를) 삭제합니다.
          {users.length
            ? ` 이 조각을 부르는 작업 ${users.length}개(${users.map((project) => project.name).join(', ')})는 조각을 다시 만들기 전까지 생성할 수 없습니다.`
            : ''}
        </p>
      ),
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    updateLibrary((current) => removeItem(current, 'pieceSets', item.id));
    openLibrary(section);
    return;
  }
  const users = projectsUsing(library, LABELS[section].kind, item.id);
  let replacementId: string | undefined;
  if (users.length) {
    let result: { replacementId: string } | null = null;
    await openDialog((close) => (
      <DeleteUsedDialog
        section={section}
        item={item}
        users={users}
        close={(value) => {
          result = value;
          close();
        }}
      />
    ));
    if (!result) return;
    replacementId = (result as { replacementId: string }).replacementId || undefined;
  } else {
    const ok = await confirmDialog({
      title: `${LABELS[section].title} 삭제`,
      message: (
        <p>
          "{item.name}"을(를) 삭제합니다.
          {section === 'references' ? ' 이미지 폴더는 휴지통으로 이동합니다.' : ''}
        </p>
      ),
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
  }
  await run('삭제하는 중', async () => {
    if (section === 'references') await libraryApi().deleteReferenceFiles(item.id);
    updateLibrary((current) => removeItemReassigning(current, section, item.id, replacementId));
    openLibrary(section);
  });
}

/**
 * 여러 항목을 한 번에 지운다. 작업이 쓰던 항목은 대신할 항목을 묻지 않고 연결을 비워 두므로,
 * 그 작업은 화면에서 다른 항목을 고르기 전까지 생성할 수 없다.
 */
export async function deleteItems(section: LibrarySection, items: Item[]): Promise<boolean> {
  if (!items.length) return false;
  if (items.length === 1) {
    await deleteItem(section, items[0]);
    return true;
  }
  const library = useStore.getState().library!;
  if (section === 'presets' && library.presets.length <= items.length) {
    toast('생성 설정은 최소 하나가 있어야 합니다.', 'error');
    return false;
  }
  const kind = LABELS[section].kind;
  const users = new Map<string, string>();
  for (const item of items)
    for (const project of projectsUsing(library, kind, item.id)) users.set(project.id, project.name);
  const ok = await confirmDialog({
    title: `${LABELS[section].title} ${items.length}개 삭제`,
    message: (
      <>
        <p>
          {items
            .slice(0, 5)
            .map((item) => `"${item.name}"`)
            .join(', ')}
          {items.length > 5 ? ` 외 ${items.length - 5}개` : ''}을(를) 삭제합니다.
          {section === 'references' ? ' 이미지 폴더는 휴지통으로 이동합니다.' : ''}
        </p>
        {users.size > 0 && (
          <p className="hint">
            작업 {users.size}개({[...users.values()].join(', ')})가 이 항목을 씁니다. 그 작업은 다른
            항목을 고르기 전까지 생성할 수 없습니다.
          </p>
        )}
      </>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return false;
  await run('삭제하는 중', async () => {
    const ids = items.map((item) => item.id);
    if (section === 'references')
      for (const id of ids) await libraryApi().deleteReferenceFiles(id);
    updateLibrary((current) =>
      ids.reduce(
        (next, id) =>
          section === 'pieceSets'
            ? removeItem(next, 'pieceSets', id)
            : removeItemReassigning(next, section, id),
        current,
      ),
    );
    openLibrary(section);
  });
  return true;
}

export async function duplicateItem(section: LibrarySection, item: Item) {
  const library = useStore.getState().library!;
  const name = duplicateName(library, section, item.name);
  let id = '';
  if (section === 'presets') {
    const copy = clonePreset(item as Preset, name);
    id = copy.id;
    updateLibrary((current) => ({ ...current, presets: [...current.presets, copy] }));
  } else if (section === 'characters') {
    const copy = cloneCharacter(item as Character, name);
    id = copy.id;
    updateLibrary((current) => ({ ...current, characters: [...current.characters, copy] }));
  } else if (section === 'emotionSets') {
    const copy = cloneEmotionSet(item as EmotionSet, name);
    id = copy.id;
    updateLibrary((current) => ({ ...current, emotionSets: [...current.emotionSets, copy] }));
  } else if (section === 'pieceSets') {
    const copy = clonePieceSet(item as PieceSet, name);
    id = copy.id;
    updateLibrary((current) => ({ ...current, pieceSets: [...current.pieceSets, copy] }));
  } else {
    const copy = cloneReferenceMeta(item as Reference, name);
    id = copy.id;
    await run('인페인트를 복제하는 중', () => libraryApi().copyReferenceFiles(item.id, copy.id));
    updateLibrary((current) => ({ ...current, references: [...current.references, copy] }));
  }
  openLibrary(section, id);
}

export function exportItem(section: LibrarySection, item: Item) {
  void run('내보내는 중', async () => {
    let saved: string | null = null;
    if (section === 'references') saved = await fileApi().exportReference(item as Reference);
    else {
      const data =
        section === 'presets'
          ? exportPreset(item as Preset)
          : section === 'characters'
            ? exportCharacter(item as Character)
            : section === 'pieceSets'
              ? exportPieceSet(item as PieceSet)
              : exportEmotionSet(item as EmotionSet);
      saved = await fileApi().saveJsonFile(
        data,
        // 프롬프트 조각은 SDStudio 형식이라 이름만으로 저장한다.
        section === 'pieceSets' ? `${item.name}.json` : `${item.name}__${section}.json`,
        `${LABELS[section].title} 내보내기`,
      );
    }
    if (saved) toast(`저장했습니다: ${saved}`);
  });
}

export function openReferenceFolder(item: Item) {
  void run('폴더를 여는 중', () =>
    libraryApi().openInExplorer({ kind: 'reference', referenceId: item.id }),
  );
}

export function itemMenu(section: LibrarySection, item: Item): MenuItem[] {
  return [
    { label: '이름 변경', onSelect: () => void renameItem(section, item) },
    { label: '복제', onSelect: () => void duplicateItem(section, item) },
    { label: 'JSON 내보내기', onSelect: () => exportItem(section, item) },
    ...(section === 'references'
      ? [{ label: '폴더 열기', onSelect: () => openReferenceFolder(item) }]
      : []),
    'divider',
    { label: '삭제', danger: true, onSelect: () => void deleteItem(section, item) },
  ];
}

/** 새 항목을 만든다. 감정 모음은 기본 감정 6개로 시작하거나(기본) empty면 빈 채로 시작한다. */
export function createItem(
  section: LibrarySection,
  library: Library,
  options: { empty?: boolean } = {},
): string {
  const taken = (library[section] as Item[]).map((item) => item.name);
  if (section === 'presets') {
    const item = createPreset(uniqueName('새 생성 설정', taken));
    updateLibrary((current) => ({ ...current, presets: [...current.presets, item] }));
    return item.id;
  }
  if (section === 'characters') {
    const item = createCharacter(uniqueName('새 캐릭터', taken));
    updateLibrary((current) => ({ ...current, characters: [...current.characters, item] }));
    return item.id;
  }
  if (section === 'emotionSets') {
    const item = createEmotionSet(uniqueName('새 감정 모음', taken), options.empty ? [] : undefined);
    updateLibrary((current) => ({ ...current, emotionSets: [...current.emotionSets, item] }));
    return item.id;
  }
  if (section === 'pieceSets') {
    const item = createPieceSet(uniqueName('새 프롬프트 조각', taken), [
      { name: '새 조각', prompt: '' },
    ]);
    updateLibrary((current) => ({ ...current, pieceSets: [...current.pieceSets, item] }));
    return item.id;
  }
  const item = createReference(uniqueName('새 인페인트', taken));
  updateLibrary((current) => ({ ...current, references: [...current.references, item] }));
  return item.id;
}

export function itemSubtitle(section: LibrarySection, item: Item): string {
  if (section === 'presets') {
    const preset = item as Preset;
    return `${modelInfo(preset.generation.model)?.label.replace('NAI Diffusion ', '') ?? preset.generation.model} · ${preset.generation.steps} steps`;
  }
  if (section === 'characters') return `프롬프트 세트 ${(item as Character).promptSets.length}개`;
  if (section === 'emotionSets') return `감정 ${(item as EmotionSet).emotions.length}개`;
  if (section === 'pieceSets') return `조각 ${(item as PieceSet).pieces.length}개`;
  const reference = item as Reference;
  return reference.image
    ? `${reference.image.canvasWidth}×${reference.image.canvasHeight}`
    : '이미지 없음';
}
