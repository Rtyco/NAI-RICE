import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { queueApi } from '../desktop';
import { focusingOf, queueBarShownOf, toggleFocusMode, useLayout } from '../layout';
import { queueAction, summarizeQueue } from '../queueSummary';
import { readUiState, saveUiState, useStore } from '../store';
import { Icon, type IconName } from './Icon';
import { setPaletteSlot, setPanelPopup, useHostUser, usePaletteHost } from './paletteHost';
import { QueueJobs } from './QueueBar';

/** 패널을 숨긴 화면이 꼭 필요한 버튼(생성 등)을 떠 있는 창에 띄운다. */
export function PaletteSlot({ children }: { children: ReactNode }) {
  const node = usePaletteHost((state) => state.slot);
  useHostUser('slotUsers');
  return node ? createPortal(children, node) : null;
}

/** 글자 없이 아이콘만 둔다. 이름은 `label`로 툴팁에 나온다. */
export function PaletteButton({
  icon,
  label,
  badge,
  danger,
  className = '',
  ...rest
}: {
  icon: IconName;
  label: string;
  badge?: number;
  danger?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`palette-button ${className}`}
      title={label}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} size={16} />
      {badge !== undefined && (
        <span className={`palette-badge ${danger ? 'danger' : ''}`}>{badge}</span>
      )}
    </button>
  );
}

const POSITION_KEY = 'palette-position';

/** 창 크기에 대한 가운데 위치(0~1)라 창 크기가 바뀌어도 비슷한 자리에 있다. */
type Position = { x: number; y: number };

const DEFAULT_POSITION: Position = { x: 0.5, y: 0.9 };

/** 위 줄(창 버튼)에 걸치지 않게 위쪽은 이만큼 비운다. */
const TOP_MARGIN = 48;
const MARGIN = 8;
const POPUP_GAP = 6;

const readPosition = () =>
  readUiState<Position>(
    POSITION_KEY,
    (raw) => {
      const saved = JSON.parse(raw ?? 'null') as Partial<Position> | null;
      const valid = (value: unknown): value is number =>
        typeof value === 'number' && value >= 0 && value <= 1;
      return saved && valid(saved.x) && valid(saved.y)
        ? { x: saved.x, y: saved.y }
        : DEFAULT_POSITION;
    },
    DEFAULT_POSITION,
  );

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function FloatingPalette() {
  const used = usePaletteHost((state) => state.slotUsers + state.hiddenPanels > 0);
  const queueShown = useLayout(queueBarShownOf);
  return used || !queueShown ? <Palette queueShown={queueShown} /> : null;
}

type Popup = 'side' | 'queue';

function QueueButtons({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const queue = useStore((state) => state.queue);
  const { active, current, failed, status } = summarizeQueue(queue);
  const api = queueApi();
  const phase = current ? 'busy' : queue.paused && active.length ? 'paused' : '';
  return (
    <>
      <PaletteButton
        icon="queue"
        label="생성 큐 보기"
        title={`${status}${active.length ? ` · 남은 작업 ${active.length}` : ''} · 누르면 생성 큐 보기`}
        className={`palette-queue ${phase} ${open ? 'active' : ''}`}
        badge={active.length || undefined}
        aria-expanded={open}
        onClick={onOpen}
      />
      {active.length > 0 &&
        (queue.paused ? (
          <PaletteButton
            icon="play"
            label="큐 재개"
            onClick={() => void queueAction('큐를 재개하는 중', () => api.resumeQueue())}
          />
        ) : (
          <PaletteButton
            icon="pause"
            label="큐 일시 중지"
            onClick={() => void queueAction('큐를 일시 중지하는 중', () => api.pauseQueue())}
          />
        ))}
      {failed > 0 && (
        <PaletteButton
          icon="refresh"
          label="실패한 작업 다시 시도"
          title={`실패한 작업 ${failed}개 다시 시도`}
          badge={failed}
          danger
          onClick={() => void queueAction('재시도를 등록하는 중', () => api.retryFailed())}
        />
      )}
    </>
  );
}

function Palette({ queueShown }: { queueShown: boolean }) {
  const hasPanel = usePaletteHost((state) => state.hiddenPanels > 0);
  const focusing = useLayout(focusingOf);
  const [position, setPosition] = useState(readPosition);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [popup, setPopup] = useState<Popup>();
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useWindowSize();

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setBoxSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 패널이나 큐 막대가 다시 보이면 팝업으로 볼 것이 없다.
  const shownPopup =
    (popup === 'side' && hasPanel) || (popup === 'queue' && !queueShown) ? popup : undefined;
  const toggle = (next: Popup) => setPopup(shownPopup === next ? undefined : next);

  const left = Math.min(
    Math.max(MARGIN, position.x * width - boxSize.width / 2),
    width - boxSize.width - MARGIN,
  );
  const top = Math.min(
    Math.max(TOP_MARGIN, position.y * height - boxSize.height / 2),
    height - boxSize.height - MARGIN,
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const grabX = event.clientX - (left + boxSize.width / 2);
    const grabY = event.clientY - (top + boxSize.height / 2);
    let next = position;
    const move = (moveEvent: PointerEvent) => {
      next = {
        x: Math.min(1, Math.max(0, (moveEvent.clientX - grabX) / window.innerWidth)),
        y: Math.min(1, Math.max(0, (moveEvent.clientY - grabY) / window.innerHeight)),
      };
      setPosition(next);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      saveUiState(POSITION_KEY, JSON.stringify(next));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  return (
    <>
      <div
        ref={box}
        className="floating-palette"
        role="toolbar"
        aria-label="빠른 버튼"
        style={{ left, top }}
      >
        <span className="palette-grip" title="끌어서 옮기기" onPointerDown={onPointerDown}>
          <Icon name="grip" size={14} />
        </span>
        <div className="palette-slot" ref={setPaletteSlot} />
        {!queueShown && (
          <QueueButtons open={shownPopup === 'queue'} onOpen={() => toggle('queue')} />
        )}
        {hasPanel && (
          <PaletteButton
            icon="sliders"
            label="입력 패널 열기"
            className={shownPopup === 'side' ? 'active' : ''}
            aria-expanded={shownPopup === 'side'}
            onClick={() => toggle('side')}
          />
        )}
        {focusing && (
          <PaletteButton
            icon="focus"
            label="집중 모드 끝내기"
            title="집중 모드 끝내기 (Tab)"
            className="active"
            onClick={toggleFocusMode}
          />
        )}
      </div>
      {shownPopup && (
        <PalettePopup
          kind={shownPopup}
          anchor={{ left, top, width: boxSize.width, height: boxSize.height }}
          window={{ width, height }}
          close={() => setPopup(undefined)}
        />
      )}
    </>
  );
}

const POPUP_WIDTH: Record<Popup, string> = {
  side: 'var(--side-panel-width, 360px)',
  queue: '440px',
};

/** 떠 있는 창 아래에 연다. 아래 자리가 모자라면 위에 연다. */
function PalettePopup(props: {
  kind: Popup;
  anchor: { left: number; top: number; width: number; height: number };
  window: { width: number; height: number };
  close: () => void;
}) {
  const { anchor, kind } = props;
  const below = props.window.height - (anchor.top + anchor.height + POPUP_GAP) - MARGIN;
  const above = anchor.top - POPUP_GAP - TOP_MARGIN;
  const downward = below >= 320 || below >= above;
  const width = `min(${POPUP_WIDTH[kind]}, ${props.window.width - MARGIN * 2}px)`;
  const center = anchor.left + anchor.width / 2;
  const style: CSSProperties = {
    width,
    left: `clamp(${MARGIN}px, calc(${center}px - ${width} / 2), calc(100vw - ${width} - ${MARGIN}px))`,
    maxHeight: downward ? below : above,
    ...(downward
      ? { top: anchor.top + anchor.height + POPUP_GAP }
      : { bottom: props.window.height - anchor.top + POPUP_GAP }),
  };
  return (
    <div
      className={`palette-popup ${kind}`}
      role="dialog"
      aria-label={kind === 'side' ? '입력 패널' : '생성 큐'}
      style={style}
    >
      <div className="palette-popup-head">
        <b>{kind === 'side' ? '입력 패널' : '생성 큐'}</b>
        <button className="icon-button" title="닫기" aria-label="닫기" onClick={props.close}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {kind === 'side' ? (
        <div className="palette-popup-body" ref={setPanelPopup} />
      ) : (
        <div className="palette-popup-body queue-panel">
          <QueueJobs />
        </div>
      )}
    </div>
  );
}
