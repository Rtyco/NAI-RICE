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

/** 후보를 나눌 때 보는 앞 글자 수. 자동완성은 두 글자부터 찾는다(`PromptTextarea`). */
const BUCKET_LENGTH = 2;
const NO_ITEMS: readonly number[] = [];
const SPACE = 0x20;
const PAREN = 0x28;

/** `text`의 `at`부터 두 글자를 숫자 하나로. 글자 수만큼 문자열을 새로 만들지 않으려고 문자 코드를 쓴다. */
function bucketKey(text: string, at = 0): number {
  const second = at + 1 < text.length ? text.charCodeAt(at + 1) : 0x10000;
  return text.charCodeAt(at) * 0x20000 + second;
}

/** 앞 두 글자가 같은 태그 번호들. 넣은 순서(태그 순서 = 게시물 수 순)를 지킨다. */
class Buckets {
  private readonly lists = new Map<number, number[]>();

  add(text: string, at: number, index: number): void {
    const key = bucketKey(text, at);
    const list = this.lists.get(key);
    if (!list) this.lists.set(key, [index]);
    else if (list[list.length - 1] !== index) list.push(index);
  }

  get(query: string): readonly number[] {
    return this.lists.get(bucketKey(query)) ?? NO_ITEMS;
  }
}

export class TagIndex {
  private readonly keys: string[];
  private readonly aliasKeys: string[][];
  /**
   * 이름·별칭·이름 중간 단어의 앞 글자로 나눈 후보. 19만 개를 모두 비교하면 드문 검색어에서 입력마다 약 20ms가
   * 걸렸다.
   */
  private readonly names = new Buckets();
  private readonly aliases = new Buckets();
  private readonly words = new Buckets();

  constructor(readonly tags: Tag[]) {
    this.keys = tags.map((tag) => tag.name.toLowerCase());
    this.aliasKeys = tags.map((tag) => tag.aliases.map((alias) => alias.toLowerCase()));
    this.keys.forEach((key, index) => {
      if (key) this.names.add(key, 0, index);
      for (const alias of this.aliasKeys[index]) if (alias) this.aliases.add(alias, 0, index);
      for (let at = 1; at < key.length; at++) {
        const before = key.charCodeAt(at - 1);
        if (before === SPACE || before === PAREN) this.words.add(key, at, index);
      }
    });
  }

  /**
   * 이름이 검색어로 시작하는 태그, 별칭이 검색어로 시작하는 태그, 이름 중간 단어가
   * 검색어로 시작하는 태그 순으로 보여 준다. 같은 순위 안에서는 게시물 수 순.
   */
  search(query: string, limit = 12): TagMatch[] {
    let q = normalizeTagQuery(query);
    // `long `·`long_`처럼 단어를 끝낸 채면 그 단어로 끝나는 `longsword`는 빼고 `long hair`를 찾는다.
    if (q && /[\s_]$/.test(query)) q += ' ';
    // `artist:`로 시작하면 작가 태그만 찾는다.
    const artistOnly = q.startsWith(ARTIST_PREFIX);
    if (artistOnly) q = q.slice(ARTIST_PREFIX.length).trimStart();
    if (!q) return [];
    const matches: TagMatch[] = [];
    const taken = new Set<number>();
    const collect = (buckets: Buckets, match: (index: number) => TagMatch | undefined) => {
      const candidates = q.length >= BUCKET_LENGTH ? buckets.get(q) : this.keys.keys();
      for (const index of candidates) {
        if (matches.length >= limit) return;
        if (taken.has(index) || (artistOnly && this.tags[index].category !== 1)) continue;
        const found = match(index);
        if (!found) continue;
        taken.add(index);
        matches.push(found);
      }
    };
    collect(this.names, (index) =>
      this.keys[index].startsWith(q) ? { tag: this.tags[index] } : undefined,
    );
    collect(this.aliases, (index) => {
      const found = this.aliasKeys[index].findIndex((name) => name.startsWith(q));
      return found < 0
        ? undefined
        : { tag: this.tags[index], alias: this.tags[index].aliases[found] };
    });
    collect(this.words, (index) =>
      this.keys[index].includes(` ${q}`) || this.keys[index].includes(`(${q}`)
        ? { tag: this.tags[index] }
        : undefined,
    );
    return matches;
  }
}

export type TagQuery = {
  /** 바꿀 범위. 앞 공백은 빼고, 커서 앞의 뒤 공백은 넣는다(그 자리까지 바꾼다). */
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
  // `long |`처럼 단어 뒤에 띄어 쓴 채 이어 입력하는 중이면 후보를 닫지 않는다.
  if (end > start && caret > end && !text.slice(end, caret).trim()) end = caret;
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
