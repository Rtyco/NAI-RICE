import { Component, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ErrorInfo, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { create } from 'zustand';

export type MenuItem =
  | { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | 'divider';

const useContextMenu = create<{ x: number; y: number; items: MenuItem[] } | null>(() => null);

/** 마우스 위치에 메뉴를 띄운다. 우클릭(onContextMenu)과 ⋯ 버튼이 함께 쓴다. */
export function showContextMenu(event: ReactMouseEvent, items: MenuItem[]): void {
  event.preventDefault();
  event.stopPropagation();
  useContextMenu.setState({ x: event.clientX, y: event.clientY, items }, true);
}

export function closeContextMenu(): void {
  useContextMenu.setState(null, true);
}

export function ContextMenuHost() {
  const menu = useContextMenu();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.min(menu.x, window.innerWidth - width - 8),
      top: Math.min(menu.y, window.innerHeight - height - 8),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
      if (event.type === 'mousedown' && ref.current?.contains(event.target as Node)) return;
      closeContextMenu();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div className="menu-popup context-menu" ref={ref} style={position} role="menu">
      {menu.items.map((item, index) =>
        item === 'divider' ? (
          <hr key={`divider-${index}`} />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            className={item.danger ? 'danger' : ''}
            disabled={item.disabled}
            onClick={() => {
              closeContextMenu();
              item.onSelect();
            }}
          >
            <span>{item.label}</span>
            {item.hint && <small>{item.hint}</small>}
          </button>
        ),
      )}
    </div>
  );
}

/** 화면 일부에서 오류가 나도 앱 전체가 멈추지 않도록 감싼다. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state">
        <h2>화면을 표시하는 중 오류가 발생했습니다</h2>
        <pre className="prompt-code">{this.state.error.message}</pre>
        <button className="accent" onClick={() => this.setState({ error: undefined })}>
          다시 시도
        </button>
      </div>
    );
  }
}
