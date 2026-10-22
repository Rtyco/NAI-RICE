import { bpeCount, byteChars, mergeRanks, type MergeRanks } from './bpe';

export type ByteBpeConfig = {
  splitRegex: string;
  normalization?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
};

/** V5 모델(Qwen). 웹처럼 프롬프트를 그대로 센다(가중치 표기·괄호 포함). */
export class ByteBpeTokenizer {
  private readonly ranks: MergeRanks;
  private readonly split: RegExp;
  private readonly specials: RegExp | undefined;
  private readonly cache = new Map<string, number>();

  constructor(
    merges: Array<[string, string]>,
    specialTokens: string[],
    private readonly config: ByteBpeConfig,
  ) {
    this.ranks = mergeRanks(merges);
    this.split = new RegExp(config.splitRegex, 'gu');
    const escaped = [...specialTokens]
      .sort((a, b) => b.length - a.length)
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this.specials = escaped.length ? new RegExp(`(${escaped.join('|')})`, 'u') : undefined;
  }

  count(text: string): number {
    const normalized = this.config.normalization ? text.normalize(this.config.normalization) : text;
    let total = 0;
    const parts = this.specials ? normalized.split(this.specials) : [normalized];
    parts.forEach((part, index) => {
      // split에 괄호를 쓰면 홀수 자리가 특수 토큰이다.
      if (index % 2 === 1) total += 1;
      else for (const [word] of part.matchAll(this.split)) total += this.wordCount(word);
    });
    return total;
  }

  private wordCount(word: string): number {
    const cached = this.cache.get(word);
    if (cached !== undefined) return cached;
    const count = bpeCount([...byteChars(word)], this.ranks);
    this.cache.set(word, count);
    return count;
  }
}
