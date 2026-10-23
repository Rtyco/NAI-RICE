import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Library } from '../../core/domain/types';
import { FREE_PROJECT_ID } from '../../core/model/defaults';
import { findInLibrary, replaceInLibrary, type FindFieldHit } from '../../core/model/promptFields';
import {
  editRange,
  findRanges,
  replaceAll,
  snippetAround,
  type TextRange,
} from '../../core/prompts/PromptFind';
import type { GenerationFindResult } from '../../shared/ipc';
import { libraryApi } from '../desktop';
import {
  closeFind,
  findPlaceOf,
  findQuery,
  insertText,
  revealName,
  sectionLabel,
  useFind,
  type FindScope,
} from '../find';
import {
  errorMessage,
  openFree,
  openLibrary,
  showResult,
  toast,
  updateLibrary,
  useStore,
} from '../store';
import { confirmDialog, useDialogs } from './dialogStack';

/** 이보다 많으면 목록 끝에 남은 수만 적는다. */
const SHOWN_HITS = 300;

type RecordSearch = GenerationFindResult | 'loading' | undefined;

function Snippet({ text, range }: { text: string; range: TextRange }) {
  const { before, match, after } = snippetAround(text, range);
  return (
    <span className="find-hit-snippet">
      {before}
      <mark>{match}</mark>
      {after}
    </span>
  );
}

/** 바꾸기로 라이브러리가 바뀌면 입력 이벤트 없이 글이 바뀌어 그때도 다시 읽는다. */
function useTextOf(target: HTMLTextAreaElement | undefined, library: Library): string {
  const [text, setText] = useState(target?.value ?? '');
  useEffect(() => {
    if (!target) return;
    const sync = () => setText(target.value);
    sync();
    target.addEventListener('input', sync);
    return () => target.removeEventListener('input', sync);
  }, [target, library]);
  return text;
}

/** 생성 기록은 메인 프로세스가 찾는다. 입력이 멈춘 뒤에 묻는다. */
function useRecordSearch(
  enabled: boolean,
  text: string,
  wholeTag: boolean,
  projectIds: string,
): RecordSearch {
  const [records, setRecords] = useState<RecordSearch>();
  useEffect(() => {
    if (!enabled) {
      setRecords(undefined);
      return;
    }
    setRecords('loading');
    let alive = true;
    const timer = setTimeout(() => {
      libraryApi()
        .findGenerations({
          projectIds: [...projectIds.split('\n').filter(Boolean), FREE_PROJECT_ID],
          query: { text, wholeTag },
        })
        .then((result) => alive && setRecords(result))
        .catch((error: unknown) => {
          if (!alive) return;
          setRecords(undefined);
          toast(`생성 기록에서 찾을 수 없습니다: ${errorMessage(error)}`, 'error');
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [enabled, text, wholeTag, projectIds]);
  return records;
}

export function FindPanel() {
  const open = useFind((state) => state.open);
  return open ? <FindPanelBody /> : null;
}

function FindPanelBody() {
  const find = useFind();
  const { replacing, query, replacement, wholeTag, includeRecords, names, target, undo } = find;
  const storedCurrent = find.current;
  const library = useStore((state) => state.library)!;
  const view = useStore((state) => state.view);
  const dialogOpen = useDialogs((state) => state.stack.length > 0);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const input = useRef<HTMLInputElement>(null);
  const fieldText = useTextOf(target, library);
  const [picked, setPicked] = useState(-1);

  // 화면을 옮기면 「이 칸」의 입력칸이 사라질 수 있다.
  const fieldTarget = find.scope === 'field' && !names && target?.isConnected ? target : undefined;
  const libraryAllowed = !dialogOpen && !settingsOpen;
  const place = useMemo(() => findPlaceOf(view, library), [view, library]);
  const only = !fieldTarget && find.scope !== 'library' ? place : undefined;
  const scope: FindScope = fieldTarget ? 'field' : only ? 'item' : 'library';
  const findTarget = names ? 'names' : 'prompts';
  const searching = query.trim().length > 0;
  const projectIds = library.projects.map((project) => project.id).join('\n');

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [find.opened]);

  const fieldRanges = useMemo(
    () => (fieldTarget ? findRanges(fieldText, { text: query, wholeTag }) : []),
    [fieldTarget, fieldText, query, wholeTag],
  );
  const current = Math.min(storedCurrent, Math.max(0, fieldRanges.length - 1));
  useEffect(() => {
    if (storedCurrent !== current) useFind.setState({ current });
  }, [storedCurrent, current]);
  const libraryHits = useMemo(
    () =>
      !fieldTarget && searching
        ? findInLibrary(library, { text: query, wholeTag }, findTarget, only)
        : [],
    [fieldTarget, searching, library, query, wholeTag, findTarget, only],
  );
  const libraryCount = libraryHits.reduce((sum, hit) => sum + hit.ranges.length, 0);
  const recordsAllowed = scope === 'library' && !names;
  const showRecords = recordsAllowed && includeRecords;
  const records = useRecordSearch(showRecords && searching, query, wholeTag, projectIds);
  const recordHits = records && records !== 'loading' ? records.hits : [];

  useEffect(() => setPicked(-1), [query, wholeTag, scope, names]);

  const openAt = (index: number) => {
    setPicked(index);
    const hit = libraryHits[index];
    if (!hit) {
      showResult(recordHits[index - libraryHits.length]);
      return;
    }
    if (hit.section === 'free') openFree();
    else openLibrary(hit.section, hit.itemId);
    if (names) revealName(hit.text, hit.ranges[0]);
    else useFind.setState({ reveal: hit.text });
  };

  const step = (direction: 1 | -1) => {
    if (fieldTarget) {
      const count = fieldRanges.length;
      if (count) useFind.setState({ current: (current + direction + count) % count });
      return;
    }
    const count = libraryHits.length + recordHits.length;
    if (!count || !libraryAllowed) return;
    openAt(picked < 0 && direction < 0 ? count - 1 : (picked + direction + count) % count);
  };

  const latestStep = useRef(step);
  latestStep.current = step;
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'F3' || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      latestStep.current(event.shiftKey ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    const range = fieldTarget && fieldRanges[current];
    closeFind();
    if (fieldTarget && range) {
      fieldTarget.focus();
      fieldTarget.setSelectionRange(range.start, range.end);
    }
  };

  const replaceOne = () => {
    const range = fieldRanges[current];
    if (!fieldTarget || !range) return;
    const edit = editRange(fieldText, range, replacement, wholeTag);
    insertText(fieldTarget, edit.start, edit.end, wholeTag ? replacement.trim() : replacement);
    input.current?.focus();
  };

  const replaceEverywhere = async () => {
    if (fieldTarget) {
      if (!fieldRanges.length) return;
      insertText(
        fieldTarget,
        0,
        fieldText.length,
        replaceAll(fieldText, findQuery(find), replacement),
      );
      input.current?.focus();
      toast(`${fieldRanges.length}개를 바꿨습니다.`);
      return;
    }
    if (!libraryCount || !libraryAllowed) return;
    const shown = wholeTag && !names ? replacement.trim() : replacement;
    const confirmed = await confirmDialog({
      title: only ? '이 항목에서 바꾸기' : '라이브러리 전체 바꾸기',
      message: `${libraryHits.length}개 ${names ? '이름' : '칸'}에서 ${libraryCount}개를 ${
        shown ? '바꿉니다' : '지웁니다'
      }. 「${query}」${shown ? ` → 「${shown}」` : ''}`,
      confirmLabel: '모두 바꾸기',
    });
    if (!confirmed) return;
    const before = useStore.getState().library!;
    updateLibrary((current) =>
      replaceInLibrary(current, findQuery(find), replacement, findTarget, only),
    );
    useFind.setState({
      undo: { before, after: useStore.getState().library!, count: libraryCount },
    });
    input.current?.focus();
  };

  const undoReplace = () => {
    if (!undo) return;
    updateLibrary(() => undo.before);
    useFind.setState({ undo: undefined });
    toast('바꾸기를 되돌렸습니다.');
  };

  const onFindKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    // 열린 창의 Enter(적용)가 함께 눌리지 않게
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  };

  const onReplaceKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (fieldTarget) replaceOne();
  };

  const count = fieldTarget
    ? `${fieldRanges.length ? current + 1 : 0}/${fieldRanges.length}`
    : `${libraryCount}개`;

  return (
    <div
      className="find-panel"
      role="search"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <div className="find-row">
        <button
          className="icon-button"
          title={replacing ? '바꾸기 닫기' : '바꾸기 (Ctrl+H)'}
          aria-expanded={replacing}
          onClick={() => useFind.setState({ replacing: !replacing })}
        >
          {replacing ? '▾' : '▸'}
        </button>
        <input
          ref={input}
          value={query}
          placeholder="찾을 내용"
          aria-label="찾을 내용"
          onChange={(event) => useFind.setState({ query: event.target.value, current: 0 })}
          onKeyDown={onFindKey}
        />
        <span className="find-count">{searching ? count : ''}</span>
        <button className="icon-button" title="이전 (Shift+F3)" onClick={() => step(-1)}>
          ↑
        </button>
        <button className="icon-button" title="다음 (F3)" onClick={() => step(1)}>
          ↓
        </button>
        <button className="icon-button" title="닫기 (Esc)" onClick={close}>
          ×
        </button>
      </div>
      {replacing && (
        <div className="find-row">
          <span className="find-indent" />
          <input
            value={replacement}
            placeholder="바꿀 내용"
            aria-label="바꿀 내용"
            onChange={(event) => useFind.setState({ replacement: event.target.value })}
            onKeyDown={onReplaceKey}
          />
          {fieldTarget && (
            <button disabled={!fieldRanges.length} onClick={replaceOne}>
              바꾸기
            </button>
          )}
          <button
            disabled={fieldTarget ? !fieldRanges.length : !libraryCount || !libraryAllowed}
            onClick={() => void replaceEverywhere()}
          >
            모두 바꾸기
          </button>
        </div>
      )}
      <FindOptions
        scope={scope}
        fieldAvailable={Boolean(target?.isConnected)}
        itemAvailable={Boolean(place)}
        libraryAllowed={libraryAllowed}
        recordsAllowed={recordsAllowed}
      />
      {undo && undo.after === library && (
        <div className="find-undo">
          <span>{undo.count}개를 바꿨습니다.</span>
          <button onClick={undoReplace}>되돌리기</button>
        </div>
      )}
      {!fieldTarget && searching && (
        <FindResults
          hits={libraryHits}
          records={records}
          showRecords={showRecords}
          picked={picked}
          where={only ? '이 항목' : '라이브러리'}
          disabled={!libraryAllowed}
          onPick={openAt}
        />
      )}
    </div>
  );
}

function FindOptions(props: {
  scope: FindScope;
  fieldAvailable: boolean;
  itemAvailable: boolean;
  libraryAllowed: boolean;
  recordsAllowed: boolean;
}) {
  const wholeTag = useFind((state) => state.wholeTag);
  const names = useFind((state) => state.names);
  const includeRecords = useFind((state) => state.includeRecords);
  const { scope } = props;
  return (
    <div className="find-options">
      <span className="segmented" role="group" aria-label="찾을 범위">
        <button
          className={scope === 'field' ? 'active' : ''}
          disabled={!props.fieldAvailable || names}
          onClick={() => useFind.setState({ scope: 'field' })}
        >
          이 칸
        </button>
        <button
          className={scope === 'item' ? 'active' : ''}
          disabled={!props.itemAvailable || !props.libraryAllowed}
          onClick={() => useFind.setState({ scope: 'item' })}
        >
          이 항목
        </button>
        <button
          className={scope === 'library' ? 'active' : ''}
          disabled={!props.libraryAllowed}
          onClick={() => useFind.setState({ scope: 'library' })}
        >
          라이브러리 전체
        </button>
      </span>
      <label>
        <input
          type="checkbox"
          checked={wholeTag}
          disabled={names}
          onChange={(event) => useFind.setState({ wholeTag: event.target.checked, current: 0 })}
        />
        태그 단위
      </label>
      <label>
        <input
          type="checkbox"
          checked={names}
          onChange={(event) => useFind.setState({ names: event.target.checked })}
        />
        이름만
      </label>
      {props.recordsAllowed && (
        <label>
          <input
            type="checkbox"
            checked={includeRecords}
            onChange={(event) => useFind.setState({ includeRecords: event.target.checked })}
          />
          생성 기록 포함
        </label>
      )}
    </div>
  );
}

/** 라이브러리에서 찾은 곳 다음에 생성 기록이 이어지고, `picked`는 둘을 이은 순번이다. */
function FindResults(props: {
  hits: FindFieldHit[];
  records: RecordSearch;
  showRecords: boolean;
  picked: number;
  where: string;
  disabled: boolean;
  onPick: (index: number) => void;
}) {
  const projects = useStore((state) => state.library!.projects);
  const { hits, records } = props;
  const recordHits = records && records !== 'loading' ? records.hits : [];
  return (
    <fieldset className="find-results" disabled={props.disabled}>
      {hits.slice(0, SHOWN_HITS).map((hit, index) => (
        <button
          key={`${hit.section}:${hit.itemId}:${hit.path.join('/')}:${index}`}
          className={`find-hit ${props.picked === index ? 'picked' : ''}`}
          onClick={() => props.onPick(index)}
        >
          <span className="find-hit-path">
            {[sectionLabel(hit.section), ...hit.path].join(' › ')}
            {hit.ranges.length > 1 && <small>{hit.ranges.length}개</small>}
          </span>
          <Snippet text={hit.text} range={hit.ranges[0]} />
        </button>
      ))}
      {hits.length > SHOWN_HITS && <p className="hint">외 {hits.length - SHOWN_HITS}개 칸</p>}
      {!hits.length && <p className="hint">{props.where}에서 찾은 곳이 없습니다.</p>}
      {props.showRecords && (
        <>
          <div className="find-group">
            생성 기록
            {records && records !== 'loading' && <small>{records.total}개</small>}
          </div>
          {records === 'loading' && <p className="hint">찾는 중…</p>}
          {recordHits.map((hit, index) => {
            const order = hits.length + index;
            const project =
              hit.projectId === FREE_PROJECT_ID
                ? '자유 생성'
                : projects.find((item) => item.id === hit.projectId)?.name;
            return (
              <button
                key={`${hit.projectId}:${hit.id}`}
                className={`find-hit ${props.picked === order ? 'picked' : ''}`}
                onClick={() => props.onPick(order)}
              >
                <span className="find-hit-path">
                  {[project, hit.emotionName, hit.field].filter(Boolean).join(' › ')}
                  <small>{new Date(hit.createdAt).toLocaleString()}</small>
                </span>
                <Snippet text={hit.text} range={hit.range} />
              </button>
            );
          })}
          {records && records !== 'loading' && records.total > recordHits.length && (
            <p className="hint">최신 {recordHits.length}개</p>
          )}
          {records && records !== 'loading' && !records.total && (
            <p className="hint">생성 기록에서 찾은 곳이 없습니다.</p>
          )}
        </>
      )}
    </fieldset>
  );
}
