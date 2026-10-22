import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { closeContextMenu, useContextMenu } from './contextMenuStore';

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
        ) : 'heading' in item ? (
          <div key={`heading-${index}`} className="menu-heading" role="presentation">
            {item.heading}
          </div>
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
