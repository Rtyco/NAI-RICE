import type { EmotionPosition, ReferenceInsetPosition } from '../domain/types';

export const REFERENCE_INSET = 'reference inset';

export type SeparatedPromptParts = {
  commonPositive?: string;
  /** 공통 포지티브 맨 끝에 붙는 품질 태그. reference inset은 이보다 앞에 둔다. */
  qualityTags?: string;
  characterPositive?: string;
  emotion?: string;
  /** 감정 프롬프트를 붙일 곳. 생략하면 캐릭터 프롬프트 맨 끝. */
  emotionPosition?: EmotionPosition;
  /** 생략하면 공통 포지티브 맨 앞에 넣는다. */
  referenceInset?: { enabled: boolean; position: ReferenceInsetPosition };
};

/** NovelAI V4 캐릭터 프롬프트 맨 앞의 성별 태그(girl, boy, other, 1girl, 2boys …). */
const GENDER_TAG = /^(\d+\s*)?(girls?|boys?|others?|women|woman|men|man|males?|females?)$/i;

function cleanFragment(fragment: string | undefined): string {
  if (!fragment) return '';
  return fragment.trim().replace(/^[,\s]+|[,\s]+$/g, '');
}

function joinFragments(...fragments: Array<string | undefined>): string {
  return fragments.map(cleanFragment).filter(Boolean).join(', ');
}

/** 첫 태그가 성별이면 그 바로 뒤에, 아니면 맨 앞에 태그를 넣는다. */
export function insertAfterGenderTag(prompt: string, tag: string): string {
  const pieces = prompt ? prompt.split(',').map((piece) => piece.trim()) : [];
  const at = pieces.length && GENDER_TAG.test(pieces[0]) ? 1 : 0;
  pieces.splice(at, 0, tag);
  return pieces.filter(Boolean).join(', ');
}

/**
 * 공통·캐릭터 포지티브를 섞지 않고 만든다. 사용자가 쓴 reference inset은 그대로 두고,
 * 켜져 있을 때 프롬프트에 아직 없으면 고른 위치에 한 번 넣는다.
 */
export function composeSeparatedPrompts(parts: SeparatedPromptParts): {
  commonPositive: string;
  characterPositive: string;
} {
  const inset = parts.referenceInset ?? { enabled: true, position: 'common-start' };
  // 감정은 고른 쪽의 사용자 내용 맨 끝에 붙는다. reference inset(맨 끝 위치)과 품질 태그는 그 뒤에 온다.
  const emotionInCommon = parts.emotionPosition === 'common-end';
  const common = joinFragments(parts.commonPositive, emotionInCommon ? parts.emotion : undefined);
  const character = joinFragments(
    parts.characterPositive,
    emotionInCommon ? undefined : parts.emotion,
  );
  const quality = cleanFragment(parts.qualityTags);
  const written = referenceInsetCount(common) + referenceInsetCount(character) > 0;
  const where = inset.enabled && !written ? inset.position : undefined;

  const commonPositive = [
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

  return { commonPositive, characterPositive };
}

export function referenceInsetCount(prompt: string): number {
  return prompt.split(',').filter((piece) => piece.trim().toLowerCase() === REFERENCE_INSET).length;
}
