/**
 * 단부루 태그 자동완성. 태그 목록은 a1111-sd-webui-tagcomplete의 danbooru.csv 형식
 * (`이름,분류,게시물 수,"별칭,별칭"`)이고 게시물 수가 많은 순으로 정렬돼 있다.
 * NovelAI는 밑줄 대신 띄어쓰기를 쓰므로 이름의 `_`는 공백으로 바꿔 둔다.
 */

/** 0 일반, 1 작가, 3 작품, 4 캐릭터, 5 메타. */
export type TagCategory = 0 | 1 | 3 | 4 | 5;

export type Tag = {
  name: string;
  category: TagCategory;
  count: number;
  aliases: string[];
};

export type TagMatch = {
  tag: Tag;
  /** 이름 대신 별칭으로 찾았을 때 그 별칭. */
  alias?: string;
};

const CATEGORIES = new Set([0, 1, 3, 4, 5]);
const ARTIST_PREFIX = 'artist:';

/** 프롬프트에 넣을 글자. NovelAI는 작가 태그 앞에 `artist:`를 붙이도록 권한다. */
export function tagText(tag: Tag): string {
  return tag.category === 1 ? `${ARTIST_PREFIX}${tag.name}` : tag.name;
}

const toSpaces = (text: string) => text.replace(/_/g, ' ');

export function normalizeTagQuery(text: string): string {
  return toSpaces(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseTagCsv(text: string): Tag[] {
  const tags: Tag[] = [];
  for (const line of text.split(/\r?\n/)) {
    // 이름에는 쉼표가 없다. 별칭 묶음만 따옴표로 감싸져 있다.
    const match = /^([^,]+),(\d+),(\d+),(?:"([^"]*)"|([^,]*))$/.exec(line);
    if (!match) continue;
    const category = Number(match[2]);
    if (!CATEGORIES.has(category)) continue;
    const aliases = (match[4] ?? match[5] ?? '')
      .split(',')
      .map((alias) => toSpaces(alias.trim()))
      .filter((alias) => alias && !alias.startsWith('/'));
    tags.push({
      name: toSpaces(match[1]),
      category: category as TagCategory,
      count: Number(match[3]),
      aliases,
    });
  }
  return tags;
}

export class TagIndex {
  private readonly keys: string[];
  private readonly aliasKeys: string[][];

  constructor(readonly tags: Tag[]) {
    this.keys = tags.map((tag) => tag.name.toLowerCase());
    this.aliasKeys = tags.map((tag) => tag.aliases.map((alias) => alias.toLowerCase()));
  }

  /**
   * 이름이 검색어로 시작하는 태그, 별칭이 검색어로 시작하는 태그, 이름 중간 단어가
   * 검색어로 시작하는 태그 순으로 보여 준다. 같은 순위 안에서는 게시물 수 순.
   */
  search(query: string, limit = 12): TagMatch[] {
    let q = normalizeTagQuery(query);
    // `artist:`로 시작하면 작가 태그만 찾는다.
    const artistOnly = q.startsWith(ARTIST_PREFIX);
    if (artistOnly) q = q.slice(ARTIST_PREFIX.length).trim();
    if (!q) return [];
    const prefix: TagMatch[] = [];
    const alias: TagMatch[] = [];
    const inner: TagMatch[] = [];
    for (let i = 0; i < this.keys.length && prefix.length < limit; i++) {
      if (artistOnly && this.tags[i].category !== 1) continue;
      const key = this.keys[i];
      if (key.startsWith(q)) {
        prefix.push({ tag: this.tags[i] });
        continue;
      }
      if (alias.length < limit) {
        const found = this.aliasKeys[i].findIndex((name) => name.startsWith(q));
        if (found >= 0) {
          alias.push({ tag: this.tags[i], alias: this.tags[i].aliases[found] });
          continue;
        }
      }
      if (inner.length < limit && (key.includes(` ${q}`) || key.includes(`(${q}`))) {
        inner.push({ tag: this.tags[i] });
      }
    }
    const seen = new Set<Tag>();
    return [...prefix, ...alias, ...inner]
      .filter((match) => !seen.has(match.tag) && seen.add(match.tag))
      .slice(0, limit);
  }
}

export type TagQuery = {
  /** 바꿀 범위. 앞뒤 공백은 뺀다. */
  start: number;
  end: number;
  text: string;
};

/** 태그를 나누는 문자. `::`와 숫자 가중치는 따로 처리한다. */
const BOUNDARY = /[,\n{}[\]|<>#]/;

/** 커서가 있는 태그 하나. 숫자 가중치를 입력하는 중이거나 조각 참조 안이면 없다. */
export function tagQueryAt(text: string, caret: number): TagQuery | null {
  let start = caret;
  while (start > 0 && !BOUNDARY.test(text[start - 1]) && !text.startsWith('::', start - 2)) start--;
  // `<세트.조각>` 안에서는 자동완성하지 않는다.
  if (text[start - 1] === '<') return null;
  let end = caret;
  while (end < text.length && !BOUNDARY.test(text[end]) && !text.startsWith('::', end)) end++;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (caret < start || caret > end) return null;
  const query = text.slice(start, end);
  // 비어 있거나 `1.5::`의 숫자 부분을 입력하는 중.
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)?$/.test(query)) return null;
  return { start, end, text: query };
}

/** 태그를 넣을 때 뒤에 붙일 구분자. 이미 구분자가 있으면 붙이지 않는다. */
export function separatorAfter(text: string, end: number): string {
  const rest = text.slice(end).replace(/^[ \t]+/, '');
  if (!rest || rest.startsWith('\n')) return ', ';
  if (/^[,}\]|]/.test(rest) || rest.startsWith('::')) return '';
  return ', ';
}

export function formatTagCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000)
    return `${count >= 10_000 ? Math.round(count / 1_000) : (count / 1_000).toFixed(1)}k`;
  return String(count);
}
