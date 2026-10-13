import { parseTagCsv, TagIndex, type TagMatch } from '../core/prompts/TagSearch';
import type { TagSearchRequest } from './tagWorker';

type Searcher = (query: string) => Promise<TagMatch[]>;

let searcher: Searcher | undefined;

/** 읽고 색인하는 데 약 300ms가 걸려 Worker에서 한다. Worker를 만들 수 없으면 처음 쓸 때 화면 스레드에서 읽는다. */
function startWorker(): Searcher {
  const worker = new Worker(new URL('./tagWorker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (matches: TagMatch[]) => void>();
  let seed = 0;
  worker.onmessage = ({ data }: MessageEvent<{ id: number; matches: TagMatch[] }>) => {
    pending.get(data.id)?.(data.matches);
    pending.delete(data.id);
  };
  worker.onerror = () => {
    worker.terminate();
    searcher = searchOnPage();
    for (const resolve of pending.values()) resolve([]);
    pending.clear();
  };
  return (query) =>
    new Promise((resolve) => {
      const id = (seed += 1);
      pending.set(id, resolve);
      worker.postMessage({ id, query } satisfies TagSearchRequest);
    });
}

function searchOnPage(): Searcher {
  let loading: Promise<TagIndex> | undefined;
  return (query) => {
    loading ??= import('./data/danbooru-tags.csv?raw')
      .then((module) => new TagIndex(parseTagCsv(module.default)))
      .catch((error: unknown) => {
        loading = undefined;
        throw error;
      });
    return loading.then((index) => index.search(query));
  };
}

function tagSearcher(): Searcher {
  if (!searcher) {
    try {
      searcher = startWorker();
    } catch {
      searcher = searchOnPage();
    }
  }
  return searcher;
}

export function warmTagIndex(): void {
  void searchTags('').catch(() => undefined);
}

export function searchTags(query: string): Promise<TagMatch[]> {
  return tagSearcher()(query);
}
