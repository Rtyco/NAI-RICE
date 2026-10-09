import type { FreeInpaint, GenerationSummary } from '../core/domain/types';
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
function dropSourceFiles(previous: FreeInpaint | undefined, next: FreeInpaint | undefined) {
  const keep = new Set([next?.file, next?.maskFile]);
  for (const file of [previous?.file, previous?.maskFile])
    if (file && !keep.has(file))
      void libraryApi()
        .deleteSourceImage(file)
        .catch(() => undefined);
}

function setFreeInpaint(
  stored: StoredSource,
  name: string,
  fromRecord?: FreeInpaint['fromRecord'],
) {
  const previous = useStore.getState().library?.freeGeneration.inpaint;
  pendingMask = undefined;
  const inpaint: FreeInpaint = {
    name,
    ...stored,
    // 같은 이미지를 다시 보내면 칠해 둔 마스크를 그대로 쓴다.
    ...(previous?.file === stored.file && previous.maskFile ? { maskFile: previous.maskFile } : {}),
    ...(fromRecord ? { fromRecord } : {}),
  };
  updateFreeGeneration({ mode: 'inpaint', inpaint });
  dropSourceFiles(previous, inpaint);
}

/** 생성 결과를 자유 인페인팅 이미지로 정하고 자유 생성 화면으로 간다. */
export function sendToFreeInpaint(projectId: string, record: GenerationSummary): Promise<void> {
  return run('자유 인페인팅을 준비하는 중', async () => {
    const stored = await libraryApi().addSourceImage({
      kind: 'record',
      projectId,
      generationId: record.id,
    });
    setFreeInpaint(stored, recordName(projectId, record), { projectId, generationId: record.id });
    openFree();
  }).then(() => undefined);
}

export function loadFreeInpaintFromFile(): Promise<void> {
  return run('이미지를 불러오는 중', async () => {
    const file = await fileApi().openImageFile();
    if (!file) return;
    const stored = await libraryApi().addSourceImage({ kind: 'data', dataUrl: file.dataUrl });
    setFreeInpaint(stored, file.name.replace(/\.[^.]+$/, ''));
  }).then(() => undefined);
}

export function clearFreeInpaint(): void {
  const previous = useStore.getState().library?.freeGeneration.inpaint;
  pendingMask = undefined;
  updateFreeGeneration({ inpaint: undefined });
  dropSourceFiles(previous, undefined);
}

let pendingMask: { file: string; data: Uint8Array; width: number; height: number } | undefined;
let maskTimer: ReturnType<typeof setTimeout> | undefined;

/** 칠하는 동안 붓질마다 파일을 쓰지 않도록, 손을 뗀 뒤 잠시 기다렸다가 저장한다. */
export function setFreeInpaintMask(file: string, data: Uint8Array, width: number, height: number) {
  pendingMask = { file, data, width, height };
  clearTimeout(maskTimer);
  maskTimer = setTimeout(() => void saveFreeInpaintMask(), 800);
}

/** 기다리는 마스크를 바로 저장한다. 생성하기 직전과 화면을 떠날 때 부른다. */
export async function saveFreeInpaintMask(): Promise<void> {
  clearTimeout(maskTimer);
  const mask = pendingMask;
  pendingMask = undefined;
  const current = useStore.getState().library?.freeGeneration.inpaint;
  if (!mask || current?.file !== mask.file) return;
  const maskFile = maskHasGeneratePixels(mask.data)
    ? await libraryApi().addSourceMask(maskToDataUrl(mask.data, mask.width, mask.height))
    : undefined;
  if (maskFile === current.maskFile) return;
  // 저장하는 사이에 이미지를 바꿨으면 새 이미지에 옛 마스크를 붙이지 않는다.
  const latest = useStore.getState().library?.freeGeneration.inpaint;
  if (latest?.file !== mask.file) return;
  const next = { ...latest, maskFile };
  updateFreeGeneration({ inpaint: next });
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
