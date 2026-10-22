import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  promptTokenUsage,
  readTokenizerFile,
  tokenizerForModel,
} from '../../src/core/prompts/PromptTokens';
import { ByteBpeTokenizer } from '../../src/core/prompts/tokenizers/ByteBpeTokenizer';
import { ClipTokenizer } from '../../src/core/prompts/tokenizers/ClipTokenizer';
import { UnigramTokenizer } from '../../src/core/prompts/tokenizers/UnigramTokenizer';
import { modelInfo } from '../../src/core/providers/NaiModels';
import { requestPromptTexts } from '../../src/core/providers/NovelAIRequestBuilder';

const prompts = {
  prompt: 'base',
  negativePrompt: 'bad',
  characterPrompt: 'girl',
  characterNegativePrompt: 'hands',
  extraCharacters: [
    { prompt: '', negative: 'unused' },
    { prompt: 'boy', negative: '' },
  ],
};

describe('requestPromptTexts', () => {
  it('V4부터는 프롬프트가 빈 캐릭터를 빼고 칸마다 따로 보낸다', () => {
    expect(requestPromptTexts('nai-diffusion-4-5-full-inpainting', prompts)).toEqual({
      positive: ['base', 'girl', 'boy'],
      negative: ['bad', 'hands', ''],
    });
  });

  it('V3는 캐릭터 프롬프트를 공통 프롬프트에 합친다', () => {
    expect(requestPromptTexts('nai-diffusion-3-inpainting', prompts)).toEqual({
      positive: ['base, girl, boy'],
      negative: ['bad, hands, unused'],
    });
  });
});

describe('모델별 토크나이저와 한도', () => {
  it('NovelAI 웹과 같은 토크나이저와 한도를 쓴다', () => {
    expect(tokenizerForModel('nai-diffusion-5-full-inpainting')).toBe('qwen35');
    expect(tokenizerForModel('nai-diffusion-4-5-curated-inpainting')).toBe('t5');
    expect(tokenizerForModel('nai-diffusion-3-inpainting')).toBe('clip');
    expect(tokenizerForModel('unknown')).toBeUndefined();
    expect(modelInfo('nai-diffusion-5-full-inpainting')?.maxPromptTokens).toBe(1471);
    expect(modelInfo('nai-diffusion-5-curated')?.maxPromptTokens).toBe(703);
    expect(modelInfo('nai-diffusion-4-full-inpainting')?.maxPromptTokens).toBe(512);
    expect(modelInfo('nai-diffusion-furry-3-inpainting')?.maxPromptTokens).toBe(225);
  });
});

describe('UnigramTokenizer (T5)', () => {
  const t5 = new UnigramTokenizer(
    [
      ['<unk>', 0],
      ['▁', -2],
      ['▁a', -1],
      ['b', -3],
      ['▁ab', -2.5],
      ['c', -1],
    ],
    0,
  );

  it('점수가 가장 높은 나누기로 세고 끝 토큰 하나를 더한다', () => {
    expect(t5.count('ab')).toBe(2);
    expect(t5.count('ab c')).toBe(4);
    expect(t5.count('')).toBe(1);
  });

  it('강조 괄호와 가중치 표기는 빼고, 앞 공백은 빈 조각으로 센다', () => {
    expect(t5.count('{1.2::ab::}')).toBe(2);
    expect(t5.count(' ab')).toBe(3);
  });

  it('어휘에 없는 글자는 한 글자씩 unk로 센다', () => {
    expect(t5.count('xy')).toBe(4);
  });
});

describe('ByteBpeTokenizer (Qwen)', () => {
  const qwen = new ByteBpeTokenizer(
    [
      ['a', 'b'],
      ['ab', 'c'],
    ],
    ['<s>'],
    { splitRegex: '\\S+|\\s+', normalization: 'NFC' },
  );

  it('짝을 합친 뒤 남은 조각을 세고 특수 토큰은 하나로 센다', () => {
    expect(qwen.count('abc')).toBe(1);
    expect(qwen.count('abd')).toBe(2);
    expect(qwen.count('<s>abc')).toBe(2);
    expect(qwen.count('abc abc')).toBe(3);
  });
});

describe('ClipTokenizer (V3)', () => {
  const clip = new ClipTokenizer('#version: 0.2\na b</w>\nc d');

  it('소문자로 바꾸고 강조 괄호는 공백으로 본다', () => {
    expect(clip.count('AB')).toBe(1);
    expect(clip.count('[ab], c')).toBe(3);
    expect(clip.count('a&amp;b')).toBe(3);
  });
});

describe('readTokenizerFile', () => {
  it('raw deflate로 압축한 JSON을 풀어 읽는다', () => {
    const json = {
      model: {
        vocab: [
          ['<unk>', 0],
          ['▁a', -1],
        ],
        unk_id: 0,
      },
    };
    const bytes = deflateSync(new TextEncoder().encode(JSON.stringify(json)));
    const counter = readTokenizerFile('t5', bytes);
    expect(promptTokenUsage(counter, { positive: ['a', 'a'], negative: [''] })).toEqual({
      positive: 4,
      negative: 1,
    });
  });
});
