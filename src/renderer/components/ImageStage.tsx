import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toggleFilmstrip, useStore } from '../store';
import { Icon } from './Icon';
import { clampZoom, useWheel, ZOOM_STEP } from './zoom';

const PAD = 14;

type Offset = { x: number; y: number };
const CENTER: Offset = { x: 0, y: 0 };

/** 다른 이미지로 넘겨도 배율과 자리를 두어 같은 곳을 비교한다. 처음 맞출 때는 원본보다 키우지 않는다. */
function ZoomView(props: {
  src: string;
  alt?: string;
  initial?: 'fit' | number;
  tools?: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<'fit' | number>(props.initial ?? 'fit');
  const [offset, setOffsetState] = useState<Offset>(CENTER);
  const [natural, setNatural] = useState<{ src: string; width: number; height: number }>();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const drag = useRef<{ x: number; y: number; from: Offset; pointerId: number } | null>(null);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setBox({ width: node.clientWidth, height: node.clientHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 렌더 사이에 휠이 여러 번 오면 마지막으로 정한 값에서 이어 간다.
  const scaleRef = useRef(1);
  const offsetRef = useRef<Offset>(CENTER);
  const setOffset = (next: Offset) => {
    offsetRef.current = next;
    setOffsetState(next);
  };
  const size = natural?.src === props.src ? natural : undefined;
  const fitScale =
    size && box.width
      ? Math.min((box.width - PAD * 2) / size.width, (box.height - PAD * 2) / size.height, 1)
      : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;
  scaleRef.current = scale;

  /** 커서(없으면 가운데) 아래 지점이 그 자리에 남는다. */
  const zoomTo = (next: number, clientX?: number, clientY?: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    const target = clampZoom(next);
    const ratio = target / scaleRef.current;
    const point = rect
      ? {
          x: (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2,
          y: (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2,
        }
      : CENTER;
    const from = offsetRef.current;
    setOffset({
      x: point.x - (point.x - from.x) * ratio,
      y: point.y - (point.y - from.y) * ratio,
    });
    scaleRef.current = target;
    setZoom(target);
  };
  const reset = (next: 'fit' | number) => {
    setOffset(CENTER);
    setZoom(next);
  };

  useWheel(viewport, (event) => {
    if (!size) return;
    event.preventDefault();
    zoomTo(
      scaleRef.current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      event.clientX,
      event.clientY,
    );
  });

  const endPan = () => {
    drag.current = null;
    setPanning(false);
  };
  const moved = offset.x !== 0 || offset.y !== 0;

  return (
    <div className="zoom-view">
      <div
        ref={viewport}
        className={`zoom-viewport ${panning ? 'panning' : ''}`}
        onMouseDown={(event) => {
          // 가운데 버튼 자동 스크롤 대신 끌어서 옮기기
          if (event.button === 1) event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 && event.button !== 1) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            from: offsetRef.current,
            pointerId: event.pointerId,
          };
          setPanning(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.pointerId !== event.pointerId) return;
          setOffset({
            x: start.from.x + event.clientX - start.x,
            y: start.from.y + event.clientY - start.y,
          });
        }}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={() => reset(zoom === 'fit' ? 1 : 'fit')}
      >
        <img
          src={props.src}
          alt={props.alt ?? ''}
          draggable={false}
          onLoad={(event) =>
            setNatural({
              src: props.src,
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          style={
            size
              ? {
                  width: size.width * scale,
                  height: size.height * scale,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }
              : { visibility: 'hidden' }
          }
        />
      </div>
      <div className="zoom-toolbar" onDoubleClick={(event) => event.stopPropagation()}>
        <button
          className="icon-button"
          title="축소 (휠)"
          aria-label="축소"
          onClick={() => zoomTo(scale / ZOOM_STEP)}
        >
          <Icon name="zoom-out" size={16} />
        </button>
        <button
          className="zoom-level"
          title="화면에 맞추고 가운데로 (더블클릭으로 맞춤과 원본 크기 전환)"
          onClick={() => reset('fit')}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          className="icon-button"
          title="확대 (휠)"
          aria-label="확대"
          onClick={() => zoomTo(scale * ZOOM_STEP)}
        >
          <Icon name="zoom-in" size={16} />
        </button>
        <button className="zoom-level" title="원본 크기 (1:1)" onClick={() => zoomTo(1)}>
          1:1
        </button>
        <button
          className="icon-button"
          title="가운데로 (끌어서 옮긴 자리를 되돌립니다)"
          aria-label="가운데로"
          disabled={!moved}
          onClick={() => setOffset(CENTER)}
        >
          <Icon name="center" size={16} />
        </button>
        {props.tools}
      </div>
    </div>
  );
}

/** Esc를 뒤 화면보다 먼저 받는다. */
function Lightbox({ src, alt, close }: { src: string; alt?: string; close: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);
  return createPortal(
    <div className="lightbox" role="dialog" aria-label="원본 크기로 보기">
      <ZoomView
        src={src}
        alt={alt}
        initial={1}
        tools={
          <button className="icon-button" title="닫기 (Esc)" aria-label="닫기" onClick={close}>
            <Icon name="close" size={16} />
          </button>
        }
      />
    </div>,
    document.body,
  );
}

export function ImageStage(props: {
  src?: string;
  alt?: string;
  empty?: ReactNode;
  overlay?: ReactNode;
  filmstrip?: boolean;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  const collapsed = useStore((state) => state.filmstripCollapsed);
  const filmstripButton = props.filmstrip && (
    <button
      className={`icon-button ${collapsed ? '' : 'active'}`}
      title={collapsed ? '이미지 목록 펴기' : '이미지 목록 접기'}
      aria-pressed={!collapsed}
      onClick={toggleFilmstrip}
    >
      <Icon name="filmstrip" size={16} />
    </button>
  );
  return (
    <div
      className="stage-image"
      onContextMenu={(event) => {
        if (props.src && props.onContextMenu) props.onContextMenu(event);
      }}
    >
      {props.src ? (
        <ZoomView
          src={props.src}
          alt={props.alt}
          tools={
            <>
              <button
                className="icon-button"
                title="원본 크기로 크게 보기"
                aria-label="원본 크기로 크게 보기"
                onClick={() => setLightbox(true)}
              >
                <Icon name="expand" size={16} />
              </button>
              {filmstripButton}
            </>
          }
        />
      ) : (
        <>
          {props.empty}
          {filmstripButton && <div className="zoom-toolbar">{filmstripButton}</div>}
        </>
      )}
      {props.overlay}
      {lightbox && props.src && (
        <Lightbox src={props.src} alt={props.alt} close={() => setLightbox(false)} />
      )}
    </div>
  );
}
