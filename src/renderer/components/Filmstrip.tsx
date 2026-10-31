import type { ReactNode } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { useLayout } from '../layout';
import { projectMedia } from '../store';
import { Icon } from './Icon';
import { showResultMenu, type ResultAction } from './resultMenu';
import type { ResultBrowser } from './useResultBrowser';

/** 목록을 접으면 막대도 숨긴다. `strip`이 false면(모아 보기) 접기와 상관없이 막대만 보인다. */
export function Filmstrip(props: {
  projectId: string;
  records: GenerationSummary[];
  browser: ResultBrowser;
  menu: (record: GenerationSummary) => ResultAction[];
  favoriteId?: string;
  onOpen?: () => void;
  tools?: ReactNode;
  strip?: boolean;
}) {
  const collapsed = useLayout((state) => state.filmstripCollapsed);
  const { records, browser } = props;
  const { picking } = browser;
  const strip = props.strip ?? true;
  if (!records.length || (strip && collapsed)) return null;
  return (
    <>
      {strip && (
        <div
          className="filmstrip selectable"
          role="listbox"
          aria-label="생성 기록"
          aria-multiselectable
          {...picking.containerProps}
        >
          {records.map((record) => (
            <ResultOption
              key={record.id}
              record={record}
              browser={browser}
              menu={props.menu}
              favorite={record.id === props.favoriteId}
              onOpen={props.onOpen}
            >
              <img
                src={projectMedia(props.projectId, record.thumbFile ?? record.file)}
                alt=""
                loading="lazy"
              />
            </ResultOption>
          ))}
          {picking.boxElement}
        </div>
      )}
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

/** 필름스트립과 모아 보기의 결과 한 칸. `children`은 이미지. */
export function ResultOption(props: {
  record: GenerationSummary;
  browser: ResultBrowser;
  menu: (record: GenerationSummary) => ResultAction[];
  favorite: boolean;
  onOpen?: () => void;
  onDoubleClick?: () => void;
  children: ReactNode;
}) {
  const { record, browser } = props;
  const { selected, picking } = browser;
  return (
    <button
      role="option"
      data-select-id={record.id}
      aria-selected={record.id === selected?.id}
      className={`${record.id === selected?.id ? 'selected' : ''} ${picking.isSelected(record.id) ? 'picked' : ''}`}
      onClick={(event) => {
        if (picking.clickItem(event, record.id)) return;
        browser.setSelectedId(record.id);
        props.onOpen?.();
      }}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={(event) => {
        browser.setSelectedId(record.id);
        showResultMenu(event, props.menu(record));
      }}
      title={`seed ${record.seed} · ${new Date(record.createdAt).toLocaleString()}`}
    >
      {props.children}
      {props.favorite && <span className="card-favorite">★</span>}
    </button>
  );
}
