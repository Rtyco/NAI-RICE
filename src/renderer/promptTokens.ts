import { useEffect, useState } from 'react';
import type { Library, PieceSet } from '../core/domain/types';
import { composeRequestPrompts, freePromptKind, freePromptPreset } from '../core/jobs/JobBuilder';
import { comboPrompts, sceneCombos } from '../core/model/sceneCombos';
import {
  effectiveGenerationSettings,
  generationKindFor,
  type ResolvedProject,
} from '../core/model/defaults';
import {
  promptTokenUsage,
  readTokenizerFile,
  tokenizerForModel,
  type PromptTokenUsage,
  type TokenCounter,
  type TokenizerName,
} from '../core/prompts/PromptTokens';
import { modelInfo } from '../core/providers/NaiModels';
import {
  requestPromptTexts,
  type RequestPromptTexts,
} from '../core/providers/NovelAIRequestBuilder';
import { appApi } from './desktop';
import { errorMessage, resolveFreeGeneration } from './store';
import type { TokenCountRequest, TokenCountResponse } from './tokenWorker';

type Count = (
  tokenizer: TokenizerName,
  prompts: RequestPromptTexts[],
) => Promise<PromptTokenUsage[]>;

const files = new Map<TokenizerName, Promise<Uint8Array>>();

function tokenizerFile(name: TokenizerName): Promise<Uint8Array> {
  let file = files.get(name);
  if (!file) {
    file = appApi()
      .loadTokenizer(name)
      .catch((error: unknown) => {
        files.delete(name);
        throw error;
      });
    files.set(name, file);
  }
  return file;
}

let count: Count | undefined;

/** Qwen 토크나이저는 풀고 읽는 데 0.2초쯤 걸려 Worker에서 한다. Worker를 만들 수 없으면 화면 스레드에서 센다. */
function startWorker(): Count {
  const worker = new Worker(new URL('./tokenWorker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<
    number,
    {
      tokenizer: TokenizerName;
      resolve: (usage: PromptTokenUsage[]) => void;
      reject: (error: Error) => void;
    }
  >();
  const sent = new Set<TokenizerName>();
  let seed = 0;
  worker.onmessage = ({ data }: MessageEvent<TokenCountResponse>) => {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (!request) return;
    if (data.usage) request.resolve(data.usage);
    else {
      sent.delete(request.tokenizer);
      request.reject(new Error(data.error));
    }
  };
  worker.onerror = () => {
    worker.terminate();
    count = countOnPage();
    for (const request of pending.values()) request.reject(new Error('토큰 수를 세지 못했습니다.'));
    pending.clear();
  };
  return async (tokenizer, prompts) => {
    const data = sent.has(tokenizer) ? undefined : await tokenizerFile(tokenizer);
    sent.add(tokenizer);
    return new Promise((resolve, reject) => {
      const id = (seed += 1);
      pending.set(id, { tokenizer, resolve, reject });
      worker.postMessage({ id, tokenizer, data, prompts } satisfies TokenCountRequest);
    });
  };
}

function countOnPage(): Count {
  const counters = new Map<TokenizerName, Promise<TokenCounter>>();
  return async (tokenizer, prompts) => {
    let counter = counters.get(tokenizer);
    if (!counter) {
      counter = tokenizerFile(tokenizer).then((data) => readTokenizerFile(tokenizer, data));
      counter.catch(() => counters.delete(tokenizer));
      counters.set(tokenizer, counter);
    }
    const ready = await counter;
    return prompts.map((texts) => promptTokenUsage(ready, texts));
  };
}

function countPromptTokens(tokenizer: TokenizerName, prompts: RequestPromptTexts[]) {
  if (!count) {
    try {
      count = startWorker();
    } catch {
      count = countOnPage();
    }
  }
  return count(tokenizer, prompts);
}

export type TokenScene = { name?: string; texts: RequestPromptTexts };

/** 생성에서 빠진 씬은 세지 않는다. 조각의 무작위 줄은 미리보기처럼 고른다. */
export function projectTokenScenes(resolved: ResolvedProject, pieceSets: PieceSet[]): TokenScene[] {
  const { preset, project } = resolved;
  if (!preset) return [];
  const model = effectiveGenerationSettings(preset.generation).model;
  const promptSets = resolved.characters.map((item) => item.promptSet);
  const kind = generationKindFor(project.mode);
  const emotions = (resolved.emotionSet?.emotions ?? []).filter(
    (emotion) => !project.excludedEmotionIds.includes(emotion.id),
  );
  return (emotions.length ? emotions : [undefined]).map((emotion) => ({
    name: emotion?.name,
    texts: requestPromptTexts(
      model,
      composeRequestPrompts(
        preset,
        promptSets,
        emotion && comboPrompts(emotion, sceneCombos(emotion)[0]),
        { sets: pieceSets, extraPrompt: project.extraPrompt },
        kind,
      ),
    ),
  }));
}

export function freeTokenScenes(library: Library): TokenScene[] {
  const { free, preset, characters } = resolveFreeGeneration(library);
  if (!preset) return [];
  const promptSets = characters.map((item) => item.promptSet);
  const prompts = composeRequestPrompts(
    freePromptPreset(preset, promptSets, free.promptPosition),
    promptSets,
    { prompt: free.prompt, negative: free.negative },
    { sets: library.pieceSets },
    freePromptKind(free),
  );
  return [
    { texts: requestPromptTexts(effectiveGenerationSettings(preset.generation).model, prompts) },
  ];
}

export function sameTokenScenes(a: TokenScene[], b: TokenScene[]): boolean {
  const sameTexts = (x: string[], y: string[]) =>
    x.length === y.length && x.every((text, index) => text === y[index]);
  return (
    a.length === b.length &&
    a.every(
      (scene, index) =>
        scene.name === b[index].name &&
        sameTexts(scene.texts.positive, b[index].texts.positive) &&
        sameTexts(scene.texts.negative, b[index].texts.negative),
    )
  );
}

export type SideUsage = { count: number; scene?: string };

export type PromptTokenState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; limit: number; positive: SideUsage; negative: SideUsage };

/** 씬이 여럿이면 가장 긴 씬. 입력이 멈추고 0.25초 뒤에 센다. */
export function usePromptTokens(
  model: string | undefined,
  scenes: TokenScene[],
): PromptTokenState | undefined {
  const tokenizer = model ? tokenizerForModel(model) : undefined;
  const limit = model ? modelInfo(model)?.maxPromptTokens : undefined;
  const [state, setState] = useState<PromptTokenState>({ status: 'loading' });

  useEffect(() => {
    if (!tokenizer || !limit || !scenes.length) return;
    let active = true;
    const timer = setTimeout(() => {
      countPromptTokens(
        tokenizer,
        scenes.map((scene) => scene.texts),
      )
        .then((usage) => {
          if (!active) return;
          const longest = (side: keyof PromptTokenUsage): SideUsage => {
            let best = 0;
            usage.forEach((item, index) => {
              if (item[side] > usage[best][side]) best = index;
            });
            return { count: usage[best][side], scene: scenes[best].name };
          };
          setState({
            status: 'ready',
            limit,
            positive: longest('positive'),
            negative: longest('negative'),
          });
        })
        .catch(
          (error: unknown) => active && setState({ status: 'error', message: errorMessage(error) }),
        );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tokenizer, limit, scenes]);

  return tokenizer && limit && scenes.length ? state : undefined;
}
