import {
  promptTokenUsage,
  readTokenizerFile,
  type PromptTokenUsage,
  type TokenCounter,
  type TokenizerName,
} from '../core/prompts/PromptTokens';
import type { RequestPromptTexts } from '../core/providers/NovelAIRequestBuilder';

/** `data`는 그 토크나이저를 처음 쓸 때만 보낸다. */
export type TokenCountRequest = {
  id: number;
  tokenizer: TokenizerName;
  data?: Uint8Array;
  prompts: RequestPromptTexts[];
};

export type TokenCountResponse = { id: number; usage?: PromptTokenUsage[]; error?: string };

const counters = new Map<TokenizerName, TokenCounter>();

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<TokenCountRequest>) => void;
  postMessage: (message: TokenCountResponse) => void;
};

scope.onmessage = ({ data: request }) => {
  try {
    if (request.data)
      counters.set(request.tokenizer, readTokenizerFile(request.tokenizer, request.data));
    const counter = counters.get(request.tokenizer);
    if (!counter) throw new Error('토크나이저를 읽지 않았습니다.');
    scope.postMessage({
      id: request.id,
      usage: request.prompts.map((texts) => promptTokenUsage(counter, texts)),
    });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
