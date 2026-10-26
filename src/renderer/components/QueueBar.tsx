import { useRef, useState } from 'react';
import type { QueueJobView } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { FREE_PROJECT_ID } from '../../core/model/defaults';
import { queueBarShownOf, useLayout } from '../layout';
import { openEmotion, openFree, openProject, useStore } from '../store';
import { queueCommands, STATUS, summarizeQueue } from '../queueSummary';
import { BottomSlotTarget } from './BottomSlot';
import { Icon, type IconName } from './Icon';
import { StreamPreview } from './StreamPreview';
import { useQueueBarFit } from './useHeaderFit';

function anlasText(job: QueueJobView): string {
  const estimate = job.anlasEstimate;
  if (job.anlasSpent === undefined)
    return estimate === undefined ? '' : ` · 예상 ${estimate ? `약 ${estimate}` : '0'} Anlas`;
  const spent = job.anlasSpent ? `-${job.anlasSpent}` : '0';
  const expected =
    estimate !== undefined && (job.anlasSpent || estimate) ? ` (예상 ${estimate})` : '';
  return ` · Anlas ${spent}${expected}`;
}

/** 막대를 숨기면 떠 있는 창의 팝업에서도 쓴다. */
export function QueueJobs() {
  const jobs = useStore((state) => state.queue.jobs);
  return jobs.length ? (
    jobs
      .slice()
      .reverse()
      .map((job) => (
        <article className={`queue-item ${job.status}`} key={job.id}>
          <span className="state-badge">{STATUS[job.status] ?? job.status}</span>
          <button
            className="queue-target"
            onClick={() => {
              if (job.projectId === FREE_PROJECT_ID) return openFree();
              openProject(job.projectId);
              openEmotion(job.emotionId);
            }}
          >
            <b>{[job.projectName, job.emotionName].filter(Boolean).join(' · ')}</b>
            <small>
              v{job.variantIndex} · seed {job.seed} · 시도 {job.attempts}/{job.maxAttempts}
              {anlasText(job)}
            </small>
          </button>
          {job.error && <p>{job.error}</p>}
          {isActive(job.status) && (
            <button
              className="link-button danger"
              onClick={() => void queueCommands.cancel(job.id)}
            >
              취소
            </button>
          )}
        </article>
      ))
  ) : (
    <p className="hint">큐가 비어 있습니다.</p>
  );
}

/** 막대가 좁으면 글자를 숨기고 아이콘만 남는다(.slot-icon-button). */
function QueueAction(props: {
  icon: IconName;
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`slot-icon-button ${props.className ?? ''}`}
      title={props.label}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size={15} />
      <span>{props.label}</span>
    </button>
  );
}

export function QueueBar() {
  const shown = useLayout(queueBarShownOf);
  return shown ? <QueueBarContent /> : null;
}

function QueueBarContent() {
  const queue = useStore((state) => state.queue);
  const [open, setOpen] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  useQueueBarFit(summary);

  const { active, current, failed, finished, status } = summarizeQueue(queue);

  return (
    <footer className={`queue-bar ${open ? 'open' : ''}`}>
      {open && (
        <div className="queue-panel">
          <QueueJobs />
        </div>
      )}
      <div ref={summary} className="queue-summary">
        <button className="queue-toggle" onClick={() => setOpen((value) => !value)}>
          {open ? '▼' : '▲'} <span className="queue-label">생성 큐</span>
        </button>
        {current && <StreamPreview jobIds={[current.id]} className="queue-preview" />}
        <span className="queue-status">
          {status}
          {active.length > 0 && <b> · 남은 작업 {active.length}</b>}
          {failed > 0 && <b className="error-text"> · 실패 {failed}</b>}
        </span>
        <div className="header-spacer" />
        {active.length > 0 &&
          (queue.paused ? (
            <QueueAction icon="resume" label="재개" onClick={() => void queueCommands.resume()} />
          ) : (
            <QueueAction
              icon="pause"
              label="일시 중지"
              className="pause-solid"
              onClick={() => void queueCommands.pause()}
            />
          ))}
        {active.length > 0 && (
          <QueueAction
            icon="close"
            label="모두 취소"
            className="danger-solid"
            onClick={() => void queueCommands.cancelAll()}
          />
        )}
        {failed > 0 && (
          <QueueAction
            icon="refresh"
            label="실패 재시도"
            onClick={() => void queueCommands.retryFailed()}
          />
        )}
        {finished > 0 && !active.length && (
          <QueueAction
            icon="clear-list"
            label="기록 정리"
            className="link-button"
            onClick={() => void queueCommands.clearFinished()}
          />
        )}
        <BottomSlotTarget />
      </div>
    </footer>
  );
}
