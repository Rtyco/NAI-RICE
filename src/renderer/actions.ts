import {
  buildFreeAugmentJobs,
  buildFreeJobs,
  buildJobs,
  buildResultAugmentJobs,
  buildResultInpaintJobs,
  buildSceneImg2ImgJobs,
  buildTxt2ImgJobs,
  FREE_FILENAME_TEMPLATE,
  type AugmentTarget,
  type ImageJobInput,
  type JobCharacter,
} from '../core/jobs/JobBuilder';
import type {
  AugmentSettings,
  FreeImage,
  GenerationJobSnapshot,
  GenerationSummary,
  JobAid,
  Library,
  LineFixSettings,
  RefineSettings,
} from '../core/domain/types';
import {
  augmentToolInfo,
  DEFAULT_AUGMENT_SETTINGS,
  freeAugmentSize,
} from '../core/providers/NaiAugment';
import {
  aidItems,
  effectiveGenerationSettings,
  FREE_PROJECT_ID,
  projectAid,
} from '../core/model/defaults';
import {
  hasScenePrompt,
  img2imgMissing,
  resolveProject,
  type ResolvedCharacter,
  type ResolvedProject,
} from '../core/model/defaults';
import { buildRefineJobs, freeAutoRefine, projectRefineSettings } from '../core/model/refine';
import { validateOutputFilenameTemplate } from '../core/output/OutputFilename';
import { modelLabel, supportsInpaint } from '../core/providers/NaiModels';
import { flushSaves, resolveFreeGeneration, run, toast, useStore } from './store';
import { libraryApi, queueApi } from './desktop';
import { applyPendingDrawing, dropSourceFiles, findBorderLineMask, saveMask } from './freeImageOps';
import type { AidValue } from './components/AidChip';

function jobCharacters(characters: ResolvedCharacter[]): JobCharacter[] {
  return characters.map(({ character, promptSet, center }) => ({
    name: character.name,
    promptSet,
    center,
  }));
}

async function prepareAid(
  library: Library,
  choice: AidValue,
  projectId: string,
): Promise<JobAid | undefined> {
  const aid = projectAid(library, choice);
  if (!aid) return undefined;
  const items = aidItems(aid);
  if (items.some((item) => !item?.image))
    throw new Error(
      `고른 ${aid.kind === 'character' ? '캐릭터 레퍼런스' : '바이브'} 중 지워졌거나 그림이 없는 것이 있습니다. 참고 칩에서 다시 고르십시오.`,
    );
  if (aid.kind === 'character') {
    return {
      kind: 'character',
      references: await Promise.all(
        aid.references.map(async ({ item }) => ({
          name: item!.name,
          ...(await libraryApi().prepareAidInput(projectId, item!.image!.file, 'character')),
          target: item!.target,
          strength: item!.strength,
          fidelity: item!.fidelity,
        })),
      ),
    };
  }
  return {
    kind: 'vibe',
    vibes: await Promise.all(
      aid.vibes.map(async ({ item }) => ({
        name: item!.name,
        ...(await libraryApi().prepareAidInput(projectId, item!.image!.file, 'vibe')),
        strength: item!.strength,
        informationExtracted: item!.informationExtracted,
        ...(item!.encodingId ? { encodingId: item!.encodingId } : {}),
      })),
    ),
    normalize: choice.normalizeVibes ?? true,
  };
}

export type GenerateOptions = {
  seed?: number;
  variants?: number;
  comboKey?: string;
};

/** 씬 상세·자유 생성은 이미지 칸에 생성 대기 수가 보여, 알림이 생성 버튼만 가린다. */
async function enqueue(jobs: GenerationJobSnapshot[], message: string): Promise<void> {
  const result = await queueApi().enqueueGeneration({ jobs });
  useStore.setState({ queue: result.snapshot });
  const { view, detailEmotionId } = useStore.getState();
  const onStage = (job: GenerationJobSnapshot) =>
    view.kind === 'free'
      ? job.projectId === FREE_PROJECT_ID
      : view.kind === 'project' &&
        job.projectId === view.projectId &&
        job.emotionId === detailEmotionId;
  if (!jobs.every(onStage)) toast(message);
}

async function projectJobInput(
  projectId: string,
  emotionIds: string[],
  options: GenerateOptions,
  img2img: boolean,
) {
  await flushSaves();
  const state = useStore.getState();
  const library = state.library;
  const project = library?.projects.find((item) => item.id === projectId);
  if (!library || !project) throw new Error('작업을 찾을 수 없습니다.');
  const resolved = resolveProject(library, project);
  const missing = img2img ? img2imgMissing(resolved.missing) : resolved.missing;
  if (missing.length) {
    throw new Error(
      `이 작업에 ${missing.join(', ')}이(가) 없습니다. 상단에서 선택하거나 만들어 주십시오.`,
    );
  }
  if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
  const templateError = validateOutputFilenameTemplate(library.settings.outputFilenameTemplate);
  if (templateError) throw new Error(`결과 파일명 규칙 오류: ${templateError}`);

  return {
    library,
    resolved,
    common: {
      project,
      preset: resolved.preset!,
      characters: jobCharacters(resolved.characters),
      emotionSet: resolved.emotionSet!,
      emotionIds,
      settings: library.settings,
      pieceSets: library.pieceSets,
      seedOverride: options.seed,
      variantsOverride: options.variants,
      comboKey: options.comboKey,
      aid: await prepareAid(library, project, project.id),
    },
  };
}

function enqueueProjectJobs(
  resolved: ResolvedProject,
  jobs: GenerationJobSnapshot[],
): Promise<void> {
  if (!jobs.length) throw new Error('생성할 씬이 없습니다. 프롬프트가 있는 씬을 선택하십시오.');
  const { project } = resolved;
  if (project.autoRefine) {
    const refine = projectRefineSettings(project, resolved.preset, resolved.reference);
    jobs = jobs.map((job) => ({ ...job, refine }));
  }
  return enqueue(jobs, `${jobs.length}개의 작업을 생성 큐에 등록했습니다.`);
}

export function generateEmotions(
  projectId: string,
  emotionIds: string[],
  options: GenerateOptions = {},
): Promise<void> {
  return run('생성 작업을 준비하는 중', async () => {
    const { resolved, common } = await projectJobInput(projectId, emotionIds, options, false);
    const reference = resolved.reference!;
    const jobs =
      common.project.mode === 'txt2img'
        ? buildTxt2ImgJobs(common)
        : buildJobs({
            ...common,
            reference,
            input: await libraryApi().prepareInputs(projectId, reference),
          });
    await enqueueProjectJobs(resolved, jobs);
  }).then(() => undefined);
}

export function generateSceneImg2Img(
  projectId: string,
  emotionId: string,
  options: GenerateOptions = {},
): Promise<void> {
  return run('생성 작업을 준비하는 중', async () => {
    await applyPendingDrawing();
    await saveMask();
    const { resolved, common } = await projectJobInput(projectId, [emotionId], options, true);
    const scene = common.project.sceneImg2Img?.[emotionId];
    const image = await prepareImageInput(
      projectId,
      scene?.image,
      Boolean(scene?.inpaint),
      common.preset.generation.model,
    );
    await enqueueProjectJobs(resolved, buildSceneImg2ImgJobs({ ...common, image }));
  }).then(() => undefined);
}

async function prepareImageInput(
  projectId: string,
  source: FreeImage | undefined,
  inpaint: boolean,
  model: string,
): Promise<ImageJobInput> {
  if (!source) throw new Error('i2i로 다시 그릴 이미지를 먼저 고르십시오.');
  if (inpaint) {
    if (!source.maskFile) throw new Error('다시 그릴 곳에 마스크를 칠하십시오.');
    if (!supportsInpaint(model))
      throw new Error(
        `${modelLabel(model)}은(는) 인페인팅을 지원하지 않습니다. 생성 설정에서 모델을 바꾸거나 인페인팅을 끄십시오.`,
      );
  }
  const { mask, ...prepared } = await libraryApi().prepareSourceInput({
    projectId,
    file: source.file,
    ...(inpaint ? { maskFile: source.maskFile } : {}),
  });
  return {
    image: prepared,
    mask,
    width: source.width,
    height: source.height,
    outputRect: source.outputRect,
    ...(inpaint && source.fromReference ? { reference: source.fromReference } : {}),
    sourceRecordId:
      source.fromRecord?.projectId === projectId ? source.fromRecord.generationId : undefined,
  };
}

/** `prompt`·`seed`를 주면 그 값으로 다시 만든다. */
export function generateFree(
  options: { prompt?: string; seed?: number; count?: number } = {},
): Promise<void> {
  return run('생성 작업을 준비하는 중', async () => {
    await applyPendingDrawing();
    await saveMask();
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    if (!library) throw new Error('라이브러리를 읽지 못했습니다.');
    const { free, preset, characters } = resolveFreeGeneration(library);
    if (!preset) throw new Error('생성 설정이 없습니다. 라이브러리에서 하나 만드십시오.');
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const prompt = options.prompt ?? free.prompt;

    const image =
      free.mode === 'img2img'
        ? await prepareImageInput(
            FREE_PROJECT_ID,
            free.image,
            free.inpaint,
            preset.generation.model,
          )
        : undefined;
    const jobs = buildFreeJobs({
      preset,
      characters: jobCharacters(characters),
      positionMode: free.positionMode,
      prompt,
      negative: free.negative,
      promptPosition: free.promptPosition,
      count: options.count ?? free.count,
      pieceSets: library.pieceSets,
      seedOverride: options.seed,
      image,
      aid: await prepareAid(library, free, FREE_PROJECT_ID),
    });
    const refine = freeAutoRefine(free, preset);
    await enqueue(
      refine ? jobs.map((job) => ({ ...job, refine })) : jobs,
      `${jobs.length}장을 생성 큐에 등록했습니다.`,
    );
  }).then(() => undefined);
}

/** 결과는 원래 감정(또는 자유 생성)에 쌓인다. */
export function sendResultsToImg2Img(
  projectId: string,
  records: GenerationSummary[],
  options: RefineSettings,
): Promise<void> {
  return run('다듬기 작업을 준비하는 중', async () => {
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    if (!library) throw new Error('라이브러리를 읽지 못했습니다.');
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const free = projectId === FREE_PROJECT_ID;
    const project = library.projects.find((item) => item.id === projectId);
    if (!free && !project) throw new Error('작업을 찾을 수 없습니다.');
    const full = [];
    for (const summary of records)
      full.push(await libraryApi().getGeneration(projectId, summary.id));
    const jobs = await buildRefineJobs(
      options,
      full,
      {
        projectName: free ? '자유 생성' : project!.name,
        outputFilenameTemplate: free
          ? FREE_FILENAME_TEMPLATE
          : library.settings.outputFilenameTemplate,
      },
      (request) => libraryApi().prepareImageInput(request),
    );
    if (!jobs.length) throw new Error('다듬을 결과가 없습니다.');
    await enqueue(jobs, `다듬기 ${jobs.length}장을 생성 큐에 등록했습니다.`);
  }).then(() => undefined);
}

/** 구분선을 찾지 못한 결과는 빼고, 결과는 원래 씬(또는 자유 생성)에 쌓인다. */
export function fixBorderLines(
  projectId: string,
  records: GenerationSummary[],
  settings: LineFixSettings,
): Promise<void> {
  return run('구분선 지우기를 준비하는 중', async () => {
    await flushSaves();
    const state = useStore.getState();
    const library = state.library;
    if (!library) throw new Error('라이브러리를 읽지 못했습니다.');
    if (!state.token.stored) throw new Error('설정(⚙)에서 NovelAI 토큰을 먼저 저장하십시오.');
    const free = projectId === FREE_PROJECT_ID;
    const project = library.projects.find((item) => item.id === projectId);
    if (!free && !project) throw new Error('작업을 찾을 수 없습니다.');
    const jobs: GenerationJobSnapshot[] = [];
    let missed = 0;
    for (const summary of records) {
      const record = await libraryApi().getGeneration(projectId, summary.id);
      const { model } = effectiveGenerationSettings({
        ...record.settings,
        ...(settings.model ? { model: settings.model } : {}),
      });
      if (!supportsInpaint(model))
        throw new Error(
          `${modelLabel(model)}은(는) 인페인팅을 지원하지 않습니다. 구분선 지우기 창에서 모델을 고르십시오.`,
        );
      const stored = await libraryApi().addSourceImage({
        kind: 'record',
        projectId,
        generationId: record.id,
      });
      const found = await findBorderLineMask(stored, settings.marginPx);
      if (!found) {
        missed += 1;
        dropSourceFiles(stored);
        continue;
      }
      const { mask, ...image } = await libraryApi().prepareSourceInput({
        projectId,
        file: stored.file,
        maskFile: found.maskFile,
      });
      dropSourceFiles({ file: stored.file, maskFile: found.maskFile });
      if (!mask) continue;
      jobs.push(
        ...buildResultInpaintJobs({
          ...settings,
          record,
          image,
          mask,
          width: stored.width,
          height: stored.height,
          outputRect: stored.outputRect,
          projectName: free ? '자유 생성' : project!.name,
          outputFilenameTemplate: free
            ? FREE_FILENAME_TEMPLATE
            : library.settings.outputFilenameTemplate,
        }),
      );
    }
    if (missed) toast(`${missed}장은 구분선을 찾지 못해 뺐습니다.`);
    if (!jobs.length) throw new Error('구분선을 찾은 결과가 없습니다.');
    await enqueue(jobs, `구분선 지우기 ${jobs.length}장을 생성 큐에 등록했습니다.`);
  }).then(() => undefined);
}

export type DirectorToolOptions = AugmentSettings & {
  shrink: boolean;
};

export function directorToolSize(
  record: Pick<GenerationSummary, 'width' | 'height'>,
  shrink: boolean,
): { width: number; height: number } {
  return shrink
    ? freeAugmentSize(record.width, record.height)
    : { width: record.width, height: record.height };
}

/** `targets`(Emotion 툴 씬 세트)가 있으면 그 씬들에 하나씩, 없으면 원래 씬에 쌓는다. */
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
    await enqueue(
      jobs,
      `${augmentToolInfo(options.tool).label} ${jobs.length}건을 생성 큐에 등록했습니다.`,
    );
  }).then(() => undefined);
}

/** 여백을 뺀 원래 영역에 적용한다. */
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
    await enqueue(
      jobs,
      `${augmentToolInfo(settings.tool).label} ${jobs.length}건을 생성 큐에 등록했습니다.`,
    );
  }).then(() => undefined);
}

/** 제외하지 않았고 프롬프트가 있는 감정 */
export function batchEmotionIds(projectId: string): string[] {
  const library = useStore.getState().library;
  const project = library?.projects.find((item) => item.id === projectId);
  if (!library || !project) return [];
  const set = library.emotionSets.find((item) => item.id === project.emotionSetId);
  const excluded = new Set(project.excludedEmotionIds);
  return (set?.emotions ?? [])
    .filter((emotion) => !excluded.has(emotion.id) && hasScenePrompt(emotion))
    .map((e) => e.id);
}
