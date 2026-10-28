import { Fragment, useRef, type MouseEvent } from 'react';
import type { GenerationSummary } from '../../core/domain/types';
import { showContextMenu } from './contextMenuStore';
import { Modal } from './Dialogs';
import { openDialog } from './dialogStack';
import { Icon } from './Icon';
import { RecordInfo } from './RecordInfo';
import { resultGroups, type ResultAction } from './resultMenu';
import { useResultBarFit } from './useHeaderFit';

/** 같은 목록을 `showResultMenu`도 쓴다. */
export function ResultBar(props: {
  projectId: string;
  record: GenerationSummary;
  actions: ResultAction[];
}) {
  const { record } = props;
  const bar = useRef<HTMLDivElement>(null);
  useResultBarFit(bar);
  const send = props.actions.filter((action) => action.group === 'send');
  // .fit-2부터 단계마다 보내기 묶음 끝의 버튼 하나가 접힌다(scene-detail.css).
  const showFolded = (event: MouseEvent) => {
    const level = [...(bar.current?.classList ?? [])].filter((name) =>
      name.startsWith('fit-'),
    ).length;
    const folded = Math.min(send.length, Math.max(0, level - 1));
    showContextMenu(
      event,
      send.slice(send.length - folded).map(({ label, onSelect, disabled }) => ({
        label,
        onSelect,
        disabled,
      })),
    );
  };
  const button = (action: ResultAction) => (
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
      {resultGroups(props.actions).map((group) => (
        <Fragment key={group[0].group}>
          {group[0].group === 'file' ? (
            <span className="header-spacer" />
          ) : (
            group[0].group !== 'delete' && <span className="zone-divider" />
          )}
          {group[0].group === 'send' ? (
            <>
              <span className="result-send">{group.map(button)}</span>
              <button
                className="icon-button result-more"
                title="더 보기"
                aria-label="더 보기"
                onClick={showFolded}
              >
                ⋯
              </button>
            </>
          ) : (
            group.map(button)
          )}
        </Fragment>
      ))}
    </div>
  );
}
