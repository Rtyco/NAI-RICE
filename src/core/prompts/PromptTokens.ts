import { decompressSync } from 'fflate';
import { modelInfo } from '../providers/NaiModels';
import type { RequestPromptTexts } from '../providers/NovelAIRequestBuilder';
import { ByteBpeTokenizer, type ByteBpeConfig } from './tokenizers/ByteBpeTokenizer';
import { ClipTokenizer } from './tokenizers/ClipTokenizer';
import { UnigramTokenizer } from './tokenizers/UnigramTokenizer';

/** NovelAI 웹의 `tokenizer/compressed/<이름>_tokenizer.def` */
export const TOKENIZER_NAMES = ['clip', 't5', 'qwen35'] as const;
export type TokenizerName = (typeof TOKENIZER_NAMES)[number];

export type TokenCounter = { count: (text: string) => number };

export type PromptTokenUsage = { positive: number; negative: number };

export function tokenizerForModel(model: string): TokenizerName | undefined {
  const generation = modelInfo(model)?.generation;
  return generation === 'v5' ? 'qwen35' : generation === 'v4' ? 't5' : generation && 'clip';
}

/** `.def`를 풀어 읽은 JSON. 형식은 NovelAI 웹이 읽는 그대로다. */
export function createTokenCounter(name: TokenizerName, data: unknown): TokenCounter {
  const json = data as Record<string, unknown>;
  if (name === 'clip') return new ClipTokenizer(String(json.text ?? ''));
  if (name === 't5') {
    const model = json.model as { vocab: Array<[string, number]>; unk_id: number };
    return new UnigramTokenizer(model.vocab, model.unk_id);
  }
  return new ByteBpeTokenizer(
    json.merges as Array<[string, string]>,
    json.specialTokens as string[],
    json.config as ByteBpeConfig,
  );
}

/** NovelAI의 `.def`는 raw deflate로 압축한 JSON이다. */
export function readTokenizerFile(name: TokenizerName, bytes: Uint8Array): TokenCounter {
  return createTokenCounter(name, JSON.parse(new TextDecoder().decode(decompressSync(bytes))));
}

/** 웹처럼 기본 프롬프트와 캐릭터 프롬프트를 한 한도 안에서 합쳐 센다. 네거티브도 따로 합친다. */
export function promptTokenUsage(
  counter: TokenCounter,
  texts: RequestPromptTexts,
): PromptTokenUsage {
  const sum = (fields: string[]) => fields.reduce((total, text) => total + counter.count(text), 0);
  return { positive: sum(texts.positive), negative: sum(texts.negative) };
}
