import type { ReactNode } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { useLayout } from '../layout';
import { projectMedia } from '../store';
import { Icon } from './Icon';
import { showResultMenu, type ResultAction } from './resultMenu';
import type { ResultBrowser } from './useResultBrowser';

/** 목록을 접으면 막대도 숨긴다. */
export function Filmstrip(props: {
  projectId: string;
  records: GenerationSummary[];
  browser: ResultBrowser;
  menu: (record: GenerationSummary) => ResultAction[];
  favoriteId?: string;
  onOpen?: () => void;
  tools?: ReactNode;
}) {
  const collapsed = useLayout((state) => state.filmstripCollapsed);
  const { records, browser } = props;
  const { selected, picking } = browser;
  if (!records.length || collapsed) return null;
  return (
    <>
      <div
        className="filmstrip selectable"
        role="listbox"
        aria-label="생성 기록"
        aria-multiselectable
        {...picking.containerProps}
      >
        {records.map((record) => (
          <button
            key={record.id}
            role="option"
            data-select-id={record.id}
            aria-selected={record.id === selected?.id}
            className={`${record.id === selected?.id ? 'selected' : ''} ${picking.isSelected(record.id) ? 'picked' : ''}`}
            onClick={(event) => {
              if (picking.clickItem(event, record.id)) return;
              browser.setSelectedId(record.id);
              props.onOpen?.();
            }}
            onContextMenu={(event) => {
              browser.setSelectedId(record.id);
              showResultMenu(event, props.menu(record));
            }}
            title={`seed ${record.seed} · ${new Date(record.createdAt).toLocaleString()}`}
          >
            <img
              src={projectMedia(props.projectId, record.thumbFile ?? record.file)}
              alt=""
              loading="lazy"
            />
            {record.id === props.favoriteId && <span className="card-favorite">★</span>}
          </button>
        ))}
        {picking.boxElement}
      </div>
      <div className="filmstrip-bar">
        {picking.selected.size > 0 ? (
          <>
            <span>{picking.selected.size}장 선택</span>
            <button
              className="with-icon danger-quiet"
              onClick={() => browser.removeMany([...picking.selected])}
            >
              <Icon name="trash" size={14} /> 삭제
            </button>
            <button className="link-button" onClick={picking.clear}>
              선택 취소
            </button>
          </>
        ) : (
          <span className="hint">결과 {records.length}장</span>
        )}
        {props.tools}
      </div>
    </>
  );
}
