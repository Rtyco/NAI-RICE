import type { Emotion } from '../core/domain/types';
import { sceneOrder } from './sceneSearch';
import { sceneQueryOf, useStore } from './store';

export function useSceneOrder(projectId: string, emotions: Emotion[], currentId: string) {
  const query = useStore(sceneQueryOf(projectId)).trim();
  const order = sceneOrder(emotions, query, currentId);
  const index = order.findIndex((emotion) => emotion.id === currentId);
  return {
    order,
    previous: order[index - 1],
    next: order[index + 1],
    title: query && order !== emotions ? `씬 목록 (검색 「${query}」 결과)` : '씬 목록',
  };
}
