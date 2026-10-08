import { buildJobs } from '../core/jobs/JobBuilder';
import { resolveProject } from '../core/model/defaults';
import { validateOutputFilenameTemplate } from '../core/output/OutputFilename';
import { flushSaves, run, toast, useStore } from './store';
import { libraryApi, queueApi } from './desktop';

export type GenerateOptions = {
  seed?: number;
  variants?: number;
};

/** 작업의 선택한 감정들을 생성 큐에 등록한다. */
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

    const reference = resolved.reference!;
    const preset = resolved.preset!;
    const input = await libraryApi().prepareInputs(project.id, reference);
    const jobs = buildJobs({
      project,
      preset,
      characterName: resolved.character!.name,
      promptSet: resolved.promptSet!,
      emotionSet: resolved.emotionSet!,
      reference,
      emotionIds,
      input,
      settings: library.settings,
      pieceSets: library.pieceSets,
      seedOverride: options.seed,
      variantsOverride: options.variants,
    });
    if (!jobs.length) throw new Error('생성할 감정이 없습니다. 프롬프트가 있는 감정을 선택하십시오.');

    const result = await queueApi().enqueueGeneration({ jobs });
    useStore.setState({ queue: result.snapshot });
    toast(result.cancelled ? '생성 요청을 취소했습니다.' : `${jobs.length}개의 작업을 생성 큐에 등록했습니다.`);
  }).then(() => undefined);
}

/** 일괄 생성 대상: 제외하지 않았고 프롬프트가 있는 감정. */
export function batchEmotionIds(projectId: string): string[] {
  const library = useStore.getState().library;
  const project = library?.projects.find((item) => item.id === projectId);
  if (!library || !project) return [];
  const set = library.emotionSets.find((item) => item.id === project.emotionSetId);
  const excluded = new Set(project.excludedEmotionIds);
  return (set?.emotions ?? []).filter((emotion) => !excluded.has(emotion.id) && emotion.prompt.trim()).map((e) => e.id);
}
