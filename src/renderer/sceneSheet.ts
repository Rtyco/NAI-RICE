import type { GenerationSummary } from '../core/domain/types';
import { sheetLayout } from '../core/imaging/SceneSheet';
import { libraryApi } from './desktop';
import { canvas2d, loadHtmlImage } from './lib/image';

export type SheetOptions = { columns: number; cellWidth: number; dark: boolean };

export type SheetItem = { record: GenerationSummary; label: string };

export function sheetAspect(items: SheetItem[]): number {
  return items.reduce((most, { record }) => Math.max(most, record.height / record.width), 0) || 1;
}

function fitText(context: CanvasRenderingContext2D, text: string, width: number): string {
  if (context.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** 결과는 desk-media:// 주소로 그리면 캔버스가 오염되어 데이터 URL로 받는다. */
export async function drawSceneSheet(
  projectId: string,
  items: SheetItem[],
  options: SheetOptions,
): Promise<Uint8Array> {
  const layout = sheetLayout(items.length, options.columns, options.cellWidth, sheetAspect(items));
  const { canvas, context } = canvas2d(layout.width, layout.height, false);
  context.fillStyle = options.dark ? '#1c1d22' : '#ffffff';
  context.fillRect(0, 0, layout.width, layout.height);
  context.imageSmoothingQuality = 'high';
  context.font = `600 ${layout.fontSize}px ${getComputedStyle(document.body).fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const [index, { record, label }] of items.entries()) {
    const image = await loadHtmlImage(
      await libraryApi().readImageDataUrl({
        kind: 'record',
        projectId,
        generationId: record.id,
      }),
    );
    const { x, y } = layout.cells[index];
    const scale = Math.min(
      layout.cellWidth / image.naturalWidth,
      layout.imageHeight / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(
      image,
      x + (layout.cellWidth - width) / 2,
      y + (layout.imageHeight - height) / 2,
      width,
      height,
    );
    context.fillStyle = options.dark ? '#ececec' : '#222222';
    context.fillText(
      fitText(context, label, layout.cellWidth - layout.fontSize),
      x + layout.cellWidth / 2,
      y + layout.imageHeight + layout.labelHeight / 2,
    );
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('한 장으로 모은 이미지를 만들 수 없습니다.');
  return new Uint8Array(await blob.arrayBuffer());
}
