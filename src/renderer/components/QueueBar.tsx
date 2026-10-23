import { useState } from 'react';
import type { QueueJobView } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { FREE_PROJECT_ID } from '../../core/model/defaults';
import { openEmotion, openFree, openProject, useStore } from '../store';
import { queueApi } from '../desktop';
import { queueAction, STATUS, summarizeQueue } from '../queueSummary';
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

export function QueueBar() {
  const queue = useStore((state) => state.queue);
  const [open, setOpen] = useState(false);
  const api = queueApi();

  const { active, current, failed, finished, status } = summarizeQueue(queue);

  return (
    <footer className={`queue-bar ${open ? 'open' : ''}`}>
      {open && (
        <div className="queue-panel">
          {queue.jobs.length ? (
            queue.jobs
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
                      onClick={() =>
                        void queueAction('작업을 취소하는 중', () => api.cancelQueue(job.id))
                      }
                    >
                      취소
                    </button>
                  )}
                </article>
              ))
          ) : (
            <p className="hint">큐가 비어 있습니다.</p>
          )}
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
            <button onClick={() => void queueAction('큐를 재개하는 중', () => api.resumeQueue())}>
              재개
            </button>
          ) : (
            <button
              className="pause-solid"
              onClick={() => void queueAction('큐를 일시 중지하는 중', () => api.pauseQueue())}
            >
              일시 중지
            </button>
          ))}
        {active.length > 0 && (
          <button
            className="danger-solid"
            onClick={() => void queueAction('모두 취소하는 중', () => api.cancelQueue())}
          >
            모두 취소
          </button>
        )}
        {failed > 0 && (
          <button onClick={() => void queueAction('재시도를 등록하는 중', () => api.retryFailed())}>
            실패 재시도
          </button>
        )}
        {finished > 0 && !active.length && (
          <button
            className="link-button"
            onClick={() => void queueAction('정리하는 중', () => api.clearFinished())}
          >
            기록 정리
          </button>
        )}
        <BottomSlotTarget />
      </div>
    </footer>
  );
}
