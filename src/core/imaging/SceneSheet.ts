/** WebP 한 변의 한도 */
export const MAX_SHEET_SIDE = 16383;

export type SheetLayout = {
  width: number;
  height: number;
  cellWidth: number;
  imageHeight: number;
  labelHeight: number;
  fontSize: number;
  /** 칸 왼쪽 위 */
  cells: Array<{ x: number; y: number }>;
};

/** `aspect`는 높이/폭. 이미지마다 다르면 가장 큰 값을 넘겨야 잘리지 않는다. */
export function sheetLayout(
  count: number,
  columns: number,
  cellWidth: number,
  aspect: number,
): SheetLayout {
  const perRow = Math.max(1, Math.min(columns, count));
  const rows = Math.ceil(count / perRow);
  const imageHeight = Math.round(cellWidth * aspect);
  const fontSize = Math.max(12, Math.round(cellWidth / 16));
  const labelHeight = fontSize * 2;
  const gap = Math.max(8, Math.round(cellWidth / 24));
  const rowHeight = imageHeight + labelHeight;
  return {
    width: gap * 2 + perRow * cellWidth + (perRow - 1) * gap,
    height: gap * 2 + rows * rowHeight + Math.max(0, rows - 1) * gap,
    cellWidth,
    imageHeight,
    labelHeight,
    fontSize,
    cells: Array.from({ length: count }, (_, index) => ({
      x: gap + (index % perRow) * (cellWidth + gap),
      y: gap + Math.floor(index / perRow) * (rowHeight + gap),
    })),
  };
}
