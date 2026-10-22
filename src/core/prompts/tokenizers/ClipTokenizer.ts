import { bpeCount, byteChars, mergeRanks, type MergeRanks } from './bpe';

/** NovelAI 웹 CLIP 토크나이저(2026-10)의 단어 나누기 */
const WORD =
  /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/giu;
/** 웹은 merges 파일 첫 줄(버전) 다음 48894줄만 쓴다. */
const MERGE_LINES = 48_894;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** 웹은 HTML 엔티티를 두 번 푼다. 프롬프트에 흔한 것만 푼다. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** V3 모델. 시작·끝 토큰은 세지 않는다. */
export class ClipTokenizer {
  private readonly ranks: MergeRanks;
  private readonly cache = new Map<string, number>();

  constructor(mergesText: string) {
    const lines = mergesText.split('\n').slice(1, MERGE_LINES + 1);
    this.ranks = mergeRanks(lines.map((line) => line.split(' ') as [string, string]));
  }

  count(text: string): number {
    const cleaned = decodeEntities(decodeEntities(text.replace(/[[\]{}]/g, ' ').trim()))
      .trim()
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    let total = 0;
    for (const [word] of cleaned.matchAll(WORD)) total += this.wordCount(word);
    return total;
  }

  private wordCount(word: string): number {
    if (word === '<|startoftext|>' || word === '<|endoftext|>') return 1;
    const cached = this.cache.get(word);
    if (cached !== undefined) return cached;
    const chars = [...byteChars(word)];
    chars[chars.length - 1] += '</w>';
    const count = bpeCount(chars, this.ranks);
    this.cache.set(word, count);
    return count;
  }
}
