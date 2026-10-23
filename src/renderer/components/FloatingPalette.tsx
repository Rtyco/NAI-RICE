import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { readUiState, saveUiState, toggleSidePanel, useStore } from '../store';
import { Icon } from './Icon';

// 패널을 숨긴 화면이 꼭 필요한 버튼(생성 등)을 여기에 띄운다. 띄운 것이 없으면 창도 없다.
let target: HTMLElement | null = null;
let slots = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

function setTarget(node: HTMLElement | null) {
  target = node;
  notify();
}

export function PaletteSlot({ children }: { children: ReactNode }) {
  const node = useSyncExternalStore(subscribe, () => target);
  useEffect(() => {
    slots += 1;
    notify();
    return () => {
      slots -= 1;
      notify();
    };
  }, []);
  return node ? createPortal(children, node) : null;
}

const POSITION_KEY = 'palette-position';

/** 창 크기에 대한 가운데 위치(0~1)라 창 크기가 바뀌어도 비슷한 자리에 있다. */
type Position = { x: number; y: number };

const DEFAULT_POSITION: Position = { x: 0.5, y: 0.9 };

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

/** 글자 없이 아이콘만 둔다. 무슨 버튼인지는 마우스를 올리면 나온다. */
export function FloatingPalette() {
  const count = useSyncExternalStore(subscribe, () => slots);
  return count ? <Palette /> : null;
}

function Palette() {
  const sideHidden = useStore((state) => state.sidePanelCollapsed);
  const [position, setPosition] = useState(readPosition);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
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

  // 위 줄(창 버튼)에 걸치지 않게 위쪽은 48px를 비운다.
  const left = Math.min(
    Math.max(8, position.x * width - boxSize.width / 2),
    width - boxSize.width - 8,
  );
  const top = Math.min(
    Math.max(48, position.y * height - boxSize.height / 2),
    height - boxSize.height - 8,
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
      <div className="palette-slot" ref={setTarget} />
      {sideHidden && (
        <button
          className="palette-button"
          title="입력 패널 보이기"
          aria-label="입력 패널 보이기"
          onClick={toggleSidePanel}
        >
          <Icon name="sliders" size={16} />
        </button>
      )}
    </div>
  );
}
