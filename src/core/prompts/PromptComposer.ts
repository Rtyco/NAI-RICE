import type { EmotionPosition, ReferenceInsetPosition } from '../domain/types';

export const REFERENCE_INSET = 'reference inset';

export type SeparatedPromptParts = {
  commonPositive?: string;
  /** reference inset은 이보다 앞에 둔다. */
  qualityTags?: string;
  characterPositive?: string;
  emotion?: string;
  /** 없으면 캐릭터 프롬프트 끝. */
  emotionPosition?: EmotionPosition;
  /** 첫 캐릭터 몫(조합 후보). 위치 설정과 관계없이 캐릭터 쪽이다. */
  characterScene?: string;
  /** 없으면 공통 포지티브 맨 앞. */
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

/**
 * SDStudio처럼 `base`의 `|` 자리마다 `insert`를 `|`로 나눈 조각을 차례로 넣는다. 조각이 남으면 마지막 자리에
 * 모두 넣는다(SDStudio는 상위 프롬프트 끝에 붙이는데, 가져올 때 상위 끝에 `|`를 하나 더 두어 같게 만든다).
 * 자리가 없으면 끝에 붙인다.
 */
export function fillMarkers(base: string, insert: string | undefined): string {
  const slots = splitMarkers(base);
  const parts = splitMarkers(insert ?? '');
  if (slots.length < 2) return joinFragments(base, ...parts);
  const last = slots.length - 2;
  return joinFragments(
    ...slots.flatMap((slot, index) =>
      index > last ? [slot] : [slot, ...parts.slice(index, index === last ? undefined : index + 1)],
    ),
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
  // 순서: 사용자 내용, 감정, reference inset(끝 위치일 때), 품질 태그.
  const position = parts.emotionPosition ?? 'character-end';
  const commonPositive = parts.commonPositive ?? '';
  const common =
    position === 'common-marker'
      ? fillMarkers(commonPositive, parts.emotion)
      : joinFragments(
          dropMarkers(commonPositive),
          position === 'common-end' ? dropMarkers(parts.emotion ?? '') : undefined,
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
