import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Emotion, GenerationSummary, QueueJobView } from '../../core/domain/types';
import { hasScenePrompt, type ResolvedProject } from '../../core/model/defaults';
import { moveEmotions, setEmotionsExcluded } from '../../core/model/mutations';
import { generateEmotions } from '../actions';
import { showContextMenu } from '../components/contextMenuStore';
import { openDialog } from '../components/dialogStack';
import { BottomSlot } from '../components/BottomSlot';
import { ExportDialog } from '../components/ExportDialog';
import { useShortcut } from '../useShortcut';
import { useDragEdgeScroll } from '../components/useDragEdgeScroll';
import { EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';
import { rangeBetween, useBoxSelection } from '../components/useBoxSelection';
import {
  dragPayload,
  readDragPayload,
  writeDragPayload,
  type DragPayload,
} from '../components/listDrag';
import {
  addEmotionTo,
  deleteEmotions,
  emotionMenu,
  emotionsMenu,
  updateEmotionSet,
} from '../emotionOps';
import {
  clearEmotionResults,
  openDirectorToolDialog,
  openImg2ImgDialog,
  openLineFixDialog,
} from '../generationOps';
import {
  coverRecord,
  GALLERY_ASPECTS,
  GALLERY_COLUMN_CHOICES,
  openEmotion,
  openLibrary,
  projectMedia,
  saveGalleryScroll,
  sceneQueryOf,
  setGalleryAspect,
  setGalleryColumns,
  setSceneQuery,
  updateProject,
  useStore,
} from '../store';
import { StreamPreview } from '../components/StreamPreview';
import { SceneSearch } from '../components/SceneSearch';
import { matchesScene } from '../sceneSearch';

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
// 카드 하나가 바뀌어도 격자 전체를 다시 배치한다(씬 300개에서 동작마다 약 12ms). 몇 줄씩 묶으면 바뀐 묶음만 배치한다.
const CHUNK_ROWS = 4;
const NO_RECORDS: GenerationSummary[] = [];
const NO_JOBS: QueueJobView[] = [];

/** 카드가 읽는 값(`jobState`, 생성 중인 작업 ID)만 비교한다. */
function sameJobs(a: QueueJobView[], b: QueueJobView[]): boolean {
  return (
    a.length === b.length &&
    a.every((job, index) => job.id === b[index].id && job.status === b[index].status)
  );
}

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * Chromium은 한 번 그린 묶음이 화면 밖으로 나가면 그때 높이를 그대로 쓴다(계산 높이가 바뀌어도 따르지 않는다).
 * 열 수·비율·폭·카드 수가 바뀌면 잠깐 hidden으로 배치해 계산 높이로 되돌린다.
 */
function useFreshChunkHeights(grid: RefObject<HTMLDivElement | null>, layoutKey: string) {
  const reset = useCallback(() => {
    const element = grid.current;
    if (!element) return;
    element.classList.add('reset-chunks');
    void element.offsetHeight;
    element.classList.remove('reset-chunks');
  }, [grid]);
  const laidOut = useRef(layoutKey);
  useLayoutEffect(() => {
    if (laidOut.current === layoutKey) return;
    laidOut.current = layoutKey;
    reset();
  }, [layoutKey, reset]);
  const present = Boolean(grid.current);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    let width = element.clientWidth;
    let timer = 0;
    // 패널을 여닫는 동안은 폭이 프레임마다 바뀐다. 그때마다 되돌리면 프레임의 배치가 두 배가 되어 멈춘 뒤에 한 번 한다.
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      clearTimeout(timer);
      // 패널이 움직이는 동안 묶은 폭이 바뀐 것이면 움직임이 끝난 뒤에 한다.
      const later = () => {
        if (element.parentElement?.classList.contains('panel-moving'))
          timer = window.setTimeout(later, 150);
        else reset();
      };
      timer = window.setTimeout(later, 150);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [grid, reset, present]);
}

const panelMotion = (animation: Animation, grid: Element): animation is CSSTransition =>
  animation instanceof CSSTransition &&
  animation.transitionProperty === 'grid-template-columns' &&
  animation.effect instanceof KeyframeEffect &&
  Boolean(animation.effect.target?.contains(grid));

type Box = { x: number; y: number; width: number; height: number };

/**
 * 패널 칸이 움직이는 동안(grid-template-columns 전환) 카드를 프레임마다 다시 배치하지 않는다. 한 줄 8장에서 한
 * 프레임이 25~30ms였다. 격자를 끝 폭으로 한 번 배치하고, 보이는 카드는 처음 자리·크기에서 끝 자리로 transform
 * 애니메이션(FLIP)을 패널 전환과 같은 시간·곡선으로 돌린다. 폭을 묶고 끝에 한 번 맞추는 방식은 어색했다.
 */
function useCardMorphWhilePanelsMove(grid: RefObject<HTMLDivElement | null>) {
  const present = Boolean(grid.current);
  useEffect(() => {
    const element = grid.current;
    const view = element?.parentElement;
    if (!element || !view) return;
    const moving = new Map<EventTarget, number>();
    const morphs: Animation[] = [];
    let opened: HTMLElement[] = [];
    let fallback = 0;
    let closing = 0;
    // 마지막으로 배치한 폭. 시작할 때 레이아웃을 읽기 전에 격자를 이 폭으로 묶어야 진행된 폭으로 다시 배치하지 않는다.
    let width = element.getBoundingClientRect().width;
    const sizes = new ResizeObserver(([entry]) => {
      if (!element.style.width) width = entry.contentRect.width;
    });
    sizes.observe(element);
    const reopen = () => {
      clearTimeout(closing);
      for (const chunk of opened) chunk.style.removeProperty('content-visibility');
      opened = [];
    };
    const release = () => {
      moving.clear();
      clearTimeout(fallback);
      for (const morph of morphs.splice(0)) morph.cancel();
      // 풀어도 폭이 같아 ResizeObserver가 부르지 않는다.
      if (element.style.width) width = parseFloat(element.style.width);
      element.style.removeProperty('width');
      view.classList.remove('panel-moving');
      // 묶음을 다시 auto로 돌리면 카드를 다시 배치한다. 애니메이션이 끝나는 프레임을 피해 조금 뒤에 한다.
      clearTimeout(closing);
      closing = window.setTimeout(reopen, 300);
    };
    /** 화면과 위아래 반 화면 안에 걸친 묶음. 이보다 먼 묶음은 그리지 않은 채로 둔다. */
    const chunksNearView = () => {
      const box = view.getBoundingClientRect();
      const margin = box.height / 2;
      return [...element.children].filter((chunk): chunk is HTMLElement => {
        const rect = chunk.getBoundingClientRect();
        return rect.bottom > box.top - margin && rect.top < box.bottom + margin;
      });
    };
    const boxes = () => {
      const origin = element.getBoundingClientRect();
      return new Map(
        chunksNearView().flatMap((chunk) =>
          [...chunk.children].map((card): [Element, Box] => {
            const rect = card.getBoundingClientRect();
            return [
              card,
              {
                x: rect.left - origin.left,
                y: rect.top - origin.top,
                width: rect.width,
                height: rect.height,
              },
            ];
          }),
        ),
      );
    };
    const morph = () => {
      if (!element.style.width) element.style.width = `${width}px`;
      const transitions = document.getAnimations().filter((item) => panelMotion(item, element));
      if (!transitions.length) {
        if (!morphs.length) element.style.removeProperty('width');
        return;
      }
      const times = transitions.map((transition) => transition.currentTime);
      const seek = (time: (transition: CSSTransition, index: number) => CSSNumberish | null) =>
        transitions.forEach(
          (transition, index) => (transition.currentTime = time(transition, index)),
        );
      const endTime = (transition: CSSTransition) =>
        Number(transition.effect?.getComputedTiming().endTime ?? 0);
      // 시작 이벤트는 첫 프레임을 그린 뒤에 온다(곡선이 가팔라 그사이 28% 움직인다). 처음으로 옮겨 잰다.
      // 그 배치는 이미 한 것이라 다시 하지 않고, 움직이던 카드는 transform까지 든 지금 자리를 잰다.
      seek(() => 0);
      const before = boxes();
      for (const running of morphs.splice(0)) running.cancel();
      const style = getComputedStyle(view);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      seek(endTime);
      const end = view.clientWidth - padding;
      seek((_, index) => times[index]);
      element.style.width = `${end}px`;
      view.classList.add('panel-moving');
      // 묶음은 내용을 제 상자로 자른다. 옮겨 그리는 카드가 이웃 묶음 자리로 넘어가도 보이게 한다.
      reopen();
      opened = chunksNearView();
      for (const chunk of opened) chunk.style.contentVisibility = 'visible';
      const timing = transitions[0].effect?.getTiming();
      const duration = endTime(transitions[0]);
      for (const [card, after] of boxes()) {
        const from = before.get(card);
        if (!from || !after.width || !after.height) continue;
        const dx = from.x - after.x;
        const dy = from.y - after.y;
        const sx = from.width / after.width;
        const sy = from.height / after.height;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.002) continue;
        const animation = card.animate(
          [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }],
          { duration, easing: timing?.easing ?? 'linear' },
        );
        // currentTime으로 맞추면 새 애니메이션은 시작을 기다리며 한 프레임 늦는다.
        animation.startTime = transitions[0].startTime;
        morphs.push(animation);
      }
      // 전환 중에 요소가 빠지면 끝 이벤트가 오지 않는다.
      clearTimeout(fallback);
      fallback = window.setTimeout(release, duration + 500);
    };
    const isPanelMotion = (event: TransitionEvent) =>
      event.propertyName === 'grid-template-columns' &&
      event.target instanceof Element &&
      event.target.contains(element);
    const onRun = (event: TransitionEvent) => {
      if (!isPanelMotion(event)) return;
      moving.set(event.target!, (moving.get(event.target!) ?? 0) + 1);
      morph();
    };
    const onEnd = (event: TransitionEvent) => {
      if (!isPanelMotion(event)) return;
      const left = (moving.get(event.target!) ?? 1) - 1;
      if (left > 0) moving.set(event.target!, left);
      else moving.delete(event.target!);
      if (!moving.size) release();
    };
    document.addEventListener('transitionrun', onRun);
    document.addEventListener('transitionend', onEnd);
    document.addEventListener('transitioncancel', onEnd);
    return () => {
      document.removeEventListener('transitionrun', onRun);
      document.removeEventListener('transitionend', onEnd);
      document.removeEventListener('transitioncancel', onEnd);
      sizes.disconnect();
      release();
      reopen();
    };
  }, [grid, present]);
}

/** 고르기·끌기로 목록이 자주 다시 그려지므로 바뀐 카드만 그리도록 props를 같은 값으로 유지한다. */
const EmotionCard = memo(function EmotionCard(props: {
  projectId: string;
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
  /** 방금 씬 상세에서 돌아온 씬 */
  returned: boolean;
  /** Ctrl·Shift 클릭이면 true */
  onPick: (event: MouseEvent, id: string) => boolean;
  onMenu: (event: MouseEvent, emotion: Emotion, excluded: boolean) => void;
  /** `range`면 앞에 누른 체크부터 이 카드까지 */
  onCheck: (id: string, include: boolean, range: boolean) => void;
}) {
  const { projectId, emotion, records, favoriteId, excluded } = props;
  const open = (event: MouseEvent) => {
    if (!props.onPick(event, emotion.id)) openEmotion(emotion.id);
  };
  const cover = coverRecord(records, favoriteId, props.prefer);
  const state = jobState(props.jobs);
  const included = !excluded && hasScenePrompt(emotion);
  const menu = (event: MouseEvent) => props.onMenu(event, emotion, excluded);
  const [over, setOver] = useState(false);

  return (
    <article
      className={`emotion-card ${included ? '' : 'disabled'} ${over ? 'drop-target' : ''} ${props.dragging ? 'dragging' : ''} ${props.picked ? 'picked' : ''} ${props.returned ? 'returned' : ''}`}
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
      <button className="emotion-thumb" onClick={open}>
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
          title={hasScenePrompt(emotion) ? '일괄 생성에 포함' : '프롬프트가 없습니다'}
          onChange={(event) =>
            props.onCheck(
              emotion.id,
              event.target.checked,
              // 체크 상자의 change는 click으로 오므로 Shift를 읽을 수 있다.
              (event.nativeEvent as Partial<PointerEvent>).shiftKey === true,
            )
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
  onGenerate,
}: {
  resolved: ResolvedProject;
  countControl: ReactNode;
  generate: ReactNode;
  /** 생성할 수 없으면 없다. */
  onGenerate?: () => void;
}) {
  const prefer = useStore((state) => state.library!.settings.export.target);
  const { project, emotionSet } = resolved;
  const records = useStore((state) => state.generations[project.id]);
  const queue = useStore((state) => state.queue);
  const columns = useStore((state) => state.galleryColumns);
  const aspect = useStore((state) => state.galleryAspect);
  const lastEmotionId = useStore((state) => state.lastEmotionId);
  const query = useStore(sceneQueryOf(project.id));
  const allEmotions = emotionSet?.emotions ?? [];
  // 고르기·끌기·모두 고르기는 보이는 씬만 대상으로 한다.
  const emotions = query.trim()
    ? allEmotions.filter((emotion) => matchesScene(emotion, query))
    : allEmotions;
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
  const shownJobs = useRef(new Map<string, QueueJobView[]>());
  const jobsByEmotion = useMemo(() => {
    const groups = new Map<string, QueueJobView[]>();
    for (const job of queue.jobs) {
      if (job.projectId !== project.id || !job.emotionId) continue;
      const group = groups.get(job.emotionId);
      if (group) group.push(job);
      else groups.set(job.emotionId, [job]);
    }
    // 큐 갱신마다 작업 객체가 새로 온다. 상태가 그대로인 씬은 앞의 배열을 써야 카드가 다시 그려지지 않는다.
    for (const [id, group] of groups) {
      const before = shownJobs.current.get(id);
      if (before && sameJobs(before, group)) groups.set(id, before);
    }
    shownJobs.current = groups;
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
  const latest = useRef({ selection, emotions, set: emotionSet });
  latest.current = { selection, emotions, set: emotionSet };
  // 카드가 memo라 함수는 늘 같게 두고 최신 값은 ref에서 읽는다.
  const startDrag = useCallback((id: string) => {
    const { selection: current, emotions: order } = latest.current;
    const payload = dragPayload(
      id,
      current.selected,
      order.map((emotion) => emotion.id),
    );
    setDragging(payload.ids);
    return payload;
  }, []);
  const endDrag = useCallback(() => setDragging([]), []);
  const dropOn = useCallback((payload: DragPayload, targetId: string) => {
    const setId = latest.current.set?.id;
    if (setId)
      updateEmotionSet(setId, (current) =>
        moveEmotions(current, payload.ids, payload.grabbed, targetId),
      );
  }, []);
  // 고른 카드를 우클릭하면 고른 씬 모두에, 고르지 않은 카드면 고르기를 풀고 그 씬에만(탐색기와 같다).
  const menuFor = useCallback(
    (event: MouseEvent, emotion: Emotion, excluded: boolean) => {
      const { selection: current, emotions: order, set } = latest.current;
      if (!set) return;
      if (current.selected.size > 1 && current.selected.has(emotion.id)) {
        const picked = order.filter((item) => current.selected.has(item.id));
        showContextMenu(event, emotionsMenu(project.id, set, picked));
        return;
      }
      if (current.selected.size && !current.selected.has(emotion.id)) current.clear();
      showContextMenu(event, emotionMenu(project.id, set, emotion, excluded));
    },
    [project.id],
  );
  const checkAnchor = useRef<string>(undefined);
  const check = useCallback(
    (id: string, include: boolean, range: boolean) => {
      const order = latest.current.emotions.map((emotion) => emotion.id);
      const ids = (range && rangeBetween(order, checkAnchor.current, id)) || [id];
      checkAnchor.current = id;
      updateProject(project.id, (current) => setEmotionsExcluded(current, ids, !include));
    },
    [project.id],
  );
  const openExport = () =>
    void openDialog((close) => <ExportDialog resolved={resolved} close={close} />);
  useShortcut('Ctrl+E', openExport, Boolean(emotionSet));
  useShortcut('Ctrl+Enter', () => onGenerate?.(), Boolean(onGenerate), { inFields: true });

  const scroller = selection.containerProps.ref;
  useDragEdgeScroll(scroller, DRAG_TYPE);
  const grid = useRef<HTMLDivElement>(null);
  useFreshChunkHeights(grid, `${project.id} ${columns} ${aspect} ${emotions.length}`);
  useCardMorphWhilePanelsMove(grid);
  // 씬 상세에서 PageDown으로 넘어갔으면 그 씬이 화면 밖일 수 있다.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = useStore.getState().galleryScrollTops[project.id] ?? 0;
    const last = useStore.getState().lastEmotionId;
    if (last)
      element
        .querySelector(`[data-select-id="${CSS.escape(last)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    // 레이아웃 정리는 요소를 떼기 전에 돌아 아직 scrollTop을 읽을 수 있다.
    return () => saveGalleryScroll(project.id, element.scrollTop);
  }, [project.id, scroller]);

  if (!emotionSet) {
    return (
      <EmptyState title="씬 모음이 없습니다">
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

  const pickedIds = emotions
    .filter((emotion) => selection.isSelected(emotion.id))
    .map((emotion) => emotion.id);
  const setPickedExcluded = (exclude: boolean) =>
    updateProject(project.id, (current) => setEmotionsExcluded(current, pickedIds, exclude));

  const cards = [
    ...emotions.map((emotion) => (
      <EmotionCard
        key={emotion.id}
        projectId={project.id}
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
        returned={emotion.id === lastEmotionId}
        onPick={selection.clickItem}
        onMenu={menuFor}
        onCheck={check}
      />
    )),
    <button key="add" className="emotion-card add-card" onClick={addAndOpen}>
      <span className="add-card-thumb">＋</span>
      <footer>씬 추가</footer>
    </button>,
  ];

  const pickedCovers = () =>
    emotions
      .filter((emotion) => selection.isSelected(emotion.id))
      .map((emotion) => coverRecord(recordsOf(emotion.id), project.favorites[emotion.id]))
      .filter((record): record is GenerationSummary => Boolean(record));

  return (
    <div className="gallery-view selectable" {...selection.containerProps}>
      {/* 모든 씬의 체크(일괄 생성 대상)는 아래 큐 막대, 고른 카드에 할 일(체크 포함)은 위 막대에 둔다. */}
      <div className="toolbar gallery-toolbar">
        {selection.selected.size > 0 ? (
          <section className="toolbar-zone active" aria-label="고른 카드">
            <b className="zone-count">카드 {selection.selected.size}개</b>
            <button
              className="with-icon"
              title="고른 씬을 일괄 생성에 포함"
              disabled={pickedIds.every((id) => !excluded.has(id))}
              onClick={() => setPickedExcluded(false)}
            >
              <Icon name="check-square" size={14} /> 생성 포함
            </button>
            <button
              className="with-icon"
              title="고른 씬을 일괄 생성에서 제외"
              disabled={pickedIds.every((id) => excluded.has(id))}
              onClick={() => setPickedExcluded(true)}
            >
              <Icon name="square" size={14} /> 생성 제외
            </button>
            <button
              className="with-icon"
              title="고른 씬의 대표 이미지 다듬기 (i2i)"
              onClick={() => openImg2ImgDialog(project.id, pickedCovers())}
            >
              <Icon name="upscale" size={14} /> 다듬기
            </button>
            <button
              className="with-icon"
              title="고른 씬의 대표 이미지 구분선 지우기"
              onClick={() => openLineFixDialog(project.id, pickedCovers())}
            >
              <Icon name="border-line" size={14} /> 구분선 지우기
            </button>
            <button
              className="with-icon"
              title="고른 씬의 대표 이미지에 디렉터 툴 적용"
              onClick={() => openDirectorToolDialog(project.id, pickedCovers())}
            >
              <Icon name="wand" size={14} /> 디렉터 툴
            </button>
            <button
              className="with-icon"
              title="생성 결과를 휴지통으로 (씬·대표 이미지는 남김)"
              onClick={() =>
                void clearEmotionResults(
                  project.id,
                  emotions.filter((emotion) => selection.isSelected(emotion.id)),
                )
              }
            >
              <Icon name="eraser" size={14} /> 결과 삭제
            </button>
            <button
              className="with-icon danger-quiet"
              onClick={() => removeMany([...selection.selected])}
            >
              <Icon name="trash" size={14} /> 씬 삭제
            </button>
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
          </section>
        )}

        <section className="toolbar-zone scene-search-zone" aria-label="씬 검색">
          <SceneSearch
            value={query}
            found={emotions.length}
            total={allEmotions.length}
            onChange={(value) => setSceneQuery(project.id, value)}
          />
        </section>

        <section className="toolbar-zone view-zone" aria-label="보기">
          <button
            className="with-icon"
            disabled={!withResults}
            title="이미지 내보내기 (Ctrl+E)"
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
                title={`카드 비율 ${choice.title}`}
                aria-label={choice.title}
                onClick={() => setGalleryAspect(choice.id)}
              >
                <Icon name={choice.icon} size={15} />
              </button>
            ))}
          </span>
          <span
            className="segmented gallery-columns"
            role="group"
            aria-label="한 줄에 보일 카드 수"
          >
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
        <span className="zone-field">
          <span>
            <span className="slot-long">생성할 </span>씬 <b>{included}</b>/
            {emotionSet.emotions.length}
          </span>
        </span>
        <button
          className="slot-icon-button"
          title="모두 체크"
          onClick={() =>
            updateProject(project.id, (current) => ({ ...current, excludedEmotionIds: [] }))
          }
        >
          <Icon name="check-square" size={15} />
          <span>모두 체크</span>
        </button>
        <button
          onClick={() =>
            updateProject(project.id, (current) => ({
              ...current,
              excludedEmotionIds: emotionSet.emotions.map((emotion) => emotion.id),
            }))
          }
          className="slot-icon-button"
          title="모두 해제"
        >
          <Icon name="square" size={15} />
          <span>모두 해제</span>
        </button>
        {countControl}
        {generate}
      </BottomSlot>
      {!records && <p className="hint">생성 기록을 불러오는 중…</p>}
      {!emotions.length && query.trim() && (
        <p className="hint">「{query.trim()}」 검색 결과가 없습니다.</p>
      )}
      <div
        ref={grid}
        className="emotion-grid"
        style={
          {
            '--gallery-columns': columns,
            '--thumb-aspect': GALLERY_ASPECTS.find((item) => item.id === aspect)?.ratio,
          } as CSSProperties
        }
      >
        {chunksOf(cards, columns * CHUNK_ROWS).map((chunk, index) => (
          <div
            key={index}
            className="emotion-chunk"
            style={{ '--chunk-items': chunk.length } as CSSProperties}
          >
            {chunk}
          </div>
        ))}
      </div>
      {selection.boxElement}
    </div>
  );
}
