import { useEffect, useRef, useState } from 'react';
import type { Emotion } from '../../core/domain/types';
import { matchesScene } from '../sceneSearch';
import { openEmotion } from '../store';
import { SceneSearch } from './SceneSearch';

/** 씬 상세의 「n / m」. 누르면 씬 목록을 띄워 갤러리로 나가지 않고 갈아탄다. */
export function ScenePicker({
  emotions,
  current,
  title,
}: {
  /** 이전·다음과 같은 순서(갤러리 검색 결과) */
  emotions: Emotion[];
  current: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const index = emotions.findIndex((emotion) => emotion.id === current);
  const shown = emotions.filter((emotion) => matchesScene(emotion, filter));

  useEffect(() => {
    if (!open) return;
    // scrollIntoView는 바깥 화면까지 움직인다.
    const list = ref.current?.querySelector<HTMLElement>('.scene-picker-list');
    const item = list?.querySelector<HTMLElement>('.current');
    if (list && item) list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    setFilter('');
    openEmotion(id);
  };

  return (
    <div className="menu scene-picker" ref={ref}>
      <button
        className="detail-position"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {index + 1} / {emotions.length}
      </button>
      {open && (
        <div className="menu-popup scene-picker-popup">
          <SceneSearch
            value={filter}
            found={shown.length}
            total={emotions.length}
            autoFocus
            onChange={setFilter}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (shown[0]) go(shown[0].id);
              } else if (event.key === 'Escape') setOpen(false);
              else return;
              event.preventDefault();
              event.stopPropagation();
            }}
          />
          <div className="scene-picker-list" role="listbox" aria-label="씬 목록">
            {shown.map((emotion) => (
              <button
                key={emotion.id}
                role="option"
                aria-selected={emotion.id === current}
                className={emotion.id === current ? 'current' : ''}
                onClick={() => go(emotion.id)}
              >
                <small>{emotions.indexOf(emotion) + 1}</small>
                <span>{emotion.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
