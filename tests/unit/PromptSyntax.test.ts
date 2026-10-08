import { describe, expect, it } from 'vitest';
import { analyzePrompt, weightAt } from '../../src/core/prompts/PromptSyntax';

const messages = (text: string) => analyzePrompt(text).issues.map((issue) => issue.message);

describe('analyzePrompt', () => {
  it('짝이 맞는 괄호와 가중치는 문제없어', () => {
    expect(messages('1girl, {{smile}}, [blush], 1.5::rain, night ::, -1::hat ::')).toEqual([]);
  });

  it('닫히지 않은 괄호와 짝 없는 닫는 괄호를 찾아', () => {
    expect(messages('{{smile}, blush')).toEqual(['닫히지 않은 {']);
    expect(messages('smile}}')).toEqual(['짝이 없는 }', '짝이 없는 }']);
    expect(messages('{[smile}]')).toEqual(['닫히지 않은 {', '} 앞에 닫히지 않은 [']);
  });

  it(':: 는 열린 괄호와 가중치를 모두 닫아', () => {
    expect(messages('{{{{{rain ::, 1.2::{coat ::')).toEqual([]);
    expect(messages('smile ::')).toEqual(['닫을 것이 없는 ::']);
  });

  it('닫지 않은 가중치는 경고, | 도 경고', () => {
    const report = analyzePrompt('0.5::coat, a|b');
    expect(report.issues.map((issue) => issue.level)).toEqual(['warning', 'warning']);
  });

  it('숫자 태그·시간·조각을 가중치로 오해하지 않아', () => {
    expect(messages('1girl, 2boys, year 2014, 12:30, artist:ixy')).toEqual([]);
    const report = analyzePrompt('<에셋봇.eyes>, <없음.x>', (set) => set === '에셋봇');
    expect(report.tokens.map((token) => token.kind)).toEqual(['piece', 'piece']);
    expect(report.issues.map((issue) => issue.message)).toEqual(['없는 조각 <없음.x>']);
  });

  it('상호작용 태그를 표시해', () => {
    expect(analyzePrompt('source#hug, mutual#kiss').tokens.map((token) => token.kind)).toEqual([
      'interaction',
      'interaction',
    ]);
  });
});

describe('weightAt', () => {
  it('커서 위치의 강조 배율을 계산해', () => {
    const text = '{{a}}, [b], 1.5::c {d} ::, e';
    const report = analyzePrompt(text);
    expect(weightAt(report, text.indexOf('a'))).toBeCloseTo(1.05 ** 2);
    expect(weightAt(report, text.indexOf('b'))).toBeCloseTo(1 / 1.05);
    expect(weightAt(report, text.indexOf('c'))).toBeCloseTo(1.5);
    expect(weightAt(report, text.indexOf('d'))).toBeCloseTo(1.5 * 1.05);
    expect(weightAt(report, text.indexOf('e'))).toBe(1);
  });
});
