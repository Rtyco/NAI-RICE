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
import { useLibrary } from '../store';
import { loadTagIndex } from '../tagDictionary';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

/** 배경 레이어가 따라 해야 하는 textarea 스타일. */
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

function tokenClass(token: SyntaxToken, matched: boolean): string {
  const names = [`syn-${token.kind}`];
  if (token.depth !== undefined) names.push(`syn-d${token.depth % 3}`);
  if (token.problem) names.push(`syn-${token.problem}`);
  if (matched) names.push('syn-match');
  return names.join(' ');
}

function renderHighlights(text: string, report: SyntaxReport, matched: Set<number>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  report.tokens.forEach((token, index) => {
    if (token.start > cursor) nodes.push(text.slice(cursor, token.start));
    nodes.push(
      <span key={index} className={tokenClass(token, matched.has(index))}>
        {text.slice(token.start, token.end)}
      </span>,
    );
    cursor = token.end;
  });
  // 마지막 줄바꿈 뒤의 빈 줄도 높이를 차지하도록 공백 하나를 붙인다.
  nodes.push(`${text.slice(cursor)} `);
  return nodes;
}

/** 배경 레이어에서 글자 위치 offset의 화면 좌표. */
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

/** 태그 후보 목록. 입력칸 밖으로 넘쳐도 잘리지 않게 body에 띄운다. */
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

/** 커서 바로 앞이나 뒤의 괄호·가중치와 그 짝. */
function matchedAt(report: SyntaxReport, caret: number | null): Set<number> {
  const matched = new Set<number>();
  if (caret === null) return matched;
  report.tokens.forEach((token, index) => {
    if (token.pair === undefined || (caret !== token.start && caret !== token.end)) return;
    if (!['brace', 'bracket', 'weight', 'close-all'].includes(token.kind)) return;
    matched.add(index);
    matched.add(token.pair);
  });
  return matched;
}

/**
 * NovelAI 문법 강조 표시가 있는 프롬프트 입력칸. 글자는 뒤에 깔린 레이어가 그리고
 * textarea는 글자를 투명하게 해 커서·선택만 보여 준다.
 */
export function PromptTextarea({ value, onChange, className, onScroll, onSelect, ...rest }: Props) {
  const library = useLibrary();
  const pieceSets = library.pieceSets;
  const autocomplete = library.settings.tagAutocomplete;
  const area = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  /** 늦게 도착한 검색 결과를 버리기 위한 번호. */
  const request = useRef(0);
  /** 태그를 넣은 직후의 입력으로는 후보를 다시 띄우지 않는다. */
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
    void loadTagIndex()
      .then((index) => {
        if (id !== request.current) return;
        const matches = index.search(query.text);
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
    // execCommand로 넣어야 Ctrl+Z로 되돌릴 수 있다.
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
        // 열린 창이 함께 닫히지 않게 한다.
        event.preventDefault();
        event.stopPropagation();
        closeSuggestions();
        return;
      }
    }
    rest.onKeyDown?.(event);
  };

  const report = useMemo(
    () =>
      analyzePrompt(value, (setName, pieceName) =>
        pieceSets.some(
          (set) =>
            set.name.trim() === setName &&
            set.pieces.some((piece) => piece.name.trim() === pieceName),
        ),
      ),
    [value, pieceSets],
  );
  const matched = matchedAt(report, caret);
  const weight = caret === null ? 1 : weightAt(report, caret);

  useLayoutEffect(() => {
    const textarea = area.current;
    const layer = backdrop.current;
    if (!textarea || !layer) return;
    const sync = () => {
      const style = getComputedStyle(textarea);
      for (const key of MIRRORED) layer.style[key] = style[key];
      layer.style.top = `${textarea.offsetTop}px`;
      layer.style.left = `${textarea.offsetLeft}px`;
      layer.style.width = `${textarea.offsetWidth}px`;
      layer.style.height = `${textarea.offsetHeight}px`;
      layer.scrollTop = textarea.scrollTop;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (backdrop.current && area.current) backdrop.current.scrollTop = area.current.scrollTop;
  }, [value]);

  const jump = (start: number) => {
    const textarea = area.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(start, start + 1);
    setCaret(start);
  };
  // 오류를 경고보다 먼저 보여 준다.
  const shown = [...report.issues]
    .sort((a, b) => (a.level === b.level ? a.start - b.start : a.level === 'error' ? -1 : 1))
    .slice(0, 3);

  return (
    <div className="syntax-field">
      <div className="syntax-editor">
        <div ref={backdrop} className="syntax-backdrop" aria-hidden>
          {renderHighlights(value, report, matched)}
        </div>
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
            // 입력이 아니라 방향키·클릭으로 커서가 옮겨지면 후보를 닫는다.
            if (
              suggestions &&
              (target.selectionStart !== target.selectionEnd ||
                target.selectionStart !== suggestions.caret)
            )
              closeSuggestions();
            onSelect?.(event);
          }}
          onFocus={(event) => {
            if (autocomplete) void loadTagIndex().catch(() => undefined);
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
