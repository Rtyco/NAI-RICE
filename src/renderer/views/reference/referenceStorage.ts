import type { CanvasLayout, DividerLine, Rect, Reference } from '../../../core/domain/types';
import { dividerPixels } from '../../../core/imaging/Divider';
import { cropOutside } from '../../../core/imaging/OutputCropper';
import { expandRect } from '../../../core/imaging/rects';
import { patchItem } from '../../../core/model/mutations';
import { libraryApi } from '../../desktop';
import {
  composeCanvas,
  decodeMask,
  finalCanvasDataUrl,
  isBlank,
  layoutMaskFor,
  loadCanvas,
  maskToDataUrl,
  prepareImage,
  type CanvasImage,
} from '../../lib/image';
import { updateLibrary } from '../../store';

export type Source = { dataUrl: string; name: string; changed: boolean };

export type Working = {
  canvas: CanvasImage;
  width: number;
  height: number;
  backgroundMask: Uint8Array;
  detectionLabel: string;
};

export function detectionText(mode: string, confidence: number): string {
  const label =
    mode === 'transparent' ? '투명 배경' : mode === 'solid' ? '단색 배경' : '수동 확인 필요';
  return `${label} · 신뢰도 ${Math.round(confidence * 100)}%`;
}

export type LoadedReference = {
  source: Source;
  working: Working;
  mask: Uint8Array;
  paint?: HTMLCanvasElement;
  /** 예전 버전의 크롭이 보호 영역과 겹쳐 바깥으로 맞췄을 때만 */
  fittedOutputRect?: Rect;
};

export async function loadReference(reference: Reference): Promise<LoadedReference | undefined> {
  const image = reference.image;
  if (!image) return undefined;
  const images = await libraryApi().readReferenceImages(reference);
  if (!images) return undefined;
  const mask = await decodeMask(images.maskDataUrl, image.canvasWidth, image.canvasHeight);
  const paint = images.paintDataUrl ? await loadCanvas(images.paintDataUrl) : undefined;
  // canvas.png에 층이 합쳐져 있으면 원본에서 base를 다시 만든다.
  const layered = reference.divider.enabled || Boolean(paint);
  let canvas: CanvasImage;
  let backgroundMask: Uint8Array;
  let detectionLabel = '저장된 마스크';
  if (reference.layout.mode === 'auto') {
    backgroundMask = layoutMaskFor(reference.layout);
    const composed = layered
      ? await composeCanvas(images.originalDataUrl, reference.layout)
      : undefined;
    canvas =
      composed && composed.width === image.canvasWidth && composed.height === image.canvasHeight
        ? composed.canvas
        : await loadCanvas(images.canvasDataUrl);
  } else {
    const prepared = await prepareImage(
      layered ? images.originalDataUrl : images.canvasDataUrl,
      reference.backgroundThreshold,
    );
    canvas = prepared.canvas;
    backgroundMask = prepared.backgroundMask;
    detectionLabel = `저장된 마스크 · ${detectionText(prepared.detection.mode, prepared.detection.confidence)}`;
  }
  const blocked = expandRect(
    image.referenceRect,
    reference.maskExpansionPx,
    image.canvasWidth,
    image.canvasHeight,
  );
  const fitted = cropOutside(image.outputRect, blocked);
  return {
    source: { dataUrl: images.originalDataUrl, name: image.originalName, changed: false },
    working: {
      canvas,
      width: image.canvasWidth,
      height: image.canvasHeight,
      backgroundMask,
      detectionLabel,
    },
    mask,
    paint,
    fittedOutputRect:
      JSON.stringify(fitted) !== JSON.stringify(image.outputRect) ? fitted : undefined,
  };
}

export type ReferenceEdit = {
  source: Source | null;
  layout: CanvasLayout;
  working: Working | null;
  referenceRect: Rect;
  outputRect: Rect;
  expansionPx: number;
  threshold: number;
  mask?: Uint8Array;
  divider: DividerLine;
  paint?: HTMLCanvasElement;
};

export type SavableEdit = ReferenceEdit & { source: Source; working: Working; mask: Uint8Array };

/** 마스크가 캔버스와 맞지 않으면 구성 값만 저장한다. */
export function canSaveImages(edit: ReferenceEdit): edit is SavableEdit {
  return Boolean(
    edit.working &&
    edit.mask &&
    edit.source &&
    edit.mask.length === edit.working.width * edit.working.height,
  );
}

export function saveReferenceLayout(referenceId: string, edit: ReferenceEdit): void {
  updateLibrary((library) =>
    patchItem(library, 'references', referenceId, (item) => ({
      ...item,
      layout: edit.layout,
      divider: edit.divider,
    })),
  );
}

export async function saveReferenceImages(
  referenceId: string,
  edit: SavableEdit,
  paintChanged: boolean,
): Promise<void> {
  const { working, mask, source } = edit;
  const { width, height } = working;
  const painted = edit.paint && !isBlank(edit.paint) ? edit.paint : undefined;
  const result = await libraryApi().saveReferenceImages({
    referenceId,
    originalDataUrl: source.changed ? source.dataUrl : undefined,
    paintDataUrl: paintChanged ? (painted?.toDataURL('image/png') ?? null) : undefined,
    canvasDataUrl: finalCanvasDataUrl(working.canvas, width, height, {
      paint: painted,
      divider: edit.divider.enabled
        ? { pixels: dividerPixels(mask, width, height, edit.divider), color: edit.divider.color }
        : undefined,
    }),
    maskDataUrl: maskToDataUrl(mask, width, height),
  });
  updateLibrary((library) =>
    patchItem(library, 'references', referenceId, (item) => ({
      ...item,
      image: {
        originalFile: result.originalFile ?? item.image?.originalFile ?? 'original.png',
        canvasFile: 'canvas.png',
        maskFile: 'mask.png',
        originalName: source.name,
        canvasWidth: width,
        canvasHeight: height,
        referenceRect: edit.referenceRect,
        outputRect: edit.outputRect,
        paintFile: painted ? 'paint.png' : undefined,
      },
      layout: edit.layout,
      divider: edit.divider,
      maskExpansionPx: edit.expansionPx,
      backgroundThreshold: edit.threshold,
      updatedAt: new Date().toISOString(),
    })),
  );
}
