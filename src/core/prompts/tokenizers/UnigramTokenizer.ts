type TrieNode = { children: Map<string, TrieNode>; piece?: number };

const META = '▁';

/** V4·V4.5 모델(T5). NovelAI 웹(2026-10)처럼 끝 토큰 하나를 더해 센다. */
export class UnigramTokenizer {
  private readonly root: TrieNode = { children: new Map() };
  private readonly scores: number[];
  private readonly unkScore: number;
  private readonly cache = new Map<string, number>();

  /** `vocab`은 HF tokenizer.json의 `model.vocab`([조각, 점수]) */
  constructor(vocab: Array<[string, number]>, unkId: number) {
    this.scores = vocab.map(([, score]) => score);
    this.unkScore = this.scores.reduce((min, score) => Math.min(min, score), Infinity) - 10;
    this.scores[unkId] = this.unkScore;
    vocab.forEach(([piece], id) => {
      let node = this.root;
      for (let index = 0; index < piece.length; index += 1) {
        const char = piece[index];
        let next = node.children.get(char);
        if (!next) {
          next = { children: new Map() };
          node.children.set(char, next);
        }
        node = next;
      }
      node.piece = id;
    });
  }

  count(text: string): number {
    if (!text) return 1;
    // 웹은 강조 괄호와 `1.2::` 같은 가중치 표기를 빼고 센다.
    const cleaned = text.replace(/[[\]{}]/g, '').replace(/-?\d*\.?\d*::/g, '');
    let total = 1;
    for (const word of cleaned.split(/\s+/)) {
      total += this.wordCount(word.startsWith(META) ? word : META + word);
    }
    return total;
  }

  /** 점수 합이 가장 큰 나누기. 같은 점수면 먼저 시작한(긴) 조각을 고르는 웹과 같다. */
  private wordCount(word: string): number {
    const cached = this.cache.get(word);
    if (cached !== undefined) return cached;
    const length = word.length;
    const best = new Float64Array(length + 1).fill(-Infinity);
    const pieces = new Int32Array(length + 1);
    best[0] = 0;
    for (let start = 0; start < length; start += 1) {
      const base = best[start];
      let node: TrieNode | undefined = this.root;
      let singleChar = false;
      for (let end = start; end < length && node; end += 1) {
        node = node.children.get(word[end]);
        if (node?.piece === undefined) continue;
        if (end === start) singleChar = true;
        const score = base + this.scores[node.piece];
        if (score > best[end + 1]) {
          best[end + 1] = score;
          pieces[end + 1] = pieces[start] + 1;
        }
      }
      if (!singleChar && base + this.unkScore > best[start + 1]) {
        best[start + 1] = base + this.unkScore;
        pieces[start + 1] = pieces[start] + 1;
      }
    }
    const count = pieces[length];
    this.cache.set(word, count);
    return count;
  }
}
