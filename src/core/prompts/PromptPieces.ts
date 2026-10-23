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

/** 여러 줄이면 쉼표로 잇고, multi면 seed로 한 줄을 고른다(seed가 없으면 첫 줄). SDStudio처럼 빈 줄도 후보다. */
export function pieceText(piece: PromptPiece, key: string, seed?: number): string {
  const options = lines(piece.prompt);
  if (!piece.multi) return options.filter(Boolean).join(', ');
  if (seed === undefined || options.length === 1) return options[0];
  return options[hash(`${seed}:${key}`) % options.length];
}

function tidyCommas(text: string): string {
  return text
    .replace(/,(\s*,)+/g, ',')
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '');
}

/** 조각 안의 참조도 펼친다. */
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

  const expanded = expand(text, []);
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
