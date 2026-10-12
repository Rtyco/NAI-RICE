import { parseTagCsv, TagIndex } from '../core/prompts/TagSearch';
import csv from './data/danbooru-tags.csv?raw';

export type TagSearchRequest = { id: number; query: string };

const index = new TagIndex(parseTagCsv(csv));
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<TagSearchRequest>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = ({ data }) => {
  scope.postMessage({ id: data.id, matches: index.search(data.query) });
};
