import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toggleFilmstrip, useStore } from '../store';
import { Icon } from './Icon';
import { clampZoom, usePan, useWheel, useZoomAnchor, ZOOM_STEP } from './zoom';

/** 화면에 맞출 때 가장자리에 남기는 여백(px). */
const PAD = 14;

/**
 * 확대·축소할 수 있는 이미지. 휠로 커서 위치를 기준으로 확대하고, 화면보다 크면 끌어서 옮긴다.
 * 처음에는 화면에 맞추며(`fit`), 원본보다 크게 늘리지는 않는다.
 */
function ZoomView(props: {
  src: string;
  alt?: string;
  initial?: 'fit' | number;
  tools?: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<'fit' | number>(props.initial ?? 'fit');
  const [natural, setNatural] = useState<{ src: string; width: number; height: number }>();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const anchor = useZoomAnchor(viewport, image);
  const pan = usePan(viewport);
  const [panning, setPanning] = useState(false);
  const endPan = () => {
    pan.end();
    setPanning(false);
  };

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setBox({ width: node.clientWidth, height: node.clientHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 렌더 사이에 휠 이벤트가 여러 번 오면 렌더된 값이 아니라 마지막으로 정한 배율에서 이어 간다.
  const scaleRef = useRef(1);
  const size = natural?.src === props.src ? natural : undefined;
  const fitScale =
    size && box.width
      ? Math.min((box.width - PAD * 2) / size.width, (box.height - PAD * 2) / size.height, 1)
      : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;
  scaleRef.current = scale;
  const zoomTo = (next: number, x?: number, y?: number) => {
    anchor(x, y);
    scaleRef.current = clampZoom(next);
    setZoom(scaleRef.current);
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

  return (
    <div className="zoom-view">
      <div
        ref={viewport}
        className={`zoom-viewport ${zoom === 'fit' ? '' : 'zoomed'} ${panning ? 'panning' : ''}`}
        onMouseDown={(event) => {
          // 가운데 버튼의 자동 스크롤 대신 끌어서 옮기기를 쓴다.
          if (event.button === 1) event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (event.button !== 1) return;
          pan.begin(event);
          setPanning(true);
        }}
        onPointerMove={(event) => void pan.move(event)}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}
      >
        <div className="zoom-content" style={{ padding: PAD }}>
          <img
            ref={image}
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
                ? { width: size.width * scale, height: size.height * scale }
                : { visibility: 'hidden' }
            }
          />
        </div>
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
          title="화면에 맞추기 (더블클릭으로 맞춤과 원본 크기 전환)"
          onClick={() => setZoom('fit')}
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
        {props.tools}
      </div>
    </div>
  );
}

/** 이미지를 창 전체에 원본 크기로 띄운다. Esc는 뒤의 화면(갤러리로 돌아가기 등)보다 먼저 받는다. */
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

/**
 * 결과 화면 왼쪽의 큰 이미지. 확대·축소, 원본 크기 창, 아래 이미지 목록 접기를 함께 둔다.
 * `src`가 없으면 `empty`를 보여 준다.
 */
export function ImageStage(props: {
  src?: string;
  alt?: string;
  empty?: ReactNode;
  overlay?: ReactNode;
  /** 아래에 이미지 목록이 있을 때만 접기 버튼을 둔다. */
  filmstrip?: boolean;
  /** 이미지 위 우클릭. 이미지가 없을 때는 부르지 않는다. */
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
