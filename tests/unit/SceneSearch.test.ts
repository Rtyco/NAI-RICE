import { describe, expect, it } from 'vitest';
import { createEmotion } from '../../src/core/model/defaults';
import { matchesScene, sceneOrder } from '../../src/renderer/sceneSearch';

const scenes = ['Smile', '웃음', '울음', 'angry'].map((name) => createEmotion(name));

describe('scene search', () => {
  it('matches part of the name, ignoring case and spaces around the query', () => {
    expect(
      scenes.filter((scene) => matchesScene(scene, ' smi ')).map((scene) => scene.name),
    ).toEqual(['Smile']);
    expect(scenes.filter((scene) => matchesScene(scene, '음')).length).toBe(2);
    expect(scenes.filter((scene) => matchesScene(scene, '')).length).toBe(4);
  });

  it('steps through the results, or through every scene when the current one is not in them', () => {
    expect(sceneOrder(scenes, '음', scenes[1].id).map((scene) => scene.name)).toEqual([
      '웃음',
      '울음',
    ]);
    expect(sceneOrder(scenes, '음', scenes[0].id)).toBe(scenes);
  });
});
