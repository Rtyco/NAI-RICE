import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import {
  analyzePrompt,
  weightAt,
  type SyntaxReport,
  type SyntaxToken,
} from '../../core/prompts/PromptSyntax';
import {
  formatTagCount,
  normalizeTagQuery,
  separatorAfter,
  tagQueryAt,
  tagText,
  type TagMatch,
  type TagQuery,
} from '../../core/prompts/TagSearch';
import { findRanges, type TextRange } from '../../core/prompts/PromptFind';
import { useFind } from '../find';
import { useStore } from '../store';
import { searchTags, warmTagIndex } from '../tagDictionary';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** false면 `|` 자리를 채우지 않는 칸이라 보내지 않는 글자로 보인다. */
  markers?: boolean;
};

/** 배경 레이어가 따라 해야 하는 스타일 */
const MIRRORED = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRadius',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
] as const;

const layersOf = new WeakMap<Element, () => Array<HTMLElement | null>>();
let layerObserver: ResizeObserver | undefined;

/** 칸마다 읽고 쓰면 칸 수만큼 스타일을 다시 계산한다. 씬 40개 편집기를 열 때 그 비용이 컸다. */
function mirrorLayers(textareas: Element[]): void {
  const reads = textareas.map((textarea) => {
    const style = getComputedStyle(textarea);
    return {
      layers: layersOf.get(textarea)?.() ?? [],
      values: MIRRORED.map((key) => style[key]),
      scrollTop: textarea.scrollTop,
    };
  });
  for (const { layers, values, scrollTop } of reads)
    for (const layer of layers) {
      if (!layer) continue;
      MIRRORED.forEach((key, index) => (layer.style[key] = values[index]));
      layer.scrollTop = scrollTop;
    }
}

/** 처음 관찰할 때도 알려 주므로 칠하기 전에 맞춰지고, 화면 밖 행은 보일 때 맞춘다. */
function observeLayers(textarea: Element, layers: () => Array<HTMLElement | null>): () => void {
  layerObserver ??= new ResizeObserver((entries) =>
    mirrorLayers(entries.map((entry) => entry.target)),
  );
  layersOf.set(textarea, layers);
  layerObserver.observe(textarea);
  return () => layerObserver?.unobserve(textarea);
}

/** 새로 관찰하면 처음처럼 알려 줘 새 레이어를 다른 칸과 함께 맞춘다. Chromium은 관찰 중인 요소의 `observe`를 무시한다. */
function refreshLayers(textarea: Element): void {
  layerObserver?.unobserve(textarea);
  layerObserver?.observe(textarea);
}

function tokenClass(token: SyntaxToken, matched: boolean): string {
  const names = [`syn-${token.kind}`];
  if (token.depth !== undefined) names.push(`syn-d${token.depth % 3}`);
  if (token.problem) names.push(`syn-${token.problem}`);
  if (matched) names.push('syn-match');
  return names.join(' ');
}

/** 짝이 없는 괄호는 영역이 아니고, 닫지 않은 가중치는 끝까지 간다. */
function regionClass(report: SyntaxReport, index: number): string | undefined {
  const token = report.tokens[index];
  if (token.kind !== 'brace' && token.kind !== 'bracket' && token.kind !== 'weight') return;
  const close = token.pair === undefined ? undefined : report.tokens[token.pair];
  if (close ? close.start < token.start : token.kind !== 'weight') return;
  const kind = token.kind === 'weight' && token.value! < 1 ? 'weaken' : token.kind;
  return `syn-region syn-r-${kind} syn-r${(token.depth ?? 0) % 3}`;
}

/** 영역이 스택처럼 중첩되어(`::`는 여럿을 닫는다) span도 중첩되고, 반투명 배경이 겹쳐 안쪽일수록 진하다. */
function renderHighlights(text: string, report: SyntaxReport, matched: Set<number>): ReactNode[] {
  const root: ReactNode[] = [];
  const frames: Array<{ nodes: ReactNode[]; className: string; key: number; closer?: number }> = [];
  const top = () => frames.at(-1)?.nodes ?? root;
  const closeFrame = () => {
    const frame = frames.pop()!;
    top().push(
      <span key={`r${frame.key}`} className={frame.className}>
        {frame.nodes}
      </span>,
    );
  };
  let cursor = 0;
  report.tokens.forEach((token, index) => {
    if (token.start > cursor) top().push(text.slice(cursor, token.start));
    const region = regionClass(report, index);
    if (region) frames.push({ nodes: [], className: region, key: index, closer: token.pair });
    top().push(
      <span key={index} className={tokenClass(token, matched.has(index))}>
        {text.slice(token.start, token.end)}
      </span>,
    );
    while (frames.length && frames.at(-1)!.closer === index) closeFrame();
    cursor = token.end;
  });
  top().push(text.slice(cursor));
  while (frames.length) closeFrame();
  // 마지막 줄바꿈 뒤 빈 줄도 높이를 차지하도록.
  root.push(' ');
  return root;
}

function renderFindMarks(text: string, ranges: TextRange[], current: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark key={index} className={`find-mark ${index === current ? 'current' : ''}`}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  nodes.push(text.slice(cursor), ' ');
  return nodes;
}

function scrollToMark(textarea: HTMLTextAreaElement, layer: HTMLElement, mark: HTMLElement): void {
  const top = mark.offsetTop;
  if (
    top >= textarea.scrollTop &&
    top + mark.offsetHeight <= textarea.scrollTop + textarea.clientHeight
  )
    return;
  textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
  layer.scrollTop = textarea.scrollTop;
}

function pointAt(layer: HTMLElement, offset: number): DOMRect | null {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      return range.getClientRects()[0] ?? range.getBoundingClientRect();
    }
    remaining -= length;
  }
  return null;
}

type Suggestions = { query: TagQuery; caret: number; matches: TagMatch[]; active: number };

const CATEGORY_LABELS: Record<number, string> = {
  0: '일반',
  1: '작가',
  3: '작품',
  4: '캐릭터',
  5: '메타',
};

/** 입력칸 밖으로 넘쳐도 잘리지 않게 body에 띄운다. */
function TagSuggestions({
  layer,
  suggestions,
  onPick,
  onHover,
}: {
  layer: HTMLElement | null;
  suggestions: Suggestions;
  onPick: (match: TagMatch) => void;
  onHover: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    const point = layer ? pointAt(layer, suggestions.query.start) : null;
    if (!box || !point) return setPosition(null);
    const { width, height } = box.getBoundingClientRect();
    const below = point.bottom + 4;
    setPosition({
      left: Math.max(8, Math.min(point.left - 8, window.innerWidth - width - 8)),
      top: below + height > window.innerHeight - 8 ? Math.max(8, point.top - height - 4) : below,
    });
  }, [layer, suggestions.query.start, suggestions.matches]);

  useLayoutEffect(() => {
    ref.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [suggestions.active]);

  return createPortal(
    <div
      ref={ref}
      className="tag-suggest"
      role="listbox"
      style={position ?? { left: -9999, top: -9999 }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {suggestions.matches.map((match, index) => (
        <div
          key={match.tag.name + match.tag.category}
          role="option"
          aria-selected={index === suggestions.active}
          className={`tag-suggest-item tag-cat-${match.tag.category} ${index === suggestions.active ? 'active' : ''}`}
          title={CATEGORY_LABELS[match.tag.category]}
          onMouseMove={() => index !== suggestions.active && onHover(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(match);
          }}
        >
          <span className="tag-suggest-name">
            {tagText(match.tag)}
            {match.alias && <small> ← {match.alias}</small>}
          </span>
          <small className="tag-suggest-count">{formatTagCount(match.tag.count)}</small>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function matchedAt(report: SyntaxReport, caret: number | null): Set<number> {
  const matched = new Set<number>();
  if (caret === null) return matched;
  report.tokens.forEach((token, index) => {
    if (token.pair === undefined || (caret !== token.start && caret !== token.end)) return;
    if (!['brace', 'bracket', 'weight', 'close-all', 'choice'].includes(token.kind)) return;
    matched.add(index);
    matched.add(token.pair);
  });
  return matched;
}

/** 글자는 뒤의 레이어가 그리고 textarea는 글자를 투명하게 해 커서·선택만 보인다. */
export function PromptTextarea({
  value,
  onChange,
  markers = true,
  className,
  onScroll,
  onSelect,
  ...rest
}: Props) {
  const pieceSets = useStore((state) => state.library!.pieceSets);
  const autocomplete = useStore((state) => state.library!.settings.tagAutocomplete);
  const area = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const findLayer = useRef<HTMLDivElement>(null);
  const findText = useFind((state) =>
    state.open &&
    !state.names &&
    (state.scope !== 'field' || (state.target && state.target === area.current))
      ? state.query
      : '',
  );
  const wholeTag = useFind((state) => state.wholeTag);
  const findCurrent = useFind((state) =>
    state.scope === 'field' && state.target && state.target === area.current ? state.current : -1,
  );
  const reveal = useFind((state) => state.reveal);
  const [caret, setCaret] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  /** 늦게 도착한 검색 결과를 버린다. */
  const request = useRef(0);
  const inserting = useRef(false);

  const closeSuggestions = () => {
    request.current++;
    setSuggestions(null);
  };

  const suggestFor = (text: string, position: number) => {
    const id = ++request.current;
    const query = autocomplete ? tagQueryAt(text, position) : null;
    if (!query || normalizeTagQuery(query.text).replace(/^artist:\s*/, '').length < 2) {
      setSuggestions(null);
      return;
    }
    void searchTags(query.text)
      .then((matches) => {
        if (id !== request.current) return;
        setSuggestions(matches.length ? { query, caret: position, matches, active: 0 } : null);
      })
      .catch(() => setSuggestions(null));
  };

  const pick = (match: TagMatch) => {
    const textarea = area.current;
    if (!textarea || !suggestions) return;
    const { start, end } = suggestions.query;
    const insert = tagText(match.tag) + separatorAfter(textarea.value, end);
    closeSuggestions();
    textarea.focus();
    textarea.setSelectionRange(start, end);
    inserting.current = true;
    // execCommand여야 Ctrl+Z로 되돌릴 수 있다.
    const done = document.execCommand('insertText', false, insert);
    inserting.current = false;
    if (!done) {
      onChange(textarea.value.slice(0, start) + insert + textarea.value.slice(end));
      requestAnimationFrame(() =>
        textarea.setSelectionRange(start + insert.length, start + insert.length),
      );
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions && !event.nativeEvent.isComposing) {
      const count = suggestions.matches.length;
      const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      if (plain && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setSuggestions({ ...suggestions, active: (suggestions.active + step + count) % count });
        return;
      }
      if (plain && (event.key === 'Enter' || event.key === 'Tab')) {
        event.preventDefault();
        pick(suggestions.matches[suggestions.active]);
        return;
      }
      if (event.key === 'Escape') {
        // 열린 창이 함께 닫히지 않게
        event.preventDefault();
        event.stopPropagation();
        closeSuggestions();
        return;
      }
    }
    rest.onKeyDown?.(event);
  };

  const report = useMemo(() => {
    const result = analyzePrompt(value, (setName, pieceName) =>
      pieceSets.some(
        (set) =>
          set.name.trim() === setName &&
          set.pieces.some((piece) => piece.name.trim() === pieceName),
      ),
    );
    if (markers) return result;
    const tokens = result.tokens.map((token) =>
      token.kind === 'marker' ? { ...token, kind: 'comment' as const } : token,
    );
    return { ...result, tokens };
  }, [value, pieceSets, markers]);
  const marks = useMemo(
    () => (findText ? findRanges(value, { text: findText, wholeTag }) : []),
    [value, findText, wholeTag],
  );
  const matched = matchedAt(report, caret);
  const weight = caret === null ? 1 : weightAt(report, caret);

  useLayoutEffect(() => {
    const textarea = area.current;
    if (!textarea) return;
    return observeLayers(textarea, () => [backdrop.current, findLayer.current]);
  }, []);

  // 찾기 레이어는 찾은 곳이 있을 때만 생긴다.
  const finding = marks.length > 0;
  useLayoutEffect(() => {
    if (finding && area.current) refreshLayers(area.current);
  }, [finding]);

  useLayoutEffect(() => {
    if (!area.current) return;
    if (backdrop.current) backdrop.current.scrollTop = area.current.scrollTop;
    if (findLayer.current) findLayer.current.scrollTop = area.current.scrollTop;
  }, [value]);

  useLayoutEffect(() => {
    const textarea = area.current;
    const layer = findLayer.current;
    const mark = layer?.querySelector<HTMLElement>('.find-mark.current');
    if (!textarea || !layer || !mark) return;
    scrollToMark(textarea, layer, mark);
    textarea.closest('.syntax-field')?.scrollIntoView({ block: 'nearest' });
  }, [findCurrent, marks]);

  useLayoutEffect(() => {
    const textarea = area.current;
    const layer = findLayer.current;
    const mark = layer?.querySelector<HTMLElement>('.find-mark');
    if (reveal === undefined || reveal !== value || !textarea || !layer || !mark) return;
    useFind.setState({ reveal: undefined });
    textarea.closest('.syntax-field')?.scrollIntoView({ block: 'center' });
    scrollToMark(textarea, layer, mark);
  }, [reveal, value, marks]);

  const jump = (start: number) => {
    const textarea = area.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(start, start + 1);
    setCaret(start);
  };
  const shown = [...report.issues]
    .sort((a, b) => (a.level === b.level ? a.start - b.start : a.level === 'error' ? -1 : 1))
    .slice(0, 3);

  return (
    <div className="syntax-field">
      <div className="syntax-editor">
        <div ref={backdrop} className="syntax-backdrop" aria-hidden>
          {renderHighlights(value, report, matched)}
        </div>
        {finding && (
          <div ref={findLayer} className="syntax-backdrop find-layer" aria-hidden>
            {renderFindMarks(value, marks, findCurrent)}
          </div>
        )}
        <textarea
          {...rest}
          ref={area}
          className={`syntax-input ${className ?? ''}`}
          value={value}
          spellCheck={false}
          onChange={(event) => {
            const { value: next, selectionStart, selectionEnd } = event.target;
            onChange(next);
            setCaret(selectionStart);
            if (inserting.current || selectionStart !== selectionEnd) closeSuggestions();
            else suggestFor(next, selectionStart);
          }}
          onSelect={(event) => {
            const target = event.currentTarget;
            setCaret(target.selectionStart === target.selectionEnd ? target.selectionStart : null);
            // 방향키·클릭으로 커서가 옮겨지면 닫는다.
            if (
              suggestions &&
              (target.selectionStart !== target.selectionEnd ||
                target.selectionStart !== suggestions.caret)
            )
              closeSuggestions();
            onSelect?.(event);
          }}
          onFocus={(event) => {
            if (autocomplete) warmTagIndex();
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setCaret(null);
            closeSuggestions();
            rest.onBlur?.(event);
          }}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            if (backdrop.current) backdrop.current.scrollTop = event.currentTarget.scrollTop;
            if (findLayer.current) findLayer.current.scrollTop = event.currentTarget.scrollTop;
            onScroll?.(event);
          }}
        />
        {suggestions && (
          <TagSuggestions
            layer={backdrop.current}
            suggestions={suggestions}
            onPick={pick}
            onHover={(active) => setSuggestions({ ...suggestions, active })}
          />
        )}
      </div>
      {(shown.length > 0 || Math.abs(weight - 1) > 1e-9) && (
        <div className="syntax-status">
          {shown.map((issue) => (
            <button
              key={`${issue.start}-${issue.message}`}
              type="button"
              className={`syntax-issue ${issue.level}`}
              title="눌러서 위치로 이동"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => jump(issue.start)}
            >
              {issue.message}
            </button>
          ))}
          {report.issues.length > shown.length && (
            <span className="syntax-more">외 {report.issues.length - shown.length}개</span>
          )}
          {Math.abs(weight - 1) > 1e-9 && (
            <span className="syntax-weight">커서 위치 ×{weight.toFixed(2)}</span>
          )}
        </div>
      )}
    </div>
  );
}
