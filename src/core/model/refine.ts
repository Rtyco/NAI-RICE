import type {
  GenerationSettings,
  Preset,
  Project,
  Reference,
  RefineSettings,
} from '../domain/types';
import { RESOLUTION_PRESETS } from '../imaging/CanvasLayout';
import { RATIO_SIZES, ratioError, type Size } from '../imaging/FreeSize';
import { modelLabel } from '../providers/NaiModels';
import {
  DEFAULT_GENERATION_SETTINGS,
  effectiveGenerationSettings,
  normalizeGenerationSettings,
} from './defaults';

/** 크롭된 결과를 같은 비율로 키우는 업스케일 우회의 기본값. */
export function nearestResolutionPreset(width: number, height: number): Size {
  const { width: w, height: h } = RESOLUTION_PRESETS.reduce((best, item) =>
    ratioError(item, width, height) < ratioError(best, width, height) ? item : best,
  );
  return { width: w, height: h };
}

/** `source`는 다듬을 결과의 크기(인페인트는 잘라 낸 결과 영역). */
export function defaultRefineSettings(
  generation: Pick<GenerationSettings, 'img2imgStrength' | 'img2imgNoise'>,
  source: Size,
): RefineSettings {
  return {
    model: '',
    prompt: 'source',
    size: nearestResolutionPreset(source.width, source.height),
    fit: 'crop',
    strength: generation.img2imgStrength,
    noise: generation.img2imgNoise,
    count: 1,
    seedMode: 'source',
  };
}

export function refineTarget(size: RefineSettings['size'], width: number, height: number): Size {
  return typeof size === 'string' ? RATIO_SIZES[size](width, height) : size;
}

/** 칩에 보이는 값. */
export function refineSummary(settings: RefineSettings): string {
  return [
    settings.model ? modelLabel(settings.model).replace(/^NAI Diffusion /, '') : '같은 모델',
    `세기 ${settings.strength.toFixed(2)}`,
    settings.prompt === 'empty' ? '프롬프트 없이' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

type ProjectParts = [
  project: Pick<Project, 'mode' | 'refine'>,
  preset: Pick<Preset, 'generation'> | undefined,
  reference: Pick<Reference, 'image'> | undefined,
];

/** 이 작업 결과의 크기. 인페인트는 잘라 낸 결과 영역이다. 씬 크기가 따로 있는 씬은 다를 수 있다. */
export function refineSource(...[project, preset, reference]: ProjectParts): Size {
  const generation = normalizeGenerationSettings(preset?.generation ?? DEFAULT_GENERATION_SETTINGS);
  const { width, height } =
    (project.mode === 'reference' ? reference?.image?.outputRect : undefined) ?? generation;
  return { width, height };
}

/** 저장한 값이 없으면 이 작업 결과의 크기로 기본값을 만든다. */
export function projectRefineSettings(...parts: ProjectParts): RefineSettings {
  if (parts[0].refine) return parts[0].refine;
  return defaultRefineSettings(
    normalizeGenerationSettings(parts[1]?.generation ?? DEFAULT_GENERATION_SETTINGS),
    refineSource(...parts),
  );
}

/** 예상 Anlas용. `generation`은 원본 결과의 설정. */
export function refineCostJob(
  settings: RefineSettings,
  generation: GenerationSettings,
  source: Size,
) {
  const target = refineTarget(settings.size, source.width, source.height);
  return {
    kind: 'img2img' as const,
    strength: settings.strength,
    settings: effectiveGenerationSettings({
      ...generation,
      ...(settings.model ? { model: settings.model } : {}),
    }),
    canvasWidth: target.width,
    canvasHeight: target.height,
  };
}
