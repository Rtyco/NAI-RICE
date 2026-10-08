/**
 * NovelAI V4.5·V5 프롬프트 문법 검사. docs.novelai.net 기준:
 * - `{}` 강조(×1.05), `[]` 약화(÷1.05). 중첩하면 곱해진다.
 * - `1.5::텍스트 ::` 숫자 가중치. 음수(`-1::hat ::`)는 V4.5부터. 닫지 않으면 끝까지 적용된다.
 * - 숫자 없는 `::`는 열린 가중치와 괄호를 모두 닫는다.
 * - `|`는 캐릭터 구분자인데 캐릭터 프롬프트 칸과 함께 쓸 수 없다(이 앱은 칸을 쓴다).
 * - `source#`·`target#`·`mutual#` 캐릭터 상호작용 태그.
 * - `<세트.조각>` 이 앱의 프롬프트 조각 참조.
 */

export type SyntaxKind =
  | 'brace'
  | 'bracket'
  | 'weight'
  | 'close-all'
  | 'piece'
  | 'pipe'
  | 'interaction';

export type SyntaxToken = {
  kind: SyntaxKind;
  start: number;
  end: number;
  /** 같은 종류끼리의 중첩 깊이(0부터). 괄호와 가중치만. */
  depth?: number;
  /** 짝이 되는 토큰의 index. `::`는 닫은 것 중 가장 바깥 것. */
  pair?: number;
  /** 가중치 값(weight만). */
  value?: number;
  problem?: 'error' | 'warning';
};

export type SyntaxIssue = {
  level: 'error' | 'warning';
  start: number;
  message: string;
};

export type SyntaxReport = {
  tokens: SyntaxToken[];
  issues: SyntaxIssue[];
};

const WEIGHT = /^-?(?:\d+(?:\.\d*)?|\.\d+)::/;
const PIECE = /^<([^<>.\n]+)\.([^<>\n]+)>/;
const INTERACTION = /^(?:source|target|mutual)#/;

const OPENERS: Record<string, 'brace' | 'bracket'> = { '{': 'brace', '[': 'bracket' };
const CLOSERS: Record<string, 'brace' | 'bracket'> = { '}': 'brace', ']': 'bracket' };
const LABEL = { brace: '{', bracket: '[' } as const;

export function analyzePrompt(
  text: string,
  pieceExists?: (setName: string, pieceName: string) => boolean,
): SyntaxReport {
  const tokens: SyntaxToken[] = [];
  const issues: SyntaxIssue[] = [];
  /** 열린 괄호·가중치 토큰 index. */
  const stack: number[] = [];
  const depthOf = (kind: SyntaxKind) =>
    stack.filter((index) => tokens[index].kind === kind).length;
  const push = (token: SyntaxToken) => tokens.push(token) - 1;

  for (let i = 0; i < text.length; ) {
    const char = text[i];
    const rest = text.slice(i, i + 200);
    const wordStart = i === 0 || !/[\w.]/.test(text[i - 1]);

    const piece = char === '<' ? PIECE.exec(rest) : null;
    if (piece) {
      const missing = pieceExists ? !pieceExists(piece[1].trim(), piece[2].trim()) : false;
      push({ kind: 'piece', start: i, end: i + piece[0].length, problem: missing ? 'error' : undefined });
      if (missing) issues.push({ level: 'error', start: i, message: `없는 조각 ${piece[0]}` });
      i += piece[0].length;
      continue;
    }

    const weight = wordStart && /[-.\d]/.test(char) ? WEIGHT.exec(rest) : null;
    if (weight) {
      const value = Number(weight[0].slice(0, -2));
      stack.push(push({ kind: 'weight', start: i, end: i + weight[0].length, value, depth: depthOf('weight') }));
      i += weight[0].length;
      continue;
    }

    if (char === ':' && text[i + 1] === ':') {
      const index = push({ kind: 'close-all', start: i, end: i + 2 });
      if (!stack.length) {
        tokens[index].problem = 'warning';
        issues.push({ level: 'warning', start: i, message: '닫을 것이 없는 ::' });
      } else {
        // ::는 열린 것을 모두 닫는다.
        tokens[index].pair = stack[0];
        for (const open of stack) tokens[open].pair = index;
        stack.length = 0;
      }
      i += 2;
      continue;
    }

    if (OPENERS[char]) {
      const kind = OPENERS[char];
      stack.push(push({ kind, start: i, end: i + 1, depth: depthOf(kind) }));
      i += 1;
      continue;
    }

    if (CLOSERS[char]) {
      const kind = CLOSERS[char];
      const top = stack.at(-1);
      const index = push({ kind, start: i, end: i + 1 });
      if (top !== undefined && tokens[top].kind === kind) {
        stack.pop();
        tokens[index].pair = top;
        tokens[index].depth = tokens[top].depth;
        tokens[top].pair = index;
      } else {
        tokens[index].problem = 'error';
        const open = top === undefined ? undefined : tokens[top];
        issues.push({
          level: 'error',
          start: i,
          message:
            open && (open.kind === 'brace' || open.kind === 'bracket')
              ? `${char} 앞에 닫히지 않은 ${LABEL[open.kind]}`
              : `짝이 없는 ${char}`,
        });
      }
      i += 1;
      continue;
    }

    if (char === '|') {
      push({ kind: 'pipe', start: i, end: i + 1, problem: 'warning' });
      issues.push({
        level: 'warning',
        start: i,
        message: '|는 캐릭터 프롬프트 칸과 함께 쓸 수 없음',
      });
      i += 1;
      continue;
    }

    const interaction = wordStart && /[stm]/.test(char) ? INTERACTION.exec(rest) : null;
    if (interaction) {
      push({ kind: 'interaction', start: i, end: i + interaction[0].length });
      i += interaction[0].length;
      continue;
    }

    i += 1;
  }

  for (const open of stack) {
    const token = tokens[open];
    if (token.kind === 'weight') {
      token.problem = 'warning';
      issues.push({
        level: 'warning',
        start: token.start,
        message: `닫히지 않은 ${text.slice(token.start, token.end)} · 끝까지 적용`,
      });
    } else {
      token.problem = 'error';
      issues.push({
        level: 'error',
        start: token.start,
        message: `닫히지 않은 ${LABEL[token.kind as 'brace' | 'bracket']}`,
      });
    }
  }
  issues.sort((a, b) => a.start - b.start);
  return { tokens, issues };
}

/** 커서 위치에 걸린 강조 배율. 괄호는 1.05씩, 숫자 가중치는 그 값을 곱한다. */
export function weightAt(report: SyntaxReport, position: number): number {
  let weight = 1;
  for (const token of report.tokens) {
    if (token.kind !== 'brace' && token.kind !== 'bracket' && token.kind !== 'weight') continue;
    if (token.depth === undefined || token.start >= position) continue;
    // 여는 토큰만 본다(닫는 괄호는 pair가 자기보다 앞).
    if (token.pair !== undefined && report.tokens[token.pair].start < token.start) continue;
    const close = token.pair === undefined ? undefined : report.tokens[token.pair];
    if (close && close.start < position) continue;
    weight *= token.kind === 'brace' ? 1.05 : token.kind === 'bracket' ? 1 / 1.05 : token.value!;
  }
  return weight;
}
