import type { Library, Vibe } from '../core/domain/types';
import {
  createCharacterReference,
  createVibe,
  FREE_PROJECT_ID,
  type AidChoice,
} from '../core/model/defaults';
import { patchItem } from '../core/model/mutations';
import type { MetadataVibe } from '../core/vibes/VibeFile';
import type { ImportedVibe } from '../shared/ipc';
import { libraryApi } from './desktop';
import { currentProject, openLibrary, toast, updateLibrary, useStore } from './store';

export type AidSection = 'characterReferences' | 'vibes';

/** `projectId`(자유 생성은 FREE_PROJECT_ID)가 있으면 캐릭터 레퍼런스는 바꿔 끼우고, 바이브는 고른 바이브 뒤에 더한다. */
export async function addAidFromImage(
  section: AidSection,
  image: { name: string; dataUrl: string },
  name: string,
  projectId?: string,
): Promise<string> {
  const stored = await libraryApi().addPicture(image.dataUrl);
  const picture = { ...stored, name: image.name };
  const linked = (aid: AidChoice, id: string): Partial<AidChoice> =>
    section === 'characterReferences'
      ? { characterReferenceIds: [id], aidMode: 'character' }
      : { vibeIds: [...aid.vibeIds, id], aidMode: 'vibe' };
  const link = (library: Library, id: string) => {
    if (!projectId) return library;
    if (projectId === FREE_PROJECT_ID)
      return {
        ...library,
        freeGeneration: { ...library.freeGeneration, ...linked(library.freeGeneration, id) },
      };
    return patchItem(library, 'projects', projectId, (project) => ({
      ...project,
      ...linked(project, id),
    }));
  };
  if (section === 'characterReferences') {
    const item = { ...createCharacterReference(name), image: picture };
    updateLibrary((current) =>
      link({ ...current, characterReferences: [...current.characterReferences, item] }, item.id),
    );
    return item.id;
  }
  const item = { ...createVibe(name), image: picture };
  updateLibrary((current) => link({ ...current, vibes: [...current.vibes, item] }, item.id));
  return item.id;
}

/** 작업이 없으면 라이브러리의 바이브 칸을 연다. */
function addImportedVibes(imported: ImportedVibe[], projectId?: string): void {
  const project = useStore.getState().library?.projects.find((item) => item.id === projectId);
  const items: Vibe[] = imported.map((vibe) => ({
    ...createVibe(vibe.name),
    image: { ...vibe.picture, name: vibe.name },
    strength: vibe.strength,
    informationExtracted: vibe.informationExtracted,
    ...(vibe.encodingId ? { encodingId: vibe.encodingId } : {}),
  }));
  const ids = items.map((item) => item.id);
  updateLibrary((current) => {
    const next = { ...current, vibes: [...current.vibes, ...items] };
    return !project
      ? next
      : patchItem(next, 'projects', project.id, (entry) => ({
          ...entry,
          vibeIds: [...entry.vibeIds, ...ids],
          aidMode: 'vibe',
        }));
  });
  if (project) toast(`바이브 ${items.length}개를 가져와 작업 "${project.name}"에 넣었습니다.`);
  else {
    toast(`바이브 ${items.length}개를 가져왔습니다.`);
    openLibrary('vibes', ids[0]);
  }
}

export async function importVibeFile(
  text: string,
  fileName: string,
  projectId = currentProject()?.id,
): Promise<void> {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/\.naiv4vibe(bundle)?$/i, '');
  addImportedVibes(await libraryApi().importVibeFile(text, stem), projectId);
}

/** `model`은 그 이미지의 일반 생성 모델 ID. */
export async function importMetadataVibes(
  vibes: MetadataVibe[],
  model: string,
  name: string,
  projectId?: string,
): Promise<void> {
  addImportedVibes(await libraryApi().importMetadataVibes({ model, name, vibes }), projectId);
}
