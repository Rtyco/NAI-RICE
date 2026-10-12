import {
  buildFreeAugmentJobs,
  buildFreeJobs,
  buildJobs,
  buildResultAugmentJobs,
  buildResultImg2ImgJobs,
  buildTxt2ImgJobs,
  FREE_FILENAME_TEMPLATE,
  type AugmentTarget,
  type JobCharacter,
} from '../core/jobs/JobBuilder';
import type {
  AugmentSettings,
  GenerationJobSnapshot,
  GenerationSummary,
} from '../core/domain/types';
import {
  augmentToolInfo,
  DEFAULT_AUGMENT_SETTINGS,
  freeAugmentSize,
} from '../core/providers/NaiAugment';
import { FREE_PROJECT_ID } from '../core/model/defaults';
import { hasScenePrompt, resolveProject, type ResolvedCharacter } from '../core/model/defaults';
import { validateOutputFilenameTemplate } from '../core/output/OutputFilename';
import { modelLabel, supportsInpaint } from '../core/providers/NaiModels';
import { flushSaves, resolveFreeGeneration, run, toast, useStore } from './store';
import { libraryApi, queueApi } from './desktop';
import { saveFreeMask } from './freeImageOps';

function jobCharacters(characters: ResolvedCharacter[]): JobCharacter[] {
  return characters.map(({ character, promptSet, center }) => ({
    name: character.name,
    promptSet,
    center,
  }));
}

export type GenerateOptions = {
  seed?: number;
  variants?: number;
};

export function generateEmotions(projectId: string, emotionIds: string[], options: GenerateOptions = {}): Promise<void> {
  return run('생성 작업을 준비하는 중', async () => {
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    const project = library?.projects.find((item) => item.id === projectId);
    if (!library || !project) throw new Error('작업을 찾을 수 없습니다.');
    const resolved = resolveProject(library, project);
    if (resolved.missing.length) {
      throw new Error(`이 작업에 ${resolved.missing.join(', ')}이(가) 없습니다. 상단에서 선택하거나 만들어 주십시오.`);
    }
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const templateError = validateOutputFilenameTemplate(library.settings.outputFilenameTemplate);
    if (templateError) throw new Error(`결과 파일명 규칙 오류: ${templateError}`);

    const common = {
      project,
      preset: resolved.preset!,
      characters: jobCharacters(resolved.characters),
      emotionSet: resolved.emotionSet!,
      emotionIds,
      settings: library.settings,
      pieceSets: library.pieceSets,
      seedOverride: options.seed,
      variantsOverride: options.variants,
    };
    const reference = resolved.reference!;
    let jobs: GenerationJobSnapshot[];
    if (project.mode === 'txt2img') jobs = buildTxt2ImgJobs(common);
    else {
      jobs = buildJobs({
        ...common,
        reference,
        input: await libraryApi().prepareInputs(project.id, reference),
      });
    }
    if (!jobs.length) throw new Error('생성할 씬이 없습니다. 프롬프트가 있는 씬을 선택하십시오.');

    const result = await queueApi().enqueueGeneration({ jobs });
    useStore.setState({ queue: result.snapshot });
    toast(result.cancelled ? '생성 요청을 취소했습니다.' : `${jobs.length}개의 작업을 생성 큐에 등록했습니다.`);
  }).then(() => undefined);
}

/** 자유 생성 화면의 지금 값으로 생성한다. `prompt`·`seed`를 주면 그 값으로 다시 만든다. */
export function generateFree(
  options: { prompt?: string; seed?: number; count?: number } = {},
): Promise<void> {
  return run('생성 작업을 준비하는 중', async () => {
    await saveFreeMask();
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    if (!library) throw new Error('라이브러리를 읽지 못했습니다.');
    const { free, preset, characters, promptSet } = resolveFreeGeneration(library);
    if (!preset) throw new Error('생성 설정이 없습니다. 라이브러리에서 하나 만드십시오.');
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const prompt = options.prompt ?? free.prompt;
    if (!prompt.trim() && !promptSet?.positive.trim()) throw new Error('프롬프트를 입력하십시오.');

    let image;
    if (free.mode === 'img2img') {
      const source = free.image;
      if (!source) throw new Error('i2i로 다시 그릴 이미지를 먼저 고르십시오.');
      if (free.inpaint) {
        if (!source.maskFile) throw new Error('다시 그릴 곳에 마스크를 칠하십시오.');
        if (!supportsInpaint(preset.generation.model))
          throw new Error(
            `${modelLabel(preset.generation.model)}은(는) 인페인팅을 지원하지 않습니다. 생성 설정에서 모델을 바꾸거나 인페인팅을 끄십시오.`,
          );
      }
      const { mask, ...prepared } = await libraryApi().prepareSourceInput({
        projectId: FREE_PROJECT_ID,
        file: source.file,
        ...(free.inpaint ? { maskFile: source.maskFile } : {}),
      });
      image = {
        image: prepared,
        mask,
        width: source.width,
        height: source.height,
        outputRect: source.outputRect,
        sourceRecordId:
          source.fromRecord?.projectId === FREE_PROJECT_ID
            ? source.fromRecord.generationId
            : undefined,
      };
    }
    const jobs = buildFreeJobs({
      preset,
      characters: jobCharacters(characters),
      positionMode: free.positionMode,
      prompt,
      promptPosition: free.promptPosition,
      count: options.count ?? free.count,
      pieceSets: library.pieceSets,
      seedOverride: options.seed,
      image,
    });
    const result = await queueApi().enqueueGeneration({ jobs });
    useStore.setState({ queue: result.snapshot });
    toast(
      result.cancelled ? '생성 요청을 취소했습니다.' : `${jobs.length}장을 생성 큐에 등록했습니다.`,
    );
  }).then(() => undefined);
}

export type ResultImg2ImgOptions = {
  width: number;
  height: number;
  fit: 'crop' | 'pad';
  strength: number;
  noise: number;
  count: number;
  seedMode: 'source' | 'random';
};

/** 결과들을 i2i로 다시 그린다. 결과는 원래 감정(자유 생성이면 자유 생성)에 새 결과로 쌓인다. */
export function sendResultsToImg2Img(
  projectId: string,
  records: GenerationSummary[],
  options: ResultImg2ImgOptions,
): Promise<void> {
  return run('i2i 작업을 준비하는 중', async () => {
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    if (!library) throw new Error('라이브러리를 읽지 못했습니다.');
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const free = projectId === FREE_PROJECT_ID;
    const project = library.projects.find((item) => item.id === projectId);
    if (!free && !project) throw new Error('작업을 찾을 수 없습니다.');
    const jobs: GenerationJobSnapshot[] = [];
    for (const summary of records) {
      const record = await libraryApi().getGeneration(projectId, summary.id);
      const image = await libraryApi().prepareImageInput({
        projectId,
        source: { kind: 'record', projectId, generationId: record.id },
        width: options.width,
        height: options.height,
        fit: options.fit,
      });
      jobs.push(
        ...buildResultImg2ImgJobs({
          record,
          image,
          ...options,
          projectName: free ? '자유 생성' : project!.name,
          outputFilenameTemplate: free
            ? FREE_FILENAME_TEMPLATE
            : library.settings.outputFilenameTemplate,
        }),
      );
    }
    if (!jobs.length) throw new Error('i2i로 보낼 결과가 없습니다.');
    const result = await queueApi().enqueueGeneration({ jobs });
    useStore.setState({ queue: result.snapshot });
    toast(
      result.cancelled
        ? '생성 요청을 취소했습니다.'
        : `i2i ${jobs.length}장을 생성 큐에 등록했습니다.`,
    );
  }).then(() => undefined);
}

export type DirectorToolOptions = AugmentSettings & {
  /** 무료 면적을 넘는 이미지를 무료 면적 안으로 줄여 보낸다. */
  shrink: boolean;
};

/** 디렉터 툴에 보낼 크기. */
export function directorToolSize(
  record: Pick<GenerationSummary, 'width' | 'height'>,
  shrink: boolean,
): { width: number; height: number } {
  return shrink
    ? freeAugmentSize(record.width, record.height)
    : { width: record.width, height: record.height };
}

/**
 * 결과마다 디렉터 툴을 적용한다. `targets`가 없으면 원래 씬에 쌓고, 있으면(Emotion 툴로 씬 세트 만들기)
 * 그 씬들에 하나씩 쌓는다.
 */
export function runDirectorTool(
  projectId: string,
  entries: Array<{ record: GenerationSummary; targets?: AugmentTarget[] }>,
  options: DirectorToolOptions,
): Promise<void> {
  return run('디렉터 툴 작업을 준비하는 중', async () => {
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    if (!library) throw new Error('라이브러리를 읽지 못했습니다.');
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const free = projectId === FREE_PROJECT_ID;
    const project = library.projects.find((item) => item.id === projectId);
    if (!free && !project) throw new Error('작업을 찾을 수 없습니다.');
    const jobs: GenerationJobSnapshot[] = [];
    for (const entry of entries) {
      const record = await libraryApi().getGeneration(projectId, entry.record.id);
      const size = directorToolSize(record, options.shrink);
      const image = await libraryApi().prepareImageInput({
        projectId,
        source: { kind: 'record', projectId, generationId: record.id },
        ...size,
        fit: 'crop',
      });
      jobs.push(
        ...buildResultAugmentJobs({
          record,
          image,
          ...size,
          ...options,
          targets: entry.targets,
          projectName: free ? '자유 생성' : project!.name,
          outputFilenameTemplate: free
            ? FREE_FILENAME_TEMPLATE
            : library.settings.outputFilenameTemplate,
        }),
      );
    }
    if (!jobs.length) throw new Error('디렉터 툴을 적용할 결과가 없습니다.');
    const result = await queueApi().enqueueGeneration({ jobs });
    useStore.setState({ queue: result.snapshot });
    toast(
      result.cancelled
        ? '생성 요청을 취소했습니다.'
        : `${augmentToolInfo(options.tool).label} ${jobs.length}건을 생성 큐에 등록했습니다.`,
    );
  }).then(() => undefined);
}

/** 자유 생성의 디렉터 툴: 고른 이미지(여백을 뺀 원래 영역)에 툴을 적용한다. */
export function runFreeDirectorTool(shrink: boolean): Promise<void> {
  return run('디렉터 툴 작업을 준비하는 중', async () => {
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    if (!library) throw new Error('라이브러리를 읽지 못했습니다.');
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const free = library.freeGeneration;
    const source = free.image;
    if (!source) throw new Error('디렉터 툴을 적용할 이미지를 먼저 고르십시오.');
    const settings = free.augment ?? DEFAULT_AUGMENT_SETTINGS;
    const size = directorToolSize(source.outputRect, shrink);
    const image = await libraryApi().prepareSourceInput({
      projectId: FREE_PROJECT_ID,
      file: source.file,
      crop: { rect: source.outputRect, ...size },
    });
    const jobs = buildFreeAugmentJobs({
      image,
      ...size,
      settings,
      sourceRecordId:
        source.fromRecord?.projectId === FREE_PROJECT_ID
          ? source.fromRecord.generationId
          : undefined,
    });
    const result = await queueApi().enqueueGeneration({ jobs });
    useStore.setState({ queue: result.snapshot });
    toast(
      result.cancelled
        ? '생성 요청을 취소했습니다.'
        : `${augmentToolInfo(settings.tool).label} ${jobs.length}건을 생성 큐에 등록했습니다.`,
    );
  }).then(() => undefined);
}

/** 일괄 생성 대상: 제외하지 않았고 프롬프트가 있는 감정. */
export function batchEmotionIds(projectId: string): string[] {
  const library = useStore.getState().library;
  const project = library?.projects.find((item) => item.id === projectId);
  if (!library || !project) return [];
  const set = library.emotionSets.find((item) => item.id === project.emotionSetId);
  const excluded = new Set(project.excludedEmotionIds);
  return (set?.emotions ?? []).filter((emotion) => !excluded.has(emotion.id) && hasScenePrompt(emotion)).map((e) => e.id);
}
