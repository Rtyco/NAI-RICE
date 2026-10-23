import type { FocusPart } from '../../store';

const WIDTH = 168;
const HEIGHT = 104;
const TITLE_BAR = 8;
const QUEUE_BAR = 8;

/** 왼쪽부터. 가운데(part 없음)는 남는 폭을 다 쓴다. */
const COLUMNS: Array<{ part?: Exclude<FocusPart, 'queueBar'>; width: number }> = [
  { part: 'sidebar', width: 16 },
  { part: 'leftPanel', width: 28 },
  { width: 0 },
  { part: 'sidePanel', width: 30 },
  { part: 'history', width: 16 },
];

/** 집중 모드에서 남는 화면. 사이드바는 실제처럼 생성 큐 막대 옆까지 내려온다. */
export function FocusPreview({ hidden }: { hidden: FocusPart[] }) {
  const shown = COLUMNS.filter((column) => !column.part || !hidden.includes(column.part));
  const fixed = shown.reduce((sum, column) => sum + column.width, 0);
  const queue = !hidden.includes('queueBar');
  const bottom = HEIGHT - (queue ? QUEUE_BAR : 0);
  const sidebar = !hidden.includes('sidebar');
  const palette = hidden.includes('sidePanel') || hidden.includes('queueBar');

  let x = 0;
  const columns = shown.map((column) => {
    const width = column.part ? column.width : WIDTH - fixed;
    const placed = { ...column, x, width };
    x += width;
    return placed;
  });
  const center = columns.find((column) => !column.part)!;
  const middle = center.x + center.width / 2;

  return (
    <svg className="focus-preview" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <rect className="fp-stage" width={WIDTH} height={HEIGHT} />
      <rect className="fp-chrome" width={WIDTH} height={TITLE_BAR} />
      {columns.map((column) =>
        column.part ? (
          <rect
            key={column.part}
            className="fp-panel"
            x={column.x}
            y={TITLE_BAR}
            width={column.width}
            height={(column.part === 'sidebar' ? HEIGHT : bottom) - TITLE_BAR}
          />
        ) : (
          <rect
            key="image"
            className="fp-image"
            x={middle - 13}
            y={TITLE_BAR + 12}
            width={26}
            height={bottom - TITLE_BAR - 26}
            rx={2}
          />
        ),
      )}
      {queue && (
        <rect
          className="fp-chrome"
          x={sidebar ? 16 : 0}
          y={bottom}
          width={WIDTH - (sidebar ? 16 : 0)}
          height={QUEUE_BAR}
        />
      )}
      {palette && (
        <>
          <rect
            className="fp-palette"
            x={middle - 13}
            y={bottom - 13}
            width={26}
            height={9}
            rx={3}
          />
          <rect className="fp-go" x={middle - 9} y={bottom - 11} width={7} height={5} rx={1.5} />
        </>
      )}
    </svg>
  );
}
