import { Fragment, useRef, type MouseEvent } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { showContextMenu } from './contextMenuStore';
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';
import { Icon } from './Icon';
import { RecordInfo } from './RecordInfo';
import { resultGroups, resultMenuItem, resultTitle, type ResultAction } from './resultMenu';
import { fitLevel, useResultBarFit } from './useHeaderFit';

/** 글자를 빼고 줄인 뒤의 단계부터 `fold` 순서로 하나씩 접는다(scene-detail.css). */
const FOLD_AFTER = 3;

/** 같은 목록을 `showResultMenu`도 쓴다. */
export function ResultBar(props: {
  projectId: string;
  record: GenerationSummary;
  actions: ResultAction[];
}) {
  const { record } = props;
  const actions = props.actions.filter((action) => !action.menuOnly);
  const bar = useRef<HTMLDivElement>(null);
  useResultBarFit(bar);
  const showFolded = (event: MouseEvent) => {
    const level = fitLevel(bar.current);
    showContextMenu(
      event,
      actions
        .filter((action) => action.fold && action.fold <= level - FOLD_AFTER)
        .map(resultMenuItem),
    );
  };
  const button = (action: ResultAction) => (
    <button
      key={action.label}
      className={`${action.iconOnly ? 'icon-button' : 'with-icon'} ${action.keepLabel ? 'keep-label' : ''} ${action.group === 'delete' ? 'danger-quiet' : action.active ? 'active' : ''}`}
      disabled={action.disabled}
      title={resultTitle(action)}
      aria-label={action.label}
      data-fold={action.fold}
      onClick={action.onSelect}
    >
      <Icon name={action.icon} size={14} className={action.active ? 'filled' : ''} />
      {!action.iconOnly && <span className="result-label">{action.label}</span>}
    </button>
  );
  return (
    <div ref={bar} className="result-bar" role="toolbar" aria-label="선택한 결과">
      <button
        className="icon-button"
        title={`생성 정보 · seed ${record.seed}`}
        aria-label="생성 정보"
        onClick={() =>
          void openDialog((close) => (
            <Modal title={`생성 정보 · seed ${record.seed}`} onClose={close} wide>
              <RecordInfo projectId={props.projectId} record={record} />
            </Modal>
          ))
        }
      >
        <Icon name="info" size={14} />
      </button>
      {resultGroups(actions).map((group) => (
        <Fragment key={group[0].group}>
          {group[0].group === 'file' ? (
            <>
              <button
                className="icon-button result-more"
                title="더 보기"
                aria-label="더 보기"
                onClick={showFolded}
              >
                ⋯
              </button>
              <span className="header-spacer" />
            </>
          ) : (
            group[0].group !== 'delete' && <span className="zone-divider" />
          )}
          {group.map(button)}
        </Fragment>
      ))}
    </div>
  );
}
