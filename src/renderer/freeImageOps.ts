import type {
  FreeImage,
  GenerationSummary,
  Library,
  Reference,
  SceneImg2Img,
} from '../core/domain/types';
import { maskHasGeneratePixels } from '../core/imaging/MaskBuilder';
import { createReference, FREE_PROJECT_ID } from '../core/model/defaults';
import { fileApi, libraryApi } from './desktop';
import { canvas2d, maskToDataUrl } from './lib/image';
import type { StoredSource } from '../shared/ipc';
import {
  openEmotion,
  openFree,
  openLibrary,
  run,
  setPendingReference,
  toast,
  updateFreeGeneration,
  updateLibrary,
  updateProject,
  useStore,
} from './store';

/** i2i 이미지를 둔 곳: 자유 생성 또는 씬 상세의 한 씬 */
export type ImageTarget =
  { kind: 'free' } | { kind: 'scene'; projectId: string; emotionId: string };

export const FREE_TARGET: ImageTarget = { kind: 'free' };

type TargetPatch = Partial<Pick<SceneImg2Img, 'image' | 'inpaint' | 'on'>>;

export function sceneImg2Img(
  library: Library | null,
  projectId: string,
  emotionId: string,
): SceneImg2Img | undefined {
  return library?.projects.find((item) => item.id === projectId)?.sceneImg2Img?.[emotionId];
}

function targetImage(target: ImageTarget): FreeImage | undefined {
  const library = useStore.getState().library;
  return target.kind === 'free'
    ? library?.freeGeneration.image
    : sceneImg2Img(library, target.projectId, target.emotionId)?.image;
}

/** 자유 생성은 `on` 대신 `mode`를 쓴다. */
export function updateImageTarget(
  target: ImageTarget,
  patch: TargetPatch,
  freeMode?: 'img2img' | 'augment',
): void {
  if (target.kind === 'free') {
    updateFreeGeneration({
      ...('image' in patch ? { image: patch.image } : {}),
      ...(patch.inpaint !== undefined ? { inpaint: patch.inpaint } : {}),
      ...(freeMode ? { mode: freeMode } : {}),
    });
    return;
  }
  updateProject(target.projectId, (project) => ({
    ...project,
    sceneImg2Img: {
      ...project.sceneImg2Img,
      [target.emotionId]: {
        ...(project.sceneImg2Img?.[target.emotionId] ?? { on: true, inpaint: false }),
        ...patch,
      },
    },
  }));
}

export function sourceMedia(file: string): string {
  return libraryApi().mediaUrl({ kind: 'source' }, file);
}

export function sourceDataUrl(file: string): Promise<string> {
  return libraryApi().readImageDataUrl({ kind: 'source', file });
}

function recordName(projectId: string, record: GenerationSummary): string {
  return `${record.emotionName || (projectId === FREE_PROJECT_ID ? '자유 생성' : '결과')} ${record.seed}`;
}

function usedSourceFiles(library: Library | null): Set<string | undefined> {
  const images = [
    library?.freeGeneration.image,
    ...(library?.projects ?? []).flatMap((project) =>
      Object.values(project.sceneImg2Img ?? {}).map((scene) => scene.image),
    ),
  ];
  return new Set(images.flatMap((image) => [image?.file, image?.maskFile]));
}

/** 파일 이름이 내용 해시라 다른 곳이 같은 파일을 쓸 수 있다. 지우지 못해도 지장이 없다. */
export function dropSourceFiles(...images: Array<FreeImage | undefined>): void {
  const used = usedSourceFiles(useStore.getState().library);
  for (const image of images)
    for (const file of [image?.file, image?.maskFile])
      if (file && !used.has(file))
        void libraryApi()
          .deleteSourceImage(file)
          .catch(() => undefined);
}

function setTargetImage(
  target: ImageTarget,
  stored: StoredSource,
  name: string,
  mode: 'img2img' | 'augment',
  fromRecord?: FreeImage['fromRecord'],
) {
  const previous = targetImage(target);
  pendingMask = undefined;
  const image: FreeImage = {
    name,
    ...stored,
    // 같은 이미지면 칠해 둔 마스크를 그대로 쓴다.
    ...(previous?.file === stored.file && previous.maskFile ? { maskFile: previous.maskFile } : {}),
    ...(fromRecord ? { fromRecord } : {}),
  };
  updateImageTarget(target, { image, on: true }, mode);
  dropSourceFiles(previous);
}

/** 인페인팅 토글은 그대로 둔다. */
export function sendToFreeImg2Img(projectId: string, record: GenerationSummary): Promise<void> {
  return sendRecord(FREE_TARGET, projectId, record, 'img2img');
}

export function sendToFreeDirector(projectId: string, record: GenerationSummary): Promise<void> {
  return sendRecord(FREE_TARGET, projectId, record, 'augment');
}

/** 씬 상세를 열고 i2i를 켠다. */
export function sendToSceneImg2Img(
  projectId: string,
  emotionId: string,
  record: GenerationSummary,
): Promise<void> {
  return sendRecord({ kind: 'scene', projectId, emotionId }, projectId, record, 'img2img');
}

function sendRecord(
  target: ImageTarget,
  projectId: string,
  record: GenerationSummary,
  mode: 'img2img' | 'augment',
): Promise<void> {
  const label =
    target.kind === 'free' ? '자유 생성 이미지를 준비하는 중' : 'i2i 이미지를 준비하는 중';
  return run(label, async () => {
    const stored = await libraryApi().addSourceImage({
      kind: 'record',
      projectId,
      generationId: record.id,
    });
    setTargetImage(target, stored, recordName(projectId, record), mode, {
      projectId,
      generationId: record.id,
    });
    if (target.kind === 'free') openFree();
    else openEmotion(target.emotionId);
  }).then(() => undefined);
}

export function loadImageFromFile(target: ImageTarget): Promise<void> {
  return run('이미지를 불러오는 중', async () => {
    const file = await fileApi().openImageFile();
    if (!file) return;
    const stored = await libraryApi().addSourceImage({ kind: 'data', dataUrl: file.dataUrl });
    const mode =
      target.kind === 'free' && useStore.getState().library?.freeGeneration.mode === 'augment'
        ? 'augment'
        : 'img2img';
    setTargetImage(target, stored, file.name.replace(/\.[^.]+$/, ''), mode);
  }).then(() => undefined);
}

/** 복사본이라 i2i에서 마스크를 고쳐도 라이브러리의 인페인트는 그대로다. */
export function loadImageFromReference(target: ImageTarget, reference: Reference): Promise<void> {
  return run('인페인트를 불러오는 중', async () => {
    const stored = await libraryApi().addSourceFromReference(reference);
    const previous = targetImage(target);
    pendingMask = undefined;
    // 캔버스가 같으면 마스크 칸이 key로 다시 만들어지지 않아 화면에 옛 마스크가 남는다.
    if (previous?.file === stored.file) {
      updateImageTarget(target, { image: undefined });
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const image: FreeImage = {
      name: reference.name,
      ...stored,
      fromReference: {
        referenceId: reference.id,
        name: reference.name,
        inpaintStrength: reference.inpaintStrength,
      },
    };
    updateImageTarget(target, { inpaint: true, image }, 'img2img');
    dropSourceFiles(previous);
  }).then(() => undefined);
}

export function newBlankImage(target: ImageTarget, width: number, height: number): Promise<void> {
  return run('빈 캔버스를 만드는 중', async () => {
    const { canvas, context } = canvas2d(width, height, false);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const stored = await libraryApi().addSourceImage({
      kind: 'data',
      dataUrl: canvas.toDataURL('image/png'),
    });
    setTargetImage(target, stored, '빈 캔버스', 'img2img');
  }).then(() => undefined);
}

/** 크기가 같아 `outputRect`와 마스크는 그대로 쓴다. */
export async function replaceImagePixels(
  target: ImageTarget,
  file: string,
  dataUrl: string,
): Promise<void> {
  const stored = await libraryApi().addSourceImage({ kind: 'data', dataUrl });
  const latest = targetImage(target);
  // 합치는 사이에 다른 이미지로 바꿨으면 덮지 않는다.
  if (!latest || latest.file !== file) return;
  updateImageTarget(target, { image: { ...latest, file: stored.file } });
  dropSourceFiles(latest);
}

let pendingDrawing: (() => Promise<void>) | undefined;

export function setPendingDrawing(apply: (() => Promise<void>) | undefined): void {
  pendingDrawing = apply;
}

/** 생성하기 직전에 부른다. */
export async function applyPendingDrawing(): Promise<void> {
  const apply = pendingDrawing;
  pendingDrawing = undefined;
  await apply?.();
}

export function clearImage(target: ImageTarget): void {
  const previous = targetImage(target);
  pendingMask = undefined;
  updateImageTarget(target, { image: undefined });
  dropSourceFiles(previous);
}

/** 지운 씬의 i2i 이미지를 모든 작업에서 뺀다. */
export function forgetSceneImages(emotionIds: Iterable<string>): void {
  const ids = new Set(emotionIds);
  const removed: FreeImage[] = [];
  updateLibrary((library) => ({
    ...library,
    projects: library.projects.map((project) => {
      const scenes = Object.entries(project.sceneImg2Img ?? {});
      if (!scenes.some(([id]) => ids.has(id))) return project;
      for (const [id, scene] of scenes) if (ids.has(id) && scene.image) removed.push(scene.image);
      return {
        ...project,
        sceneImg2Img: Object.fromEntries(scenes.filter(([id]) => !ids.has(id))),
      };
    }),
  }));
  dropSourceFiles(...removed);
}

let pendingMask:
  | { target: ImageTarget; file: string; data: Uint8Array; width: number; height: number }
  | undefined;
let maskTimer: ReturnType<typeof setTimeout> | undefined;

/** 붓질마다 파일을 쓰지 않도록 손을 뗀 뒤 잠시 기다려 저장한다. */
export function setMask(
  target: ImageTarget,
  file: string,
  data: Uint8Array,
  width: number,
  height: number,
) {
  pendingMask = { target, file, data, width, height };
  clearTimeout(maskTimer);
  maskTimer = setTimeout(() => void saveMask(), 800);
}

/** 생성 직전과 화면을 떠날 때 부른다. */
export async function saveMask(): Promise<void> {
  clearTimeout(maskTimer);
  const mask = pendingMask;
  pendingMask = undefined;
  if (!mask) return;
  const current = targetImage(mask.target);
  if (current?.file !== mask.file) return;
  const maskFile = maskHasGeneratePixels(mask.data)
    ? await libraryApi().addSourceMask(maskToDataUrl(mask.data, mask.width, mask.height))
    : undefined;
  if (maskFile === current.maskFile) return;
  // 저장하는 사이에 이미지를 바꿨으면 옛 마스크를 붙이지 않는다.
  const latest = targetImage(mask.target);
  if (latest?.file !== mask.file) return;
  updateImageTarget(mask.target, { image: { ...latest, maskFile } });
  dropSourceFiles(latest);
}

export function makeReferenceFromRecord(
  projectId: string,
  record: GenerationSummary,
): Promise<void> {
  return run('인페인트를 만드는 중', async () => {
    const dataUrl = await libraryApi().readImageDataUrl({
      kind: 'record',
      projectId,
      generationId: record.id,
    });
    const name = recordName(projectId, record);
    const reference = createReference(name);
    updateLibrary((library) => ({ ...library, references: [...library.references, reference] }));
    setPendingReference({ referenceId: reference.id, dataUrl, name: `${name}.png` });
    openLibrary('references', reference.id);
    toast(`인페인트 「${name}」을(를) 만들었습니다. 참고 영역과 마스크를 확인하십시오.`);
  }).then(() => undefined);
}
