import { useState } from 'react';
import type { QueueJobView } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { FREE_PROJECT_ID } from '../../core/model/defaults';
import { queueBarShownOf, useLayout } from '../layout';
import { openEmotion, openFree, openProject, useStore } from '../store';
import { queueCommands, STATUS, summarizeQueue } from '../queueSummary';
import { BottomSlotTarget } from './BottomSlot';
import { StreamPreview } from './StreamPreview';

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

export function QueueBar() {
  const shown = useLayout(queueBarShownOf);
  return shown ? <QueueBarContent /> : null;
}

function QueueBarContent() {
  const queue = useStore((state) => state.queue);
  const [open, setOpen] = useState(false);

  const { active, current, failed, finished, status } = summarizeQueue(queue);

  return (
    <footer className={`queue-bar ${open ? 'open' : ''}`}>
      {open && (
        <div className="queue-panel">
          <QueueJobs />
        </div>
      )}
      <div className="queue-summary">
        <button className="queue-toggle" onClick={() => setOpen((value) => !value)}>
          {open ? '▼' : '▲'} 생성 큐
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
            <button onClick={() => void queueCommands.resume()}>재개</button>
          ) : (
            <button className="pause-solid" onClick={() => void queueCommands.pause()}>
              일시 중지
            </button>
          ))}
        {active.length > 0 && (
          <button className="danger-solid" onClick={() => void queueCommands.cancelAll()}>
            모두 취소
          </button>
        )}
        {failed > 0 && (
          <button onClick={() => void queueCommands.retryFailed()}>실패 재시도</button>
        )}
        {finished > 0 && !active.length && (
          <button className="link-button" onClick={() => void queueCommands.clearFinished()}>
            기록 정리
          </button>
        )}
        <BottomSlotTarget />
      </div>
    </footer>
  );
}
