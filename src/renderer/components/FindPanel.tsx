import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { FREE_PROJECT_ID } from '../../core/model/defaults';
import {
  findInLibrary,
  replaceInLibrary,
  type FindFieldHit,
  type GenerationFindHit,
} from '../../core/model/promptFields';
import {
  editRange,
  findRanges,
  replaceAll,
  snippetAround,
  type TextRange,
} from '../../core/prompts/PromptFind';
import type { GenerationFindResult } from '../../shared/ipc';
import { libraryApi } from '../desktop';
import { closeFind, findPlaceOf, findQuery, useFind } from '../find';
import { SECTIONS } from '../sections';
import {
  errorMessage,
  openEmotion,
  openFree,
  openLibrary,
  openProject,
  requestResult,
  toast,
  updateLibrary,
  useStore,
} from '../store';
import { confirmDialog, useDialogs } from './dialogStack';

/** 이보다 많으면 목록 끝에 남은 수만 적는다. */
const SHOWN_HITS = 300;

/** execCommand여야 Ctrl+Z로 되돌릴 수 있다. */
function insertText(textarea: HTMLTextAreaElement, start: number, end: number, text: string) {
  if (start === end && !text) return;
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const done = text
    ? document.execCommand('insertText', false, text)
    : document.execCommand('delete');
  if (done) return;
  const value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
    textarea,
    value,
  );
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

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

/** 옮겨 간 화면이 그려진 뒤 그 이름 칸에 커서를 두고 찾은 글자를 고른다. */
function revealName(text: string, range: TextRange, tries = 10) {
  requestAnimationFrame(() => {
    const input = [...document.querySelectorAll<HTMLInputElement>('.main-area input')].find(
      (item) => item.value === text,
    );
    if (!input) {
      if (tries > 1) revealName(text, range, tries - 1);
      return;
    }
    input.scrollIntoView({ block: 'center' });
    input.focus();
    input.setSelectionRange(range.start, range.end);
  });
}

function sectionLabel(section: FindFieldHit['section']): string {
  if (section === 'free') return '자유 생성';
  return SECTIONS.find((item) => item.id === section)?.label ?? '';
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
  const [fieldText, setFieldText] = useState(target?.value ?? '');
  const [picked, setPicked] = useState(-1);
  const [records, setRecords] = useState<GenerationFindResult | 'loading'>();

  // 화면을 옮기면 「이 칸」의 입력칸이 사라질 수 있다.
  const fieldTarget = find.scope === 'field' && !names && target?.isConnected ? target : undefined;
  const libraryAllowed = !dialogOpen && !settingsOpen;
  const place = useMemo(() => findPlaceOf(view, library), [view, library]);
  const only = !fieldTarget && find.scope !== 'library' ? place : undefined;
  const scope = fieldTarget ? 'field' : only ? 'item' : 'library';
  const findTarget = names ? 'names' : 'prompts';
  const searching = query.trim().length > 0;
  const projectIds = library.projects.map((project) => project.id).join('\n');

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [find.opened]);

  useEffect(() => {
    if (!target) return;
    const sync = () => setFieldText(target.value);
    sync();
    target.addEventListener('input', sync);
    return () => target.removeEventListener('input', sync);
  }, [target, library]);

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
  const recordHits = records && records !== 'loading' ? records.hits : [];

  useEffect(() => setPicked(-1), [query, wholeTag, scope, names]);

  useEffect(() => {
    if (scope !== 'library' || names || !includeRecords || !searching) {
      setRecords(undefined);
      return;
    }
    setRecords('loading');
    let alive = true;
    const timer = setTimeout(() => {
      libraryApi()
        .findGenerations({
          projectIds: [...projectIds.split('\n').filter(Boolean), FREE_PROJECT_ID],
          query: { text: query, wholeTag },
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
  }, [scope, names, includeRecords, searching, query, wholeTag, projectIds]);

  const openHit = (hit: FindFieldHit) => {
    if (hit.section === 'free') openFree();
    else openLibrary(hit.section, hit.itemId);
    if (names) revealName(hit.text, hit.ranges[0]);
    else useFind.setState({ reveal: hit.text });
  };

  const openRecord = (hit: GenerationFindHit) => {
    if (hit.projectId === FREE_PROJECT_ID) openFree();
    else {
      const project = library.projects.find((item) => item.id === hit.projectId);
      const emotions =
        library.emotionSets.find((set) => set.id === project?.emotionSetId)?.emotions ?? [];
      if (!project) return;
      openProject(project.id);
      if (!emotions.some((emotion) => emotion.id === hit.emotionId)) {
        toast(`「${hit.emotionName}」 씬이 지금 씬 모음에 없어 결과를 열 수 없습니다.`);
        return;
      }
      openEmotion(hit.emotionId);
    }
    requestResult({ projectId: hit.projectId, id: hit.id });
  };

  const step = (direction: 1 | -1) => {
    if (fieldTarget) {
      const count = fieldRanges.length;
      if (count) useFind.setState({ current: (current + direction + count) % count });
      return;
    }
    const count = libraryHits.length + recordHits.length;
    if (!count || !libraryAllowed) return;
    const next = picked < 0 && direction < 0 ? count - 1 : (picked + direction + count) % count;
    setPicked(next);
    if (next < libraryHits.length) openHit(libraryHits[next]);
    else openRecord(recordHits[next - libraryHits.length]);
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
        shown ? `「${shown}」(으)로 바꿉니다` : '지웁니다'
      }. ${names ? '바꾸면 비게 되는 이름은 그대로 둡니다.' : '생성 기록은 바꾸지 않습니다.'}`,
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
            placeholder={wholeTag && !names ? '바꿀 내용 (비우면 태그를 지웁니다)' : '바꿀 내용'}
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
      <div className="find-options">
        <span className="segmented" role="group" aria-label="찾을 범위">
          <button
            className={scope === 'field' ? 'active' : ''}
            disabled={!target?.isConnected || names}
            title={
              target?.isConnected ? undefined : '프롬프트 칸에서 Ctrl+F를 누르면 고를 수 있습니다'
            }
            onClick={() => useFind.setState({ scope: 'field' })}
          >
            이 칸
          </button>
          <button
            className={scope === 'item' ? 'active' : ''}
            disabled={!place || !libraryAllowed}
            title={place ? undefined : '라이브러리 항목이나 자유 생성 화면을 열면 고를 수 있습니다'}
            onClick={() => useFind.setState({ scope: 'item' })}
          >
            이 항목
          </button>
          <button
            className={scope === 'library' ? 'active' : ''}
            disabled={!libraryAllowed}
            title={libraryAllowed ? undefined : '열린 창을 닫으면 고를 수 있습니다'}
            onClick={() => useFind.setState({ scope: 'library' })}
          >
            라이브러리 전체
          </button>
        </span>
        <label title="쉼표로 나뉜 태그와 통째로 같을 때만 찾습니다. 끄면 글자가 들어 있는 곳을 모두 찾습니다">
          <input
            type="checkbox"
            checked={wholeTag}
            disabled={names}
            onChange={(event) => useFind.setState({ wholeTag: event.target.checked, current: 0 })}
          />
          태그 단위
        </label>
        <label title="프롬프트 대신 항목·프롬프트 세트·씬·조각 이름에서 찾고 바꿉니다. 이름은 글자가 들어 있으면 찾습니다">
          <input
            type="checkbox"
            checked={names}
            onChange={(event) => useFind.setState({ names: event.target.checked })}
          />
          이름만
        </label>
        {scope === 'library' && !names && (
          <label title="이미 만든 결과의 프롬프트에서도 찾습니다. 바꾸지는 않습니다">
            <input
              type="checkbox"
              checked={includeRecords}
              onChange={(event) => useFind.setState({ includeRecords: event.target.checked })}
            />
            생성 기록 포함
          </label>
        )}
      </div>
      {undo && undo.after === library && (
        <div className="find-undo">
          <span>{undo.count}개를 바꿨습니다.</span>
          <button onClick={undoReplace}>되돌리기</button>
        </div>
      )}
      {!fieldTarget && searching && (
        <fieldset className="find-results" disabled={!libraryAllowed}>
          {libraryHits.slice(0, SHOWN_HITS).map((hit, index) => (
            <button
              key={`${hit.section}:${hit.itemId}:${hit.path.join('/')}:${index}`}
              className={`find-hit ${picked === index ? 'picked' : ''}`}
              onClick={() => {
                setPicked(index);
                openHit(hit);
              }}
            >
              <span className="find-hit-path">
                {[sectionLabel(hit.section), ...hit.path].join(' › ')}
                {hit.ranges.length > 1 && <small>{hit.ranges.length}개</small>}
              </span>
              <Snippet text={hit.text} range={hit.ranges[0]} />
            </button>
          ))}
          {libraryHits.length > SHOWN_HITS && (
            <p className="hint">외 {libraryHits.length - SHOWN_HITS}개 칸</p>
          )}
          {!libraryHits.length && (
            <p className="hint">{only ? '이 항목' : '라이브러리'}에서 찾은 곳이 없습니다.</p>
          )}
          {scope === 'library' && !names && includeRecords && (
            <>
              <div className="find-group">
                생성 기록
                {records && records !== 'loading' && <small>{records.total}개</small>}
              </div>
              {records === 'loading' && <p className="hint">찾는 중…</p>}
              {recordHits.map((hit, index) => {
                const order = libraryHits.length + index;
                const project =
                  hit.projectId === FREE_PROJECT_ID
                    ? '자유 생성'
                    : library.projects.find((item) => item.id === hit.projectId)?.name;
                return (
                  <button
                    key={`${hit.projectId}:${hit.id}`}
                    className={`find-hit ${picked === order ? 'picked' : ''}`}
                    onClick={() => {
                      setPicked(order);
                      openRecord(hit);
                    }}
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
                <p className="hint">최신 {recordHits.length}개만 보여 줍니다.</p>
              )}
              {records && records !== 'loading' && !records.total && (
                <p className="hint">생성 기록에서 찾은 곳이 없습니다.</p>
              )}
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}
