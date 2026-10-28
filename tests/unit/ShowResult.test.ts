import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Library } from '../../src/core/domain/types';
import {
  createDefaultLibrary,
  createEmotionSet,
  createProject,
} from '../../src/core/model/defaults';
import type * as StoreModule from '../../src/renderer/store';

let store: typeof StoreModule;
let library: Library;

beforeAll(async () => {
  const desk = new Proxy({}, { get: () => async () => undefined });
  vi.stubGlobal('window', { addEventListener: () => undefined, referenceDesk: desk });
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  store = await import('../../src/renderer/store');
});

beforeEach(() => {
  library = createDefaultLibrary();
  const other = createEmotionSet('다른 모음');
  library.emotionSets.push(other);
  library.projects.push(
    createProject('작업', {
      presetId: library.presets[0].id,
      emotionSetId: library.emotionSets[0].id,
      referenceId: '',
    }),
  );
  store.useStore.setState({
    library,
    view: { kind: 'free' },
    detailEmotionId: undefined,
    generations: { [library.projects[0].id]: [] },
    toasts: [],
  });
});

const project = () => store.useStore.getState().library!.projects[0];
const result = (emotionId: string) => ({
  projectId: project().id,
  id: 'record',
  emotionId,
  emotionName: '씬',
});

describe('히스토리에서 결과 열기', () => {
  it('다른 씬 모음의 씬이면 작업의 씬 모음을 바꾸고 그 씬을 열어', () => {
    const other = library.emotionSets[1];
    store.showResult(result(other.emotions[2].id));
    const state = store.useStore.getState();
    expect(project().emotionSetId).toBe(other.id);
    expect(state.detailEmotionId).toBe(other.emotions[2].id);
    expect(state.resultRequest).toEqual({ projectId: project().id, id: 'record' });
    expect(state.toasts).toEqual([]);
  });

  it('지금 씬 모음의 씬이면 씬 모음은 그대로 둬', () => {
    const current = library.emotionSets[0];
    store.showResult(result(current.emotions[0].id));
    expect(project().emotionSetId).toBe(current.id);
    expect(store.useStore.getState().toasts).toEqual([]);
  });

  it('지운 씬이면 열지 않고 알려', () => {
    store.showResult(result('gone'));
    const state = store.useStore.getState();
    expect(state.detailEmotionId).toBeUndefined();
    expect(state.toasts.map((toast) => toast.message)).toEqual([
      '「씬」 씬이 지워져 결과를 열 수 없습니다.',
    ]);
  });
});
