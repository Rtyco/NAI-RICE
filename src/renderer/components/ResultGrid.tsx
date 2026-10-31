import { useEffect, type CSSProperties } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { projectMedia, RESULT_GRID_COLUMN_CHOICES, setResultGridColumns, useStore } from '../store';
import { isTypingTarget } from '../useShortcut';
import { Icon } from './Icon';
import { ResultOption } from './Filmstrip';
import type { ResultAction } from './resultMenu';
import { StreamPreview } from './StreamPreview';
import type { ResultBrowser } from './useResultBrowser';

/** 썸네일 대신 원본 파일을 잘리지 않게 띄운다. 칸 비율은 최신 결과를 따른다. */
export function ResultGrid(props: {
  projectId: string;
  records: GenerationSummary[];
  browser: ResultBrowser;
  menu: (record: GenerationSummary) => ResultAction[];
  favoriteId?: string;
  running: string[];
  pending: number;
  onSingle: () => void;
}) {
  const columns = useStore((state) => state.resultGridColumns);
  const { records, browser, onSingle } = props;
  const { selected, picking } = browser;
  const selectedId = selected?.id;
  const gridRef = picking.containerProps.ref;

  useEffect(() => {
    if (!selectedId) return;
    gridRef.current
      ?.querySelector(`[data-select-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, gridRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (isTypingTarget(target)) return;
      if (document.querySelector('.modal-backdrop')) return;
      const position = records.findIndex((record) => record.id === selectedId);
      const step = event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : 0;
      if (step && position >= 0 && records[position + step]) {
        event.preventDefault();
        browser.setSelectedId(records[position + step].id);
      }
      if (event.key === 'Enter' && selectedId && !target.closest('button:not([data-select-id])')) {
        event.preventDefault();
        onSingle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const newest = records[0];
  return (
    <div className="result-grid-stage">
      <div
        className="result-grid selectable"
        role="listbox"
        aria-label="생성 기록"
        aria-multiselectable
        style={
          {
            '--result-columns': columns,
            '--result-aspect': newest && `${newest.width} / ${newest.height}`,
          } as CSSProperties
        }
        {...picking.containerProps}
      >
        {props.pending > 0 && (
          <div className="result-grid-pending">
            <StreamPreview jobIds={props.running} />
            <span className="card-status busy stage-status">생성 대기 {props.pending}</span>
          </div>
        )}
        {records.map((record) => (
          <ResultOption
            key={record.id}
            record={record}
            browser={browser}
            menu={props.menu}
            favorite={record.id === props.favoriteId}
            onDoubleClick={() => {
              browser.setSelectedId(record.id);
              onSingle();
            }}
          >
            <img
              src={projectMedia(props.projectId, record.file)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </ResultOption>
        ))}
        {picking.boxElement}
      </div>
      <div className="zoom-toolbar">
        <span className="segmented" role="group" aria-label="한 줄에 보일 이미지 수">
          {RESULT_GRID_COLUMN_CHOICES.map((choice) => (
            <button
              key={choice}
              className={choice === columns ? 'active' : ''}
              aria-pressed={choice === columns}
              title={`한 줄에 ${choice}장`}
              onClick={() => setResultGridColumns(choice)}
            >
              {choice}
            </button>
          ))}
        </span>
        <button
          className="icon-button active"
          title="한 장씩 보기 (G)"
          aria-pressed
          onClick={onSingle}
        >
          <Icon name="grid" size={16} />
        </button>
      </div>
    </div>
  );
}
