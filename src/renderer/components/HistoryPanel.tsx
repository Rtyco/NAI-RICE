import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { GenerationSummary } from '../../core/domain/types';
import { isActive } from '../../core/jobs/JobLifecycle';
import { FREE_PROJECT_ID } from '../../core/model/defaults';
import { libraryApi } from '../desktop';
import { deleteResults } from '../generationOps';
import {
  openEmotion,
  projectMedia,
  requestResult,
  run,
  toast,
  toggleHistory,
  useStore,
} from '../store';
import { Icon } from './Icon';
import { showResultMenu } from './ResultActions';
import { StreamPreview } from './StreamPreview';

const NO_RECORDS: GenerationSummary[] = [];
// 결과가 수천 장이어도 처음 그리기가 무겁지 않게 나눠 붙인다.
const PAGE = 120;

function describe(record: GenerationSummary): string {
  return [
    record.emotionName,
    record.kind === 'augment' ? '디렉터 툴' : `seed ${record.seed}`,
    new Date(record.createdAt).toLocaleString(),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** NovelAI 웹의 History처럼 화면 오른쪽 끝에 최신 결과부터 세로로 쌓는다. */
export function HistoryPanel({ projectId }: { projectId: string }) {
  const collapsed = useStore((state) => state.historyCollapsed);
  const allRecords = useStore((state) => state.generations[projectId]) ?? NO_RECORDS;
  const shownId = useStore((state) =>
    state.shownResult?.projectId === projectId ? state.shownResult.id : undefined,
  );
  const favorites = useStore(
    useShallow((state) =>
      Object.values(
        state.library?.projects.find((project) => project.id === projectId)?.favorites ?? {},
      ),
    ),
  );
  const running = useStore(
    useShallow((state) =>
      state.queue.jobs
        .filter((job) => job.projectId === projectId && job.status === 'generating')
        .map((job) => job.id),
    ),
  );
  const waiting = useStore(
    (state) =>
      state.queue.jobs.filter((job) => job.projectId === projectId && isActive(job.status)).length,
  );
  const records = useMemo(
    () => [...allRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allRecords],
  );
  const [limit, setLimit] = useState(PAGE);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector('.history-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [shownId]);

  const open = (record: GenerationSummary) => {
    requestResult(projectId, record.id);
    if (projectId === FREE_PROJECT_ID) return;
    const { library, detailEmotionId } = useStore.getState();
    const project = library?.projects.find((item) => item.id === projectId);
    const emotions =
      library?.emotionSets.find((set) => set.id === project?.emotionSetId)?.emotions ?? [];
    if (!emotions.some((emotion) => emotion.id === record.emotionId)) {
      useStore.setState({ resultRequest: undefined });
      toast(`「${record.emotionName}」 씬이 지금 씬 모음에 없어 열 수 없습니다.`);
      return;
    }
    if (detailEmotionId !== record.emotionId) openEmotion(record.emotionId);
  };

  const menu = (event: MouseEvent, record: GenerationSummary) =>
    showResultMenu(event, [
      { label: '보기', icon: 'images', group: 'main', onSelect: () => open(record) },
      {
        label: '폴더에서 보기',
        icon: 'folder',
        group: 'file',
        onSelect: () =>
          void run('폴더를 여는 중', () => libraryApi().showGeneration(projectId, record.id)),
      },
      {
        label: '이 결과 삭제',
        icon: 'trash',
        group: 'delete',
        onSelect: () => void deleteResults(projectId, [record]),
      },
    ]);

  return (
    <aside className={`history-panel ${collapsed ? 'collapsed' : ''}`} aria-label="히스토리">
      <div className="history-head">
        {!collapsed && (
          <b>
            히스토리 <small>{records.length}</small>
          </b>
        )}
        <button
          className="icon-button"
          title={collapsed ? '히스토리 펴기 (Ctrl+H)' : '히스토리 접기 (Ctrl+H)'}
          aria-label={collapsed ? '히스토리 펴기' : '히스토리 접기'}
          aria-expanded={!collapsed}
          onClick={toggleHistory}
        >
          <Icon name="filmstrip" size={16} />
        </button>
      </div>
      {!collapsed && (
        <div className="history-list" ref={list}>
          {running.length > 0 && <StreamPreview jobIds={running} className="history-live" />}
          {waiting > 0 && <span className="history-waiting">생성 대기 {waiting}</span>}
          {records.slice(0, limit).map((record) => (
            <button
              key={record.id}
              className={`history-item ${record.id === shownId ? 'selected' : ''}`}
              style={{ aspectRatio: `${record.width} / ${record.height}` }}
              title={describe(record)}
              onClick={() => open(record)}
              onContextMenu={(event) => menu(event, record)}
            >
              <img
                src={projectMedia(projectId, record.thumbFile ?? record.file)}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              {favorites.includes(record.id) && <span className="card-favorite">★</span>}
            </button>
          ))}
          {records.length > limit && (
            <button className="link-button history-more" onClick={() => setLimit(limit + PAGE)}>
              더 보기 ({records.length - limit}장)
            </button>
          )}
          {!records.length && !waiting && <p className="hint">결과가 없습니다</p>}
        </div>
      )}
    </aside>
  );
}
