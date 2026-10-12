import type { FreeImage, GenerationSummary } from '../core/domain/types';
import { maskHasGeneratePixels } from '../core/imaging/MaskBuilder';
import { createReference, FREE_PROJECT_ID } from '../core/model/defaults';
import { fileApi, libraryApi } from './desktop';
import { maskToDataUrl } from './lib/image';
import type { StoredSource } from '../shared/ipc';
import {
  openFree,
  openLibrary,
  run,
  setPendingReference,
  toast,
  updateFreeGeneration,
  updateLibrary,
  useStore,
} from './store';

export function sourceMedia(file: string): string {
  return libraryApi().mediaUrl({ kind: 'source' }, file);
}

export function sourceDataUrl(file: string): Promise<string> {
  return libraryApi().readImageDataUrl({ kind: 'source', file });
}

function recordName(projectId: string, record: GenerationSummary): string {
  return `${record.emotionName || (projectId === FREE_PROJECT_ID ? '자유 생성' : '결과')} ${record.seed}`;
}

/** 바뀌어 더는 쓰지 않는 `sources/` 파일을 지운다. 지우지 못해도 다음 작업에는 지장이 없다. */
function dropSourceFiles(previous: FreeImage | undefined, next: FreeImage | undefined) {
  const keep = new Set([next?.file, next?.maskFile]);
  for (const file of [previous?.file, previous?.maskFile])
    if (file && !keep.has(file))
      void libraryApi()
        .deleteSourceImage(file)
        .catch(() => undefined);
}

function setFreeImage(
  stored: StoredSource,
  name: string,
  mode: 'img2img' | 'augment',
  fromRecord?: FreeImage['fromRecord'],
) {
  const previous = useStore.getState().library?.freeGeneration.image;
  pendingMask = undefined;
  const image: FreeImage = {
    name,
    ...stored,
    // 같은 이미지를 다시 보내면 칠해 둔 마스크를 그대로 쓴다.
    ...(previous?.file === stored.file && previous.maskFile ? { maskFile: previous.maskFile } : {}),
    ...(fromRecord ? { fromRecord } : {}),
  };
  updateFreeGeneration({ mode, image });
  dropSourceFiles(previous, image);
}

/** 생성 결과를 자유 생성 i2i 이미지로 정하고 자유 생성 화면으로 간다. 인페인팅 토글은 그대로 둔다. */
export function sendToFreeImg2Img(projectId: string, record: GenerationSummary): Promise<void> {
  return sendToFree(projectId, record, 'img2img');
}

/** 생성 결과를 자유 생성 디렉터 툴의 이미지로 정하고 자유 생성 화면으로 간다. */
export function sendToFreeDirector(projectId: string, record: GenerationSummary): Promise<void> {
  return sendToFree(projectId, record, 'augment');
}

function sendToFree(
  projectId: string,
  record: GenerationSummary,
  mode: 'img2img' | 'augment',
): Promise<void> {
  return run('자유 생성 이미지를 준비하는 중', async () => {
    const stored = await libraryApi().addSourceImage({
      kind: 'record',
      projectId,
      generationId: record.id,
    });
    setFreeImage(stored, recordName(projectId, record), mode, {
      projectId,
      generationId: record.id,
    });
    openFree();
  }).then(() => undefined);
}

export function loadFreeImageFromFile(): Promise<void> {
  return run('이미지를 불러오는 중', async () => {
    const file = await fileApi().openImageFile();
    if (!file) return;
    const stored = await libraryApi().addSourceImage({ kind: 'data', dataUrl: file.dataUrl });
    const mode =
      useStore.getState().library?.freeGeneration.mode === 'augment' ? 'augment' : 'img2img';
    setFreeImage(stored, file.name.replace(/\.[^.]+$/, ''), mode);
  }).then(() => undefined);
}

/** 흰 빈 캔버스를 i2i 이미지로 정한다. 「그리기」에서 처음부터 그릴 때 쓴다. */
export function newBlankFreeImage(width: number, height: number): Promise<void> {
  return run('빈 캔버스를 만드는 중', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const stored = await libraryApi().addSourceImage({
      kind: 'data',
      dataUrl: canvas.toDataURL('image/png'),
    });
    setFreeImage(stored, '빈 캔버스', 'img2img');
  }).then(() => undefined);
}

/**
 * 「그리기」에서 덧칠한 이미지로 i2i 이미지를 바꾼다. 크기는 그대로라 원래 영역(`outputRect`)과 칠해 둔
 * 마스크는 그대로 쓴다.
 */
export async function replaceFreeImagePixels(file: string, dataUrl: string): Promise<void> {
  const stored = await libraryApi().addSourceImage({ kind: 'data', dataUrl });
  const latest = useStore.getState().library?.freeGeneration.image;
  // 합치는 사이에 다른 이미지로 바꿨으면 새 이미지에 옛 그림을 덮지 않는다.
  if (!latest || latest.file !== file) return;
  const next: FreeImage = { ...latest, file: stored.file };
  updateFreeGeneration({ image: next });
  dropSourceFiles(latest, next);
}

let pendingDrawing: (() => Promise<void>) | undefined;

export function setPendingDrawing(apply: (() => Promise<void>) | undefined): void {
  pendingDrawing = apply;
}

/** 「그리기」에서 합치지 않은 그림이 있으면 합친다. 생성하기 직전에 부른다. */
export async function applyPendingDrawing(): Promise<void> {
  const apply = pendingDrawing;
  pendingDrawing = undefined;
  await apply?.();
}

export function clearFreeImage(): void {
  const previous = useStore.getState().library?.freeGeneration.image;
  pendingMask = undefined;
  updateFreeGeneration({ image: undefined });
  dropSourceFiles(previous, undefined);
}

let pendingMask: { file: string; data: Uint8Array; width: number; height: number } | undefined;
let maskTimer: ReturnType<typeof setTimeout> | undefined;

/** 칠하는 동안 붓질마다 파일을 쓰지 않도록, 손을 뗀 뒤 잠시 기다렸다가 저장한다. */
export function setFreeMask(file: string, data: Uint8Array, width: number, height: number) {
  pendingMask = { file, data, width, height };
  clearTimeout(maskTimer);
  maskTimer = setTimeout(() => void saveFreeMask(), 800);
}

/** 기다리는 마스크를 바로 저장한다. 생성하기 직전과 화면을 떠날 때 부른다. */
export async function saveFreeMask(): Promise<void> {
  clearTimeout(maskTimer);
  const mask = pendingMask;
  pendingMask = undefined;
  const current = useStore.getState().library?.freeGeneration.image;
  if (!mask || current?.file !== mask.file) return;
  const maskFile = maskHasGeneratePixels(mask.data)
    ? await libraryApi().addSourceMask(maskToDataUrl(mask.data, mask.width, mask.height))
    : undefined;
  if (maskFile === current.maskFile) return;
  // 저장하는 사이에 이미지를 바꿨으면 새 이미지에 옛 마스크를 붙이지 않는다.
  const latest = useStore.getState().library?.freeGeneration.image;
  if (latest?.file !== mask.file) return;
  const next = { ...latest, maskFile };
  updateFreeGeneration({ image: next });
  dropSourceFiles(latest, next);
}

/** 결과 이미지를 참고 이미지로 쓰는 새 인페인트를 만들고 인페인트 편집으로 간다. */
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
