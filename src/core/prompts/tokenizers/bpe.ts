/** GPT-2 계열 바이트 BPE가 바이트를 글자로 바꾸는 표. CLIP과 Qwen이 같다. */
export const BYTE_TO_CHAR: readonly string[] = (() => {
  const printable: number[] = [];
  for (let byte = 33; byte <= 126; byte += 1) printable.push(byte);
  for (let byte = 161; byte <= 172; byte += 1) printable.push(byte);
  for (let byte = 174; byte <= 255; byte += 1) printable.push(byte);
  const table: string[] = [];
  let extra = 0;
  for (let byte = 0; byte < 256; byte += 1) {
    table[byte] = String.fromCodePoint(printable.includes(byte) ? byte : 256 + extra++);
  }
  return table;
})();

const encoder = new TextEncoder();

export function byteChars(text: string): string {
  let result = '';
  for (const byte of encoder.encode(text)) result += BYTE_TO_CHAR[byte];
  return result;
}

const SEPARATOR = '\u0000';

export type MergeRanks = Map<string, number>;

export function mergeRanks(merges: Iterable<readonly [string, string]>): MergeRanks {
  const ranks: MergeRanks = new Map();
  let rank = 0;
  for (const [left, right] of merges) ranks.set(left + SEPARATOR + right, rank++);
  return ranks;
}

/** 순위가 가장 낮은 짝부터 모두 합친다. 남은 조각 수가 토큰 수다. */
export function bpeCount(symbols: string[], ranks: MergeRanks): number {
  let word = symbols;
  while (word.length > 1) {
    let best = Infinity;
    let first = '';
    let second = '';
    for (let index = 0; index < word.length - 1; index += 1) {
      const rank = ranks.get(word[index] + SEPARATOR + word[index + 1]);
      if (rank !== undefined && rank < best) {
        best = rank;
        first = word[index];
        second = word[index + 1];
      }
    }
    if (best === Infinity) break;
    const next: string[] = [];
    for (let index = 0; index < word.length;) {
      if (word[index] === first && word[index + 1] === second) {
        next.push(first + second);
        index += 2;
      } else {
        next.push(word[index]);
        index += 1;
      }
    }
    word = next;
  }
  return word.length;
}
