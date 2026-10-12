import type { Library, Vibe } from '../core/domain/types';
import { createCharacterReference, createVibe } from '../core/model/defaults';
import { patchItem } from '../core/model/mutations';
import type { MetadataVibe } from '../core/vibes/VibeFile';
import type { ImportedVibe } from '../shared/ipc';
import { libraryApi } from './desktop';
import { currentProject, openLibrary, toast, updateLibrary, useStore } from './store';

export type AidSection = 'characterReferences' | 'vibes';

/**
 * 끌어 놓은 이미지로 캐릭터 레퍼런스나 바이브 항목을 만든다. `projectId`를 주면 그 작업이 이 항목을 쓰게
 * 한다: 캐릭터 레퍼런스는 바꿔 끼우고, 바이브는 고른 바이브 뒤에 더한다. 만든 항목의 id를 돌려준다.
 */
export async function addAidFromImage(
  section: AidSection,
  image: { name: string; dataUrl: string },
  name: string,
  projectId?: string,
): Promise<string> {
  const stored = await libraryApi().addPicture(image.dataUrl);
  const picture = { ...stored, name: image.name };
  const link = (library: Library, id: string) =>
    !projectId
      ? library
      : patchItem(library, 'projects', projectId, (project) =>
          section === 'characterReferences'
            ? { ...project, characterReferenceIds: [id], aidMode: 'character' }
            : { ...project, vibeIds: [...project.vibeIds, id], aidMode: 'vibe' },
        );
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

/**
 * 가져온 바이브로 라이브러리 항목을 만들고, `projectId` 작업의 바이브 뒤에 더한다. 작업이 없으면 라이브러리의
 * 바이브 칸을 연다.
 */
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

/** NovelAI 바이브 파일(`.naiv4vibe`)이나 묶음을 가져온다. 기본으로 열린 작업에 넣는다. */
export async function importVibeFile(
  text: string,
  fileName: string,
  projectId = currentProject()?.id,
): Promise<void> {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/\.naiv4vibe(bundle)?$/i, '');
  addImportedVibes(await libraryApi().importVibeFile(text, stem), projectId);
}

/** NovelAI 이미지의 생성 정보에 든 바이브를 가져온다. `model`은 그 이미지의 일반 생성 모델 ID다. */
export async function importMetadataVibes(
  vibes: MetadataVibe[],
  model: string,
  name: string,
  projectId?: string,
): Promise<void> {
  addImportedVibes(await libraryApi().importMetadataVibes({ model, name, vibes }), projectId);
}
