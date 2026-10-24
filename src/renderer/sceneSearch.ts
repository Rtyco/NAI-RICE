import type { Emotion } from '../core/domain/types';

export function matchesScene(emotion: Emotion, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || emotion.name.toLowerCase().includes(needle);
}

/** 씬 상세의 이전·다음 순서. 지금 씬이 검색에서 빠졌으면(이름을 바꿨으면) 모든 씬을 따른다. */
export function sceneOrder(emotions: Emotion[], query: string, currentId: string): Emotion[] {
  const found = emotions.filter((emotion) => matchesScene(emotion, query));
  return found.some((emotion) => emotion.id === currentId) ? found : emotions;
}
