import { pieceRefRanges } from './PromptPieces';

export type FindQuery = {
  text: string;
  /** 쉼표·줄바꿈·`|`·괄호·`::`·`#`로 나뉜 태그 하나(또는 여러 개)와 통째로 같을 때만 */
  wholeTag: boolean;
};

export type TextRange = { start: number; end: number };

const SEPARATOR = String.raw`[,\n|{}\[\]#]|::`;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 태그 단위로 찾을 때 조각 참조(`<세트.조각>`)는 통째로, `세트.조각`, 세트 이름, 조각 이름도 태그로 본다. */
function pieceRefParts(text: string, ref: TextRange): TextRange[] {
  const inner = { start: ref.start + 1, end: ref.end - 1 };
  const dot = text.indexOf('.', inner.start);
  const trimmed = (start: number, end: number) => {
    const part = text.slice(start, end);
    const lead = part.length - part.trimStart().length;
    return { start: start + lead, end: start + lead + part.trim().length };
  };
  return [ref, inner, trimmed(inner.start, dot), trimmed(dot + 1, inner.end)];
}

/** 대소문자를 가리지 않는다. */
export function findRanges(text: string, query: FindQuery): TextRange[] {
  const needle = query.wholeTag ? query.text.trim() : query.text;
  if (!needle || !text) return [];
  // 태그 여럿을 찾을 때는 쉼표 앞뒤 공백을 가리지 않는다.
  const pattern = query.wholeTag
    ? `(?<=(?:^|${SEPARATOR})[ \\t]*)${needle
        .split(/\s*,\s*/)
        .map(escapeRegExp)
        .join('[ \\t]*,[ \\t]*')}(?=[ \\t]*(?:$|${SEPARATOR}))`
    : escapeRegExp(needle);
  const ranges = [...text.matchAll(new RegExp(pattern, 'gi'))].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  if (!query.wholeTag) return ranges;
  const lower = needle.toLowerCase();
  for (const ref of pieceRefRanges(text)) {
    const part = pieceRefParts(text, ref).find(
      (range) => text.slice(range.start, range.end).toLowerCase() === lower,
    );
    if (part && !ranges.some((range) => range.start < part.end && range.end > part.start))
      ranges.push(part);
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** 조각 참조의 일부만 바꾸면 참조가 끊기거나 다른 조각을 가리켜, 참조를 통째로 덮는 곳만 바꾼다. */
export function replaceableRanges(text: string, ranges: TextRange[]): TextRange[] {
  const refs = pieceRefRanges(text);
  return ranges.filter((range) =>
    refs.every(
      (ref) =>
        range.end <= ref.start ||
        range.start >= ref.end ||
        (range.start <= ref.start && range.end >= ref.end),
    ),
  );
}

/** 태그를 지우면 붙은 쉼표 하나도 함께 지운다. `floor` 앞은 앞의 찾은 곳이 이미 고쳤다. */
export function editRange(
  text: string,
  range: TextRange,
  replacement: string,
  wholeTag: boolean,
  floor = 0,
): TextRange {
  if (!wholeTag || replacement.trim()) return range;
  // 앞 쉼표를 먼저 지워야 이어진 태그를 모두 지워도 끝에 쉼표가 남지 않는다.
  const before = /[ \t]*,[ \t]*$/.exec(text.slice(floor, range.start));
  if (before) return { start: range.start - before[0].length, end: range.end };
  const after = /^[ \t]*,[ \t]*/.exec(text.slice(range.end));
  return after ? { start: range.start, end: range.end + after[0].length } : range;
}

export function replaceRanges(
  text: string,
  ranges: TextRange[],
  replacement: string,
  wholeTag: boolean,
): string {
  let result = '';
  let cursor = 0;
  for (const range of ranges) {
    const { start, end } = editRange(text, range, replacement, wholeTag, cursor);
    result += text.slice(cursor, start) + (wholeTag ? replacement.trim() : replacement);
    cursor = end;
  }
  return result + text.slice(cursor);
}

export function replaceAll(text: string, query: FindQuery, replacement: string): string {
  const ranges = replaceableRanges(text, findRanges(text, query));
  return ranges.length ? replaceRanges(text, ranges, replacement, query.wholeTag) : text;
}

export function snippetAround(
  text: string,
  range: TextRange,
  radius = 28,
): { before: string; match: string; after: string } {
  const from = Math.max(0, range.start - radius);
  const to = Math.min(text.length, range.end + radius);
  const flat = (value: string) => value.replace(/\s*\n\s*/g, ' ⏎ ');
  return {
    before: (from > 0 ? '…' : '') + flat(text.slice(from, range.start)),
    match: flat(text.slice(range.start, range.end)),
    after: flat(text.slice(range.end, to)) + (to < text.length ? '…' : ''),
  };
}
