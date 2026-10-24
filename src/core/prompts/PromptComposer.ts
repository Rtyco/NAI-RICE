import type { EmotionPosition, ReferenceInsetPosition } from '../domain/types';
import { normalizeTagQuery } from './TagSearch';

export const REFERENCE_INSET = 'reference inset';

export type SeparatedPromptParts = {
  /** 상위 프롬프트 */
  commonPositive?: string;
  /** 상위 바로 뒤. 상위와 함께 `|` 자리를 채운다(SDStudio). */
  extraPrompt?: string;
  /** 하위 프롬프트 */
  backPositive?: string;
  /** reference inset은 이보다 앞에 둔다. */
  qualityTags?: string;
  characterPositive?: string;
  emotion?: string;
  /** 없으면 캐릭터 프롬프트 끝. */
  emotionPosition?: EmotionPosition;
  /** 첫 캐릭터 몫(조합 후보). 위치 설정과 관계없이 캐릭터 쪽이다. */
  characterScene?: string;
  /** 없으면 상위 프롬프트 맨 앞. */
  referenceInset?: { enabled: boolean; position: ReferenceInsetPosition };
};

/** girl, boy, other, 1girl, 2boys … */
const GENDER_TAG = /^(\d+\s*)?(girls?|boys?|others?|women|woman|men|man|males?|females?)$/i;

function cleanFragment(fragment: string | undefined): string {
  if (!fragment) return '';
  return fragment.trim().replace(/^[,\s]+|[,\s]+$/g, '');
}

export function joinFragments(...fragments: Array<string | undefined>): string {
  return fragments.map(cleanFragment).filter(Boolean).join(', ');
}

/** SDStudio `|` 자리: 쉼표·줄바꿈 사이에 `|`만 있는 칸. `{a|b}`·`a|b`의 `|`는 아니다. */
const MARKER = /(?:^|[,\n])[ \t]*\|[ \t]*(?=[,\n]|$)/;

const MARKERS = new RegExp(MARKER, 'g');

function splitMarkers(text: string): string[] {
  return text.includes('|') ? text.split(MARKERS) : [text];
}

export function hasMarker(text: string): boolean {
  return MARKER.test(text);
}

/** 자리 표시는 NovelAI에 보내지 않는다. */
export function dropMarkers(text: string): string {
  return joinFragments(...splitMarkers(text));
}

/** 1.1.2 이전 「공통 | 자리」 생성 설정을 상위·하위로 나눈다. 마지막 자리 뒤가 하위다. */
export function splitAtLastMarker(text: string): { front: string; back: string } | undefined {
  const last = [...text.matchAll(MARKERS)].at(-1);
  if (!last) return undefined;
  return {
    front: cleanFragment(text.slice(0, last.index)),
    back: cleanFragment(text.slice(last.index + last[0].length)),
  };
}

/** SDStudio처럼 `base`의 `|` 자리마다 `insert`를 `|`로 나눈 조각을 차례로 넣고, 남는 조각은 끝에 붙인다. */
export function fillMarkers(base: string, insert: string | undefined): string {
  const slots = splitMarkers(base);
  const parts = splitMarkers(insert ?? '');
  return joinFragments(
    ...slots.flatMap((slot, index) => (index < slots.length - 1 ? [slot, parts[index]] : [slot])),
    ...parts.slice(slots.length - 1),
  );
}

export function insertAfterGenderTag(prompt: string, tag: string): string {
  const pieces = prompt ? prompt.split(',').map((piece) => piece.trim()) : [];
  const at = pieces.length && GENDER_TAG.test(pieces[0]) ? 1 : 0;
  pieces.splice(at, 0, tag);
  return pieces.filter(Boolean).join(', ');
}

/** 사용자가 쓴 reference inset은 그대로 두고, 아직 없을 때만 고른 위치에 넣는다. */
export function composeSeparatedPrompts(parts: SeparatedPromptParts): {
  commonPositive: string;
  characterPositive: string;
} {
  const inset = parts.referenceInset ?? { enabled: true, position: 'common-start' };
  // 순서: 상위, 추가, 씬(중간일 때), 하위, reference inset(끝 위치일 때), 품질 태그.
  const position = parts.emotionPosition ?? 'character-end';
  const front = joinFragments(parts.commonPositive, parts.extraPrompt);
  const common = joinFragments(
    position === 'middle' ? fillMarkers(front, parts.emotion) : dropMarkers(front),
    dropMarkers(parts.backPositive ?? ''),
  );
  // 캐릭터 프롬프트의 `|` 자리는 위치 설정과 관계없이 쓴다(SDStudio 캐릭터 프롬프트와 같다).
  const character = fillMarkers(
    parts.characterPositive ?? '',
    joinFragments(position === 'character-end' ? parts.emotion : undefined, parts.characterScene),
  );
  const quality = cleanFragment(parts.qualityTags);
  const written = referenceInsetCount(common) + referenceInsetCount(character) > 0;
  const where = inset.enabled && !written ? inset.position : undefined;

  const composedCommon = [
    where === 'common-start' ? REFERENCE_INSET : '',
    common,
    where === 'common-end' ? REFERENCE_INSET : '',
    quality,
  ]
    .filter(Boolean)
    .join(', ');

  let characterPositive = character;
  if (where === 'character-start')
    characterPositive = insertAfterGenderTag(character, REFERENCE_INSET);
  if (where === 'character-end')
    characterPositive = [character, REFERENCE_INSET].filter(Boolean).join(', ');

  return { commonPositive: composedCommon, characterPositive };
}

export function removeReferenceInset(prompt: string): string {
  return prompt
    .split(',')
    .map((piece) => piece.trim())
    .filter((piece) => piece && piece.toLowerCase() !== REFERENCE_INSET)
    .join(', ');
}

export function referenceInsetCount(prompt: string): number {
  return prompt.split(',').filter((piece) => piece.trim().toLowerCase() === REFERENCE_INSET).length;
}

/** 강조 괄호와 `1.2::태그::` 가중치를 뺀 태그. 밑줄·공백과 대소문자는 같게 본다. */
export function tagKey(piece: string): string {
  return normalizeTagQuery(
    piece
      .replace(/^\s*-?\d*\.?\d+::/, '')
      .replace(/::\s*$/, '')
      .replace(/[{}[\]()]/g, ''),
  );
}

/** 한 프롬프트 안에서 두 번 이상 나온 태그(`tagKey`). */
export function repeatedTags(prompt: string): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const piece of prompt.split(/[,\n]/)) {
    const key = tagKey(piece);
    if (!key || key === '|') continue;
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return repeated;
}
