import { parseTagCsv, TagIndex } from '../core/prompts/TagSearch';

let loading: Promise<TagIndex> | undefined;

/** 태그 목록(약 3.5MB)은 프롬프트 칸을 처음 쓸 때 따로 불러온다. */
export function loadTagIndex(): Promise<TagIndex> {
  loading ??= import('./data/danbooru-tags.csv?raw')
    .then((module) => new TagIndex(parseTagCsv(module.default)))
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
