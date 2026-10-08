import { useState, type MouseEvent, type ReactNode } from 'react';
import type { Emotion, GenerationSummary, QueueJobView } from '../../core/domain/types';
import type { ResolvedProject } from '../../core/model/defaults';
import { moveEmotion } from '../../core/model/mutations';
import { generateEmotions } from '../actions';
import { showContextMenu } from '../components/ContextMenu';
import { openDialog } from '../components/Dialogs';
import { ExportDialog } from '../components/ExportDialog';
import { EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';
import { useBoxSelection } from '../components/useBoxSelection';
import { addEmotionTo, deleteEmotions, emotionMenu, updateEmotionSet } from '../emotionOps';
import { clearEmotionResults } from '../generationOps';
import {
  coverRecord,
  emotionRecords,
  openEmotion,
  openLibrary,
  projectMedia,
  updateProject,
  useLibrary,
  useStore,
} from '../store';

function jobState(jobs: QueueJobView[]): { label: string; tone: string } | null {
  if (jobs.some((job) => job.status === 'generating')) return { label: '생성 중', tone: 'busy' };
  if (jobs.some((job) => job.status === 'retry_wait'))
    return { label: '재시도 대기', tone: 'warn' };
  const queued = jobs.filter((job) => job.status === 'queued').length;
  if (queued) return { label: `대기 ${queued}`, tone: 'muted' };
  if (jobs.at(-1)?.status === 'failed') return { label: '실패', tone: 'error' };
  return null;
}

function EmotionCard(props: {
  resolved: ResolvedProject;
  emotion: Emotion;
  index: number;
  records: GenerationSummary[];
  jobs: QueueJobView[];
  prefer: 'favorite' | 'latest';
  aspect: string;
  dragging: string | undefined;
  setDragging: (id: string | undefined) => void;
  /** 상자·Ctrl·Shift로 여러 개를 고른 상태인지. */
  picked: boolean;
  /** Ctrl·Shift 클릭이면 선택만 바꾸고 true를 돌려준다. */
  onPick: (event: MouseEvent) => boolean;
}) {
  const { resolved, emotion, records } = props;
  const open = (event: MouseEvent) => {
    if (!props.onPick(event)) openEmotion(emotion.id);
  };
  const project = resolved.project;
  const set = resolved.emotionSet!;
  const favoriteId = project.favorites[emotion.id];
  const cover = coverRecord(records, favoriteId, props.prefer);
  const state = jobState(props.jobs);
  const excluded = project.excludedEmotionIds.includes(emotion.id);
  const included = !excluded && Boolean(emotion.prompt.trim());
  const [over, setOver] = useState(false);
  const menu = (event: React.MouseEvent) =>
    showContextMenu(event, emotionMenu(project.id, set, emotion, excluded));

  return (
    <article
      className={`emotion-card ${included ? '' : 'disabled'} ${over ? 'drop-target' : ''} ${props.dragging === emotion.id ? 'dragging' : ''} ${props.picked ? 'picked' : ''}`}
      data-select-id={emotion.id}
      draggable
      onContextMenu={menu}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-emotion', emotion.id);
        event.dataTransfer.effectAllowed = 'move';
        props.setDragging(emotion.id);
      }}
      onDragEnd={() => props.setDragging(undefined)}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('application/x-emotion')) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const id = event.dataTransfer.getData('application/x-emotion');
        setOver(false);
        if (!id || id === emotion.id) return;
        event.preventDefault();
        event.stopPropagation();
        updateEmotionSet(set.id, (current) => moveEmotion(current, id, props.index));
      }}
    >
      <button
        className="emotion-thumb"
        style={{ aspectRatio: props.aspect }}
        onClick={open}
        title="클릭: 결과와 프롬프트 편집 · 우클릭: 메뉴 · Ctrl·Shift 클릭: 여러 개 선택"
      >
        {cover ? (
          <img
            src={projectMedia(project.id, cover.thumbFile ?? cover.file)}
            alt={emotion.name}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="thumb-empty">
            {emotion.prompt.trim() ? '아직 생성 전' : '프롬프트 없음'}
          </span>
        )}
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
          disabled={!emotion.prompt.trim()}
          title={
            emotion.prompt.trim() ? '일괄 생성에 포함' : '프롬프트를 입력하면 선택할 수 있습니다.'
          }
          onChange={(event) =>
            updateProject(project.id, (current) => ({
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
        <button
          className="icon-button card-generate card-hover"
          title="이 감정만 생성"
          disabled={!emotion.prompt.trim() || resolved.missing.length > 0}
          onClick={() => void generateEmotions(project.id, [emotion.id])}
        >
          ▶
        </button>
        <button className="icon-button card-hover" title="메뉴" onClick={menu}>
          ⋯
        </button>
      </footer>
    </article>
  );
}

export function GalleryView({
  resolved,
  generate,
}: {
  resolved: ResolvedProject;
  /** 생성 버튼. 선택 버튼 옆에 둬서 무엇을 생성할지 한눈에 보이게 한다. */
  generate: ReactNode;
}) {
  const library = useLibrary();
  const { project, emotionSet, reference } = resolved;
  const records = useStore((state) => state.generations[project.id]);
  const queue = useStore((state) => state.queue);
  const [dragging, setDragging] = useState<string>();
  const emotions = emotionSet?.emotions ?? [];
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
  );

  if (!emotionSet) {
    return (
      <EmptyState title="감정 모음이 없습니다">
        <p>위쪽 감정 모음에서 사용할 모음을 고르거나 라이브러리에서 새로 만드십시오.</p>
        <button className="accent" onClick={() => openLibrary('emotionSets')}>
          감정 모음 관리
        </button>
      </EmptyState>
    );
  }

  const output = reference?.image?.outputRect;
  const aspect = output ? `${Math.round(output.width)} / ${Math.round(output.height)}` : '3 / 4';
  const projectJobs = queue.jobs.filter((job) => job.projectId === project.id);
  const excluded = new Set(project.excludedEmotionIds);
  const included = emotionSet.emotions.filter(
    (emotion) => !excluded.has(emotion.id) && emotion.prompt.trim(),
  ).length;
  const withResults = emotionSet.emotions.filter(
    (emotion) => emotionRecords(records, emotion.id).length,
  ).length;

  const addAndOpen = () => {
    const id = addEmotionTo(emotionSet.id);
    if (id) openEmotion(id);
  };

  return (
    <div className="gallery-view selectable" {...selection.containerProps}>
      <div className="toolbar">
        <button
          onClick={() =>
            updateProject(project.id, (current) => ({ ...current, excludedEmotionIds: [] }))
          }
        >
          전체 선택
        </button>
        <button
          onClick={() =>
            updateProject(project.id, (current) => ({
              ...current,
              excludedEmotionIds: emotionSet.emotions.map((emotion) => emotion.id),
            }))
          }
        >
          선택 해제
        </button>
        <button
          className="accent"
          disabled={!withResults}
          onClick={() =>
            void openDialog((close) => <ExportDialog resolved={resolved} close={close} />)
          }
        >
          내보내기
        </button>
        <span className="toolbar-summary">
          체크한 감정 {included}/{emotionSet.emotions.length}개 · 결과 있음 {withResults}개
        </span>
        {selection.selected.size > 0 && (
          <span className="selection-bar inline">
            <span>{selection.selected.size}개 선택</span>
            <button
              title="감정은 두고 생성 결과만 휴지통으로 보냅니다. 대표 이미지는 남깁니다."
              onClick={() =>
                void clearEmotionResults(
                  project.id,
                  emotions.filter((emotion) => selection.isSelected(emotion.id)),
                )
              }
            >
              결과만 삭제
            </button>
            <button
              className="with-icon danger-quiet"
              onClick={() => removeMany([...selection.selected])}
            >
              <Icon name="trash" size={14} /> 감정 삭제
            </button>
            <button className="link-button" onClick={selection.clear}>
              선택 취소
            </button>
          </span>
        )}
        <div className="header-spacer" />
        {generate}
      </div>
      {!records && <p className="hint">생성 기록을 불러오는 중…</p>}
      <div className="emotion-grid">
        {emotionSet.emotions.map((emotion, index) => (
          <EmotionCard
            key={emotion.id}
            resolved={resolved}
            emotion={emotion}
            index={index}
            records={emotionRecords(records, emotion.id)}
            jobs={projectJobs.filter((job) => job.emotionId === emotion.id)}
            prefer={library.settings.export.target}
            aspect={aspect}
            dragging={dragging}
            setDragging={setDragging}
            picked={selection.isSelected(emotion.id)}
            onPick={(event) => selection.clickItem(event, emotion.id)}
          />
        ))}
        <button className="emotion-card add-card" onClick={addAndOpen}>
          <span>＋</span>
          감정 추가
        </button>
      </div>
      {selection.boxElement}
    </div>
  );
}
