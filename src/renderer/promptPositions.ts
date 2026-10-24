import type { EmotionPosition } from '../core/domain/types';

export const PROMPT_POSITIONS: Record<EmotionPosition, string> = {
  'common-end': '공통 포지티브 맨 끝',
  'common-marker': '공통 포지티브의 | 자리',
  'character-end': '캐릭터 프롬프트 맨 끝',
};
