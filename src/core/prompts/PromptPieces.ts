import type { PieceSet, PromptPiece } from '../domain/types';

/**
 * 프롬프트 조각 참조 `<세트이름.조각이름>`. SDStudio와 같은 문법이라 그쪽 파일을 그대로 쓸 수 있다.
 * 세트 이름에는 점을 쓸 수 없고, 조각 이름은 첫 점 뒤의 나머지 전부다.
 */
const PIECE_REF = /<([^<>.\n]+)\.([^<>\n]+)>/g;
const MAX_DEPTH = 8;

export function pieceRef(setName: string, pieceName: string): string {
  return `<${setName}.${pieceName}>`;
}

export type PieceExpansion = {
  text: string;
  /** 찾지 못했거나 서로를 부르는(순환) 참조. 원문 그대로 남는다. */
  missing: string[];
};

/** 32비트 FNV-1a. seed와 조각 이름으로 multi 조각의 줄을 고를 때 쓴다. */
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

/**
 * 조각 하나의 내용. 여러 줄이면 보통은 쉼표로 이어 붙이고,
 * multi면 줄 하나를 고른다. SDStudio처럼 빈 줄도 후보("아무것도 넣지 않음")다.
 * seed가 같으면 같은 줄이 나오고, seed가 없으면(미리보기) 첫 줄이다.
 */
export function pieceText(piece: PromptPiece, key: string, seed?: number): string {
  const options = lines(piece.prompt);
  if (!piece.multi) return options.filter(Boolean).join(', ');
  if (seed === undefined || options.length === 1) return options[0];
  return options[hash(`${seed}:${key}`) % options.length];
}

function tidyCommas(text: string): string {
  // 빈 조각이 남긴 ", ," 를 하나로 줄인다.
  return text
    .replace(/,(\s*,)+/g, ',')
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '');
}

/** 프롬프트 안의 조각 참조를 내용으로 바꾼다. 조각 안의 참조도 펼친다. */
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

/** 프롬프트가 부르는 조각 참조 목록(중복 없이). */
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

/** 세트나 조각 이름이 바뀌면 그것을 부르던 참조도 새 이름으로 바꾼다. */
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
