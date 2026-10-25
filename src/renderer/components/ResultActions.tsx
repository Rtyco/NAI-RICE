import { Fragment } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';
import { Icon } from './Icon';
import { RecordInfo } from './RecordInfo';
import { resultGroups, type ResultAction } from './resultMenu';

/** 같은 목록을 `showResultMenu`도 쓴다. */
export function ResultBar(props: {
  projectId: string;
  record: GenerationSummary;
  actions: ResultAction[];
}) {
  const { record } = props;
  return (
    <div className="result-bar" role="toolbar" aria-label="선택한 결과">
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
      {resultGroups(props.actions).map((group) => (
        <Fragment key={group[0].group}>
          {group[0].group === 'file' ? (
            <span className="header-spacer" />
          ) : (
            group[0].group !== 'delete' && <span className="zone-divider" />
          )}
          {group.map((action) => (
            <button
              key={action.label}
              className={`${action.iconOnly ? 'icon-button' : 'with-icon'} ${action.keepLabel ? 'keep-label' : ''} ${action.group === 'delete' ? 'danger-quiet' : action.active ? 'active' : ''}`}
              disabled={action.disabled}
              title={action.title ?? action.label}
              aria-label={action.label}
              onClick={action.onSelect}
            >
              <Icon name={action.icon} size={14} className={action.active ? 'filled' : ''} />
              {!action.iconOnly && <span className="result-label">{action.label}</span>}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
