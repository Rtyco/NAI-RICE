import type { PieceSet, PromptPiece } from '../domain/types';

/** SDStudio와 같은 문법. 세트 이름에는 점을 쓸 수 없고, 조각 이름은 첫 점 뒤 전부다. */
const PIECE_REF = /<([^<>.\n]+)\.([^<>\n]+)>/g;
const MAX_DEPTH = 8;

export function pieceRef(setName: string, pieceName: string): string {
  return `<${setName}.${pieceName}>`;
}

export type PieceExpansion = {
  text: string;
  /** 찾지 못했거나 순환하는 참조. 원문 그대로 남는다. */
  missing: string[];
};

/** 32비트 FNV-1a */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result;
}

function lines(prompt: string): string[] {
  return prompt.split('\n').map((line) => line.trim().replace(/^[,\s]+|[,\s]+$/g, ''));
}

/** SDStudio 주석. 여러 줄·쉼표를 넘을 수 있고, 짝 없는 `##`는 글자 그대로다. */
const COMMENT = /##[\s\S]*?##[ \t]*/g;

export function stripComments(text: string): string {
  return text.replace(COMMENT, '');
}

/** 여러 줄이면 쉼표로 잇고, multi면 seed로 한 줄을 고른다(seed가 없으면 첫 줄). SDStudio처럼 빈 줄도 후보다. */
export function pieceText(piece: PromptPiece, key: string, seed?: number): string {
  const options = lines(stripComments(piece.prompt));
  if (!piece.multi) return options.filter(Boolean).join(', ');
  if (seed === undefined || options.length === 1) return options[0];
  return options[hash(`${seed}:${key}`) % options.length];
}

/** `{` 위치에서 짝 `}`와 그 바로 안쪽의 `|` 위치. 닫히지 않았으면 undefined. */
function choiceAt(text: string, open: number): { close: number; pipes: number[] } | undefined {
  const pipes: number[] = [];
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return { close: index, pipes };
    else if (char === '|' && depth === 1) pipes.push(index);
  }
  return undefined;
}

/**
 * SDStudio `{a|b}`: 바로 안쪽에 `|`가 있는 중괄호만 후보 하나로 바뀐다(없으면 NovelAI 강조 그대로).
 * SDStudio는 매번 무작위지만 여기서는 seed로 골라 같은 seed면 같은 결과다(seed가 없으면 첫 후보).
 */
export function resolveChoices(text: string, seed?: number): string {
  let count = 0;
  const resolve = (value: string): string => {
    let result = '';
    for (let index = 0; index < value.length; index += 1) {
      const found = value[index] === '{' ? choiceAt(value, index) : undefined;
      if (!found) {
        result += value[index];
        continue;
      }
      const inner = value.slice(index + 1, found.close);
      if (!found.pipes.length) {
        result += `{${resolve(inner)}}`;
      } else {
        const cuts = [index, ...found.pipes, found.close];
        const options = cuts.slice(1).map((end, at) => value.slice(cuts[at] + 1, end).trim());
        const picked =
          seed === undefined ? 0 : hash(`${seed}:${options.join('|')}:${count}`) % options.length;
        count += 1;
        result += resolve(options[picked]);
      }
      index = found.close;
    }
    return result;
  };
  return resolve(text);
}

function tidyCommas(text: string): string {
  return text
    .replace(/,(\s*,)+/g, ',')
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '');
}

/** 주석을 지우고 조각(안의 참조까지)을 펼친 뒤 `{a|b}`를 고른다. */
export function expandPieces(text: string, sets: PieceSet[], seed?: number): PieceExpansion {
  const missing = new Set<string>();
  const find = (setName: string, pieceName: string) =>
    sets
      .find((set) => set.name.trim() === setName.trim())
      ?.pieces.find((piece) => piece.name.trim() === pieceName.trim());

  const expand = (value: string, stack: string[]): string =>
    value.replace(PIECE_REF, (whole, setName: string, pieceName: string) => {
      const key = `${setName.trim()}.${pieceName.trim()}`;
      const piece = find(setName, pieceName);
      if (!piece || stack.includes(key) || stack.length >= MAX_DEPTH) {
        missing.add(whole);
        return whole;
      }
      return expand(pieceText(piece, key, seed), [...stack, key]);
    });

  const expanded = resolveChoices(expand(stripComments(text), []), seed);
  return { text: expanded === text ? text : tidyCommas(expanded), missing: [...missing] };
}

export function pieceRefRanges(text: string): Array<{ start: number; end: number }> {
  return [...text.matchAll(PIECE_REF)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function pieceRefsIn(text: string): Array<{ setName: string; pieceName: string }> {
  const seen = new Set<string>();
  const refs: Array<{ setName: string; pieceName: string }> = [];
  for (const match of text.matchAll(PIECE_REF)) {
    const key = `${match[1].trim()}.${match[2].trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ setName: match[1].trim(), pieceName: match[2].trim() });
  }
  return refs;
}

export function renamePieceRefs(
  text: string,
  from: { setName: string; pieceName?: string },
  to: { setName: string; pieceName?: string },
): string {
  return text.replace(PIECE_REF, (whole, setName: string, pieceName: string) => {
    if (setName.trim() !== from.setName.trim()) return whole;
    if (from.pieceName !== undefined && pieceName.trim() !== from.pieceName.trim()) return whole;
    return pieceRef(to.setName, to.pieceName ?? pieceName.trim());
  });
}
