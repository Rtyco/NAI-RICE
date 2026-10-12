import type { Library } from '../core/domain/types';
import { createCharacterReference, createVibe } from '../core/model/defaults';
import { patchItem } from '../core/model/mutations';
import { libraryApi } from './desktop';
import { updateLibrary } from './store';

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
