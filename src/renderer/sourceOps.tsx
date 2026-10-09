import type { GenerationSummary, Img2ImgSource, Library } from '../core/domain/types';
import { createReference, FREE_PROJECT_ID, readableId } from '../core/model/defaults';
import { confirmDialog, promptDialog } from './components/Dialogs';
import { fileApi, libraryApi } from './desktop';
import { openLibrary, run, setPendingReference, toast, updateLibrary, useStore } from './store';
import type { StoredSource } from '../shared/ipc';

export function sourceMedia(source: Pick<Img2ImgSource, 'file'>): string {
  return libraryApi().mediaUrl({ kind: 'source' }, source.file);
}

/** 이 i2i 원본을 쓰는 곳(작업 이름, 자유 생성). */
export function sourceUsers(library: Library, id: string): string[] {
  return [
    ...library.projects.filter((project) => project.img2imgSourceId === id).map((p) => p.name),
    ...(library.freeGeneration.sourceId === id ? ['자유 생성'] : []),
  ];
}

/** 같은 이미지(같은 파일)가 이미 있으면 새로 만들지 않고 그것을 돌려준다. */
function addEntry(stored: StoredSource, name: string, fromRecord?: Img2ImgSource['fromRecord']) {
  const existing = useStore
    .getState()
    .library?.img2imgSources.find((item) => item.file === stored.file);
  if (existing) return existing.id;
  const source: Img2ImgSource = {
    id: readableId(name, 'source'),
    name,
    ...stored,
    createdAt: new Date().toISOString(),
    ...(fromRecord ? { fromRecord } : {}),
  };
  updateLibrary((library) => ({
    ...library,
    img2imgSources: [...library.img2imgSources, source],
  }));
  return source.id;
}

/** 파일을 골라 i2i 원본 라이브러리에 넣고 그 ID를 돌려준다. 취소하면 undefined. */
export function addSourceFromFile(): Promise<string | undefined> {
  return run('이미지를 불러오는 중', async () => {
    const file = await fileApi().openImageFile();
    if (!file) return undefined;
    const stored = await libraryApi().addSourceImage({ kind: 'data', dataUrl: file.dataUrl });
    return addEntry(stored, file.name.replace(/\.[^.]+$/, ''));
  });
}

/** 생성 결과를 i2i 원본 라이브러리에 넣고 그 ID를 돌려준다. */
export function addSourceFromRecord(
  projectId: string,
  record: GenerationSummary,
): Promise<string | undefined> {
  return run('i2i 원본에 넣는 중', async () => {
    const stored = await libraryApi().addSourceImage({
      kind: 'record',
      projectId,
      generationId: record.id,
    });
    const name = `${record.emotionName || (projectId === FREE_PROJECT_ID ? '자유 생성' : '결과')} ${record.seed}`;
    const id = addEntry(stored, name, { projectId, generationId: record.id });
    toast(`i2i 원본 라이브러리에 넣었습니다: ${name}`);
    return id;
  });
}

export async function renameSource(source: Img2ImgSource): Promise<void> {
  const name = await promptDialog({
    title: '이름 변경',
    label: '이름',
    initial: source.name,
    confirmLabel: '변경',
  });
  if (name)
    updateLibrary((library) => ({
      ...library,
      img2imgSources: library.img2imgSources.map((item) =>
        item.id === source.id ? { ...item, name } : item,
      ),
    }));
}

/** 목록에서 빼고 파일은 휴지통으로 보낸다. 쓰던 작업·자유 생성은 원본이 비게 된다. */
export async function deleteSource(source: Img2ImgSource): Promise<void> {
  const library = useStore.getState().library!;
  const users = sourceUsers(library, source.id);
  const ok = await confirmDialog({
    title: 'i2i 원본 삭제',
    message: (
      <p>
        "{source.name}"을(를) 지우고 이미지 파일은 Windows 휴지통으로 이동합니다.
        {users.length > 0 && ` ${users.join(', ')}에서 쓰던 원본이라 다시 골라야 합니다.`} 이미 만든
        결과는 그대로 남습니다.
      </p>
    ),
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  updateLibrary((current) => ({
    ...current,
    img2imgSources: current.img2imgSources.filter((item) => item.id !== source.id),
    projects: current.projects.map((project) =>
      project.img2imgSourceId === source.id ? { ...project, img2imgSourceId: undefined } : project,
    ),
    freeGeneration:
      current.freeGeneration.sourceId === source.id
        ? { ...current.freeGeneration, sourceId: undefined }
        : current.freeGeneration,
  }));
  await run('파일을 휴지통으로 보내는 중', () => libraryApi().deleteSourceImage(source.file));
}

/** 이 이미지를 참고 이미지로 쓰는 새 인페인트를 만들고 인페인트 편집으로 간다. */
export function makeReferenceFromSource(source: Img2ImgSource): Promise<void> {
  return run('인페인트를 만드는 중', async () => {
    const blob = await (await fetch(sourceMedia(source))).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const reference = createReference(source.name);
    updateLibrary((library) => ({ ...library, references: [...library.references, reference] }));
    setPendingReference({ referenceId: reference.id, dataUrl, name: `${source.name}.png` });
    openLibrary('references', reference.id);
  }).then(() => undefined);
}
