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
    const before = document.activeElement;
    const close = (event: Event) => {
      if (event.type === 'pointerdown' && ref.current?.contains(event.target as Node)) return;
      closeContextMenu();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
      // 방향키로 옮겨 간 포커스가 메뉴와 함께 사라지면 메뉴를 열기 전 자리로 돌려놓는다.
      if (document.activeElement === document.body && before instanceof HTMLElement)
        before.focus({ preventScroll: true });
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
        ) : 'swatches' in item ? (
          <div key={`swatches-${index}`} className="menu-swatches" role="group">
            {item.swatches.map((swatch) => (
              <button
                key={swatch.id}
                role="menuitemradio"
                aria-checked={swatch.active}
                className={`swatch ${swatch.className ?? ''} ${swatch.active ? 'active' : ''}`}
                style={swatch.color ? { background: swatch.color } : undefined}
                title={swatch.label}
                aria-label={swatch.label}
                onClick={() => {
                  closeContextMenu();
                  item.onPick(swatch.id);
                }}
              />
            ))}
          </div>
        ) : (
          <button
            key={item.label}
            role="menuitem"
            className={item.danger ? 'danger' : ''}
            disabled={item.disabled}
            data-access-key={item.accessKey}
            aria-keyshortcuts={item.accessKey}
            onClick={() => {
              closeContextMenu();
              item.onSelect();
            }}
          >
            <span>
              {item.label}
              {item.accessKey && `(${item.accessKey})`}
            </span>
            {item.hint && <small>{item.hint}</small>}
          </button>
        ),
      )}
    </div>
  );
}
