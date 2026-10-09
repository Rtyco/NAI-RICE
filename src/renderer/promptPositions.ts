import type { EmotionPosition } from '../core/domain/types';

/** 씬 프롬프트(생성 설정)와 자유 생성 프롬프트를 붙일 위치. 두 화면이 같은 이름을 쓴다. */
export const PROMPT_POSITIONS: Record<EmotionPosition, string> = {
  'common-end': '공통 포지티브 맨 끝',
  'character-end': '캐릭터 프롬프트 맨 끝',
};
