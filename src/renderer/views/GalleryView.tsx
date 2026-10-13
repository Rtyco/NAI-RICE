import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Emotion, EmotionSet, GenerationSummary, QueueJobView } from '../../core/domain/types';
import { hasScenePrompt, type ResolvedProject } from '../../core/model/defaults';
import { moveEmotions } from '../../core/model/mutations';
import { generateEmotions } from '../actions';
import { showContextMenu } from '../components/ContextMenu';
import { openDialog } from '../components/Dialogs';
import { BottomSlot } from '../components/BottomSlot';
import { ExportDialog } from '../components/ExportDialog';
import { useShortcut } from '../useShortcut';
import { EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';
import { useBoxSelection } from '../components/useBoxSelection';
import {
  dragPayload,
  readDragPayload,
  writeDragPayload,
  type DragPayload,
} from '../components/listDrag';
import { addEmotionTo, deleteEmotions, emotionMenu, updateEmotionSet } from '../emotionOps';
import { clearEmotionResults, openDirectorToolDialog, openImg2ImgDialog } from '../generationOps';
import {
  coverRecord,
  GALLERY_ASPECTS,
  GALLERY_COLUMN_CHOICES,
  openEmotion,
  openLibrary,
  projectMedia,
  setGalleryAspect,
  setGalleryColumns,
  updateProject,
  useStore,
} from '../store';
import { StreamPreview } from '../components/StreamPreview';

function jobState(jobs: QueueJobView[]): { label: string; tone: string } | null {
  if (jobs.some((job) => job.status === 'generating')) return { label: '생성 중', tone: 'busy' };
  if (jobs.some((job) => job.status === 'retry_wait'))
    return { label: '재시도 대기', tone: 'warn' };
  const queued = jobs.filter((job) => job.status === 'queued').length;
  if (queued) return { label: `대기 ${queued}`, tone: 'muted' };
  if (jobs.at(-1)?.status === 'failed') return { label: '실패', tone: 'error' };
  return null;
}

const DRAG_TYPE = 'application/x-emotion';
const NO_RECORDS: GenerationSummary[] = [];
const NO_JOBS: QueueJobView[] = [];

/** 고르기·끌기로 목록이 자주 다시 그려지므로 바뀐 카드만 그리도록 props를 같은 값으로 유지한다. */
const EmotionCard = memo(function EmotionCard(props: {
  projectId: string;
  set: EmotionSet;
  emotion: Emotion;
  favoriteId?: string;
  /** 일괄 생성에서 뺐는지 */
  excluded: boolean;
  /** 필요한 항목이 빠져 생성할 수 없는지 */
  blocked: boolean;
  records: GenerationSummary[];
  jobs: QueueJobView[];
  prefer: 'favorite' | 'latest';
  /** 고른 카드 중 하나를 끌면 고른 카드를 모두 옮긴다. */
  startDrag: (id: string) => DragPayload;
  endDrag: () => void;
  dropOn: (payload: DragPayload, targetId: string) => void;
  dragging: boolean;
  picked: boolean;
  /** Ctrl·Shift 클릭이면 true */
  onPick: (event: MouseEvent, id: string) => boolean;
}) {
  const { projectId, emotion, records, favoriteId, excluded } = props;
  const open = (event: MouseEvent) => {
    if (!props.onPick(event, emotion.id)) openEmotion(emotion.id);
  };
  const cover = coverRecord(records, favoriteId, props.prefer);
  const state = jobState(props.jobs);
  const included = !excluded && hasScenePrompt(emotion);
  const menu = (event: React.MouseEvent) =>
    showContextMenu(event, emotionMenu(projectId, props.set, emotion, excluded));
  const [over, setOver] = useState(false);

  return (
    <article
      className={`emotion-card ${included ? '' : 'disabled'} ${over ? 'drop-target' : ''} ${props.dragging ? 'dragging' : ''} ${props.picked ? 'picked' : ''}`}
      data-select-id={emotion.id}
      draggable
      onContextMenu={menu}
      onDragStart={(event) => writeDragPayload(event, DRAG_TYPE, props.startDrag(emotion.id))}
      onDragEnd={props.endDrag}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const payload = readDragPayload(event, DRAG_TYPE);
        setOver(false);
        if (!payload || payload.ids.includes(emotion.id)) return;
        event.preventDefault();
        event.stopPropagation();
        props.dropOn(payload, emotion.id);
      }}
    >
      <button
        className="emotion-thumb"
        onClick={open}
        title="클릭: 결과와 프롬프트 편집 · 우클릭: 메뉴 · Ctrl·Shift 클릭: 여러 개 선택"
      >
        {cover ? (
          <img
            src={projectMedia(projectId, cover.thumbFile ?? cover.file)}
            alt={emotion.name}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="thumb-empty">
            {hasScenePrompt(emotion) ? '아직 생성 전' : '프롬프트 없음'}
          </span>
        )}
        <StreamPreview
          jobIds={props.jobs.filter((job) => job.status === 'generating').map((job) => job.id)}
        />
        {state && <span className={`card-status ${state.tone}`}>{state.label}</span>}
        {favoriteId && cover?.id === favoriteId && (
          <span className="card-favorite" title="대표 이미지">
            ★
          </span>
        )}
      </button>
      <footer>
        <input
          type="checkbox"
          checked={included}
          disabled={!hasScenePrompt(emotion)}
          title={
            hasScenePrompt(emotion) ? '일괄 생성에 포함' : '프롬프트를 입력하면 선택할 수 있습니다.'
          }
          onChange={(event) =>
            updateProject(projectId, (current) => ({
              ...current,
              excludedEmotionIds: event.target.checked
                ? current.excludedEmotionIds.filter((id) => id !== emotion.id)
                : [...current.excludedEmotionIds, emotion.id],
            }))
          }
        />
        <button className="emotion-name" onClick={open}>
          <b>{emotion.name}</b>
          <small>{records.length ? `${records.length}장` : '—'}</small>
        </button>
      </footer>
      <div className="card-actions">
        <button
          className="icon-button card-generate"
          title="이 씬만 생성"
          disabled={!hasScenePrompt(emotion) || props.blocked}
          onClick={() => void generateEmotions(projectId, [emotion.id])}
        >
          ▶
        </button>
        <button className="icon-button" title="메뉴" onClick={menu}>
          ⋯
        </button>
      </div>
    </article>
  );
});

export function GalleryView({
  resolved,
  countControl,
  generate,
}: {
  resolved: ResolvedProject;
  countControl: ReactNode;
  generate: ReactNode;
}) {
  const prefer = useStore((state) => state.library!.settings.export.target);
  const { project, emotionSet } = resolved;
  const records = useStore((state) => state.generations[project.id]);
  const queue = useStore((state) => state.queue);
  const columns = useStore((state) => state.galleryColumns);
  const aspect = useStore((state) => state.galleryAspect);
  const emotions = emotionSet?.emotions ?? [];
  const recordsByEmotion = useMemo(() => {
    const groups = new Map<string, GenerationSummary[]>();
    for (const record of records ?? []) {
      if (!record.emotionId) continue;
      const group = groups.get(record.emotionId);
      if (group) group.push(record);
      else groups.set(record.emotionId, [record]);
    }
    for (const group of groups.values())
      group.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return groups;
  }, [records]);
  const jobsByEmotion = useMemo(() => {
    const groups = new Map<string, QueueJobView[]>();
    for (const job of queue.jobs) {
      if (job.projectId !== project.id || !job.emotionId) continue;
      const group = groups.get(job.emotionId);
      if (group) group.push(job);
      else groups.set(job.emotionId, [job]);
    }
    return groups;
  }, [queue.jobs, project.id]);
  const recordsOf = (id: string) => recordsByEmotion.get(id) ?? NO_RECORDS;
  const removeMany = (ids: string[]) => {
    if (emotionSet)
      void deleteEmotions(
        emotionSet.id,
        emotions.filter((emotion) => ids.includes(emotion.id)),
        project.id,
      );
  };
  const selection = useBoxSelection<HTMLDivElement>(
    emotions.map((emotion) => emotion.id),
    removeMany,
    { selectAllKey: () => emotions.map((emotion) => emotion.id) },
  );
  const [dragging, setDragging] = useState<string[]>([]);
  const latest = useRef({ selected: selection.selected, emotions, setId: emotionSet?.id });
  latest.current = { selected: selection.selected, emotions, setId: emotionSet?.id };
  // 카드가 memo라 함수는 늘 같게 두고 최신 값은 ref에서 읽는다.
  const startDrag = useCallback((id: string) => {
    const { selected, emotions: order } = latest.current;
    const payload = dragPayload(
      id,
      selected,
      order.map((emotion) => emotion.id),
    );
    setDragging(payload.ids);
    return payload;
  }, []);
  const endDrag = useCallback(() => setDragging([]), []);
  const dropOn = useCallback((payload: DragPayload, targetId: string) => {
    const setId = latest.current.setId;
    if (setId)
      updateEmotionSet(setId, (current) =>
        moveEmotions(current, payload.ids, payload.grabbed, targetId),
      );
  }, []);
  const openExport = () =>
    void openDialog((close) => <ExportDialog resolved={resolved} close={close} />);
  useShortcut('Ctrl+E', openExport, Boolean(emotionSet));

  if (!emotionSet) {
    return (
      <EmptyState title="씬 모음이 없습니다">
        <p>위쪽 씬 모음에서 사용할 모음을 고르거나 라이브러리에서 새로 만드십시오.</p>
        <button className="accent" onClick={() => openLibrary('emotionSets')}>
          씬 모음 관리
        </button>
      </EmptyState>
    );
  }

  const excluded = new Set(project.excludedEmotionIds);
  const included = emotionSet.emotions.filter(
    (emotion) => !excluded.has(emotion.id) && hasScenePrompt(emotion),
  ).length;
  const withResults = emotionSet.emotions.filter((emotion) => recordsOf(emotion.id).length).length;

  const addAndOpen = () => {
    const id = addEmotionTo(emotionSet.id);
    if (id) openEmotion(id);
  };

  const pickedCovers = () =>
    emotions
      .filter((emotion) => selection.isSelected(emotion.id))
      .map((emotion) => coverRecord(recordsOf(emotion.id), project.favorites[emotion.id]))
      .filter((record): record is GenerationSummary => Boolean(record));

  return (
    <div className="gallery-view selectable" {...selection.containerProps}>
      {/* 체크(일괄 생성 대상)는 아래 큐 막대, 카드 고르기(일괄 작업 대상)는 위 막대에 따로 둔다. */}
      <div className="toolbar gallery-toolbar">
        {selection.selected.size > 0 ? (
          <section className="toolbar-zone active" aria-label="고른 카드">
            <b className="zone-count">카드 {selection.selected.size}개</b>
            <span className="zone-divider" />
            <button
              className="with-icon"
              title="고른 씬마다 대표 이미지(없으면 최신)를 크기·강도를 정해 다시 그려 다듬습니다"
              onClick={() => openImg2ImgDialog(project.id, pickedCovers())}
            >
              <Icon name="upscale" size={14} /> 다듬기
            </button>
            <button
              className="with-icon"
              title="고른 씬마다 대표 이미지(없으면 최신)에 Emotion·배경 제거 같은 디렉터 툴을 적용합니다"
              onClick={() => openDirectorToolDialog(project.id, pickedCovers())}
            >
              <Icon name="wand" size={14} /> 디렉터 툴
            </button>
            <button
              className="with-icon"
              title="씬은 두고 생성 결과만 휴지통으로 보냅니다. 대표 이미지는 남깁니다."
              onClick={() =>
                void clearEmotionResults(
                  project.id,
                  emotions.filter((emotion) => selection.isSelected(emotion.id)),
                )
              }
            >
              <Icon name="eraser" size={14} /> 결과만 삭제
            </button>
            <button
              className="with-icon danger-quiet"
              onClick={() => removeMany([...selection.selected])}
            >
              <Icon name="trash" size={14} /> 씬 삭제
            </button>
            <span className="zone-divider" />
            <button className="with-icon" title="고르기 취소 (Esc)" onClick={selection.clear}>
              <Icon name="close" size={14} /> 고르기 취소
            </button>
          </section>
        ) : (
          <section className="toolbar-zone" aria-label="카드 고르기">
            <button
              className="with-icon"
              title="모두 고르기 (Ctrl+A)"
              onClick={() => selection.selectAll(emotions.map((emotion) => emotion.id))}
            >
              <Icon name="select-all" size={14} /> 모두 고르기
            </button>
            <span className="hint">Ctrl·Shift 클릭이나 빈 곳을 끌어 골라 한꺼번에 다룹니다</span>
          </section>
        )}

        <section className="toolbar-zone view-zone" aria-label="보기">
          <button
            className="with-icon"
            disabled={!withResults}
            title={`결과가 있는 씬 ${withResults}개의 대표 이미지(없으면 최신)를 내보냅니다 (Ctrl+E)`}
            onClick={openExport}
          >
            <Icon name="export" size={14} /> 내보내기
          </button>
          <span className="zone-divider" />
          <span className="segmented" role="group" aria-label="카드 이미지 비율">
            {GALLERY_ASPECTS.map((choice) => (
              <button
                key={choice.id}
                className={choice.id === aspect ? 'active' : ''}
                aria-pressed={choice.id === aspect}
                title={`카드 이미지를 ${choice.title} 비율로 봅니다`}
                aria-label={choice.title}
                onClick={() => setGalleryAspect(choice.id)}
              >
                <Icon name={choice.icon} size={15} />
              </button>
            ))}
          </span>
          <span className="segmented" role="group" aria-label="한 줄에 보일 카드 수">
            {GALLERY_COLUMN_CHOICES.map((choice) => (
              <button
                key={choice}
                className={choice === columns ? 'active' : ''}
                aria-pressed={choice === columns}
                title={`한 줄에 ${choice}장`}
                onClick={() => setGalleryColumns(choice)}
              >
                {choice}
              </button>
            ))}
          </span>
        </section>
      </div>
      <BottomSlot>
        <span className="zone-field" title="카드 아래 체크박스로 고른 씬만 일괄 생성합니다">
          <span>
            생성할 씬 <b>{included}</b>/{emotionSet.emotions.length}
          </span>
        </span>
        <button
          onClick={() =>
            updateProject(project.id, (current) => ({ ...current, excludedEmotionIds: [] }))
          }
        >
          모두 체크
        </button>
        <button
          onClick={() =>
            updateProject(project.id, (current) => ({
              ...current,
              excludedEmotionIds: emotionSet.emotions.map((emotion) => emotion.id),
            }))
          }
        >
          모두 해제
        </button>
        {countControl}
        {generate}
      </BottomSlot>
      {!records && <p className="hint">생성 기록을 불러오는 중…</p>}
      <div
        className="emotion-grid"
        style={
          {
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            '--thumb-aspect': GALLERY_ASPECTS.find((item) => item.id === aspect)?.ratio,
          } as CSSProperties
        }
      >
        {emotionSet.emotions.map((emotion) => (
          <EmotionCard
            key={emotion.id}
            projectId={project.id}
            set={emotionSet}
            emotion={emotion}
            favoriteId={project.favorites[emotion.id]}
            excluded={excluded.has(emotion.id)}
            blocked={resolved.missing.length > 0}
            records={recordsOf(emotion.id)}
            jobs={jobsByEmotion.get(emotion.id) ?? NO_JOBS}
            prefer={prefer}
            startDrag={startDrag}
            endDrag={endDrag}
            dropOn={dropOn}
            dragging={dragging.includes(emotion.id)}
            picked={selection.isSelected(emotion.id)}
            onPick={selection.clickItem}
          />
        ))}
        <button className="emotion-card add-card" onClick={addAndOpen}>
          <span className="add-card-thumb">＋</span>
          <footer>씬 추가</footer>
        </button>
      </div>
      {selection.boxElement}
    </div>
  );
}
