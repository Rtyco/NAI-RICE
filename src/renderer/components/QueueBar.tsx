import { useState } from 'react';
import type { QueueView } from '../../core/domain/types';
import { openEmotion, openProject, run, useStore } from '../store';
import { queueApi } from '../desktop';

const STATUS: Record<string, string> = {
  queued: '대기',
  generating: '생성 중',
  retry_wait: '재시도 대기',
  completed: '완료',
  failed: '실패',
  cancelled: '취소',
  interrupted: '중단',
};

function queueAction(label: string, action: () => Promise<QueueView>) {
  return run(label, async () => useStore.setState({ queue: await action() }));
}

export function QueueBar() {
  const queue = useStore((state) => state.queue);
  const [open, setOpen] = useState(false);
  const api = queueApi();

  const active = queue.jobs.filter((job) =>
    ['queued', 'generating', 'retry_wait'].includes(job.status),
  );
  const current = queue.jobs.find(
    (job) => job.status === 'generating' || job.status === 'retry_wait',
  );
  const failed = queue.jobs.filter(
    (job) => job.status === 'failed' || job.status === 'interrupted',
  ).length;
  const finished = queue.jobs.filter(
    (job) => !['queued', 'generating', 'retry_wait'].includes(job.status),
  ).length;

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
                      openProject(job.projectId);
                      openEmotion(job.emotionId);
                    }}
                  >
                    <b>
                      {job.projectName} · {job.emotionName}
                    </b>
                    <small>
                      v{job.variantIndex} · seed {job.seed} · 시도 {job.attempts}/{job.maxAttempts}
                      {job.anlasSpent !== undefined &&
                        ` · Anlas ${job.anlasSpent ? `-${job.anlasSpent}` : '0 (무료)'}`}
                    </small>
                  </button>
                  {job.error && <p>{job.error}</p>}
                  {['queued', 'generating', 'retry_wait'].includes(job.status) && (
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
        <span className="queue-status">
          {current
            ? `${STATUS[current.status]}: ${current.projectName} · ${current.emotionName}`
            : queue.paused && active.length
              ? '일시 중지됨'
              : active.length
                ? '대기 중'
                : '유휴'}
          {active.length > 0 && <b> · 남은 작업 {active.length}</b>}
          {failed > 0 && <b className="error-text"> · 실패 {failed}</b>}
        </span>
        <div className="header-spacer" />
        {/* 지금 쓸 수 있는 버튼만 보여 준다. 생성 중이 아닐 때는 막대가 비어 있다. */}
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
      </div>
    </footer>
  );
}
