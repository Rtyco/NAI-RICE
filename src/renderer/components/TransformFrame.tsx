import { handlePoint, RESIZE_HANDLES, type ImageBox } from '../../core/imaging/FreeTransform';

/** 화면 px */
const HANDLE_SIZE = 9;

export function TransformFrame(props: {
  box: ImageBox;
  width: number;
  height: number;
  /** 화면 확대 비율. 손잡이는 확대와 상관없이 같은 크기로 보인다. */
  scale: number;
}) {
  const { box } = props;
  const handleSize = HANDLE_SIZE / props.scale;
  const outline = (['nw', 'ne', 'se', 'sw'] as const)
    .map((handle) => handlePoint(box, handle))
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  return (
    <svg
      className="transform-frame"
      viewBox={`0 0 ${props.width} ${props.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon className="shadow" points={outline} />
      <polygon points={outline} />
      {RESIZE_HANDLES.map((handle) => {
        const point = handlePoint(box, handle);
        return (
          <rect
            key={handle}
            x={point.x - handleSize / 2}
            y={point.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            transform={`rotate(${box.rotation} ${point.x} ${point.y})`}
          />
        );
      })}
      <circle cx={box.cx} cy={box.cy} r={handleSize / 3} />
    </svg>
  );
}

export function TransformActions(props: { onCommit: () => void; onCancel: () => void }) {
  return (
    <div className="transform-actions" onPointerDown={(event) => event.stopPropagation()}>
      <button className="accent" title="Enter · 상자 안 더블클릭" onClick={props.onCommit}>
        확정
      </button>
      <button title="Esc · 변형을 시작하기 전으로 되돌립니다" onClick={props.onCancel}>
        취소
      </button>
    </div>
  );
}
