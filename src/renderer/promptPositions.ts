import type { EmotionPosition } from '../core/domain/types';

export const PROMPT_POSITIONS: Record<EmotionPosition, string> = {
  middle: '상위와 하위 사이 (중간)',
  'character-end': '캐릭터 프롬프트 맨 끝',
};
