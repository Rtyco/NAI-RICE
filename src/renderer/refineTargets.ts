import type { FreeGeneration, Preset, Project, RefineSettings } from '../core/domain/types';
import type { Size } from '../core/imaging/FreeSize';
import type { ResolvedProject } from '../core/model/defaults';
import {
  freeRefineSettings,
  freeRefineSource,
  projectRefineSettings,
  refineSource,
} from '../core/model/refine';
import { updateFreeGeneration, updateProject } from './store';

/** 작업과 자유 생성이 같은 칩과 토글을 쓴다. */
export type RefineTarget = {
  settings: RefineSettings;
  on: boolean;
  /** 다듬을 결과의 크기 */
  source: Size;
  /** 칩 툴팁과 설정 창에 보이는 저장 위치 */
  savedIn: string;
  save: (refine: RefineSettings) => void;
  setOn: (on: boolean) => void;
};

export function projectRefineTarget({ project, preset, reference }: ResolvedProject): RefineTarget {
  const patch = (value: Partial<Project>) =>
    updateProject(project.id, (current) => ({ ...current, ...value }));
  return {
    settings: projectRefineSettings(project, preset, reference),
    on: Boolean(project.autoRefine),
    source: refineSource(project, preset, reference),
    savedIn: '작업',
    save: (refine) => patch({ refine }),
    setOn: (autoRefine) => patch({ autoRefine }),
  };
}

export function freeRefineTarget(free: FreeGeneration, preset: Preset | undefined): RefineTarget {
  return {
    settings: freeRefineSettings(free, preset),
    on: Boolean(free.autoRefine),
    source: freeRefineSource(free, preset),
    savedIn: '자유 생성',
    save: (refine) => updateFreeGeneration({ refine }),
    setOn: (autoRefine) => updateFreeGeneration({ autoRefine }),
  };
}
