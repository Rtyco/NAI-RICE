import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { GenerationRecord, QueuedInpaintJob } from '../../src/core/domain/types';
import { DESK_METADATA_KEY, type DeskMetadata } from '../../src/core/metadata/NaiMetadata';
import {
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  renderOutputFilename,
} from '../../src/core/output/OutputFilename';
import { atomicWrite, uniquePath } from './fsUtils';
import { cropWithMetadata, makeThumbnail } from './Images';
import type { GenerationStore } from './ports';

/** 결과 PNG에 함께 남기는 이 앱의 원래 입력. 다시 불러올 때 캐릭터 프롬프트와 감정을 나눠 읽는다. */
export function deskMetadataFor(job: QueuedInpaintJob): DeskMetadata {
  return {
    app: 'reference-inpaint-desk',
    version: 2,
    characterName: job.characterName,
    presetName: job.presetName,
    commonPositive: job.source.commonPositive,
    commonNegative: job.source.commonNegative,
    promptSet: {
      name: job.promptSetName,
      positive: job.source.characterPositive,
      negative: job.characterNegativePrompt,
    },
    emotion: { name: job.emotionName, prompt: job.emotionPrompt },
    seed: job.seed,
    qualityTags: job.settings.qualityTags,
    qualityLevel: job.settings.qualityLevel,
    ucPreset: job.settings.ucPreset,
    model: job.settings.model,
  };
}

/**
 * NovelAI가 돌려준 캔버스에서 결과 영역을 잘라 감정 폴더에 저장하고, 썸네일·진단 캔버스를 남긴 뒤
 * generations.json에 넣을 기록을 만든다.
 */
export async function saveGenerationOutput(
  store: GenerationStore,
  job: QueuedInpaintJob,
  generated: Buffer,
  anlasSpent: number | undefined,
): Promise<GenerationRecord> {
  const { png, crop } = await cropWithMetadata(generated, job.outputRect, {
    [DESK_METADATA_KEY]: JSON.stringify(deskMetadataFor(job)),
  });

  const projectDir = store.projectDir(job.projectId);
  const stem = renderOutputFilename(
    job.outputFilenameTemplate || DEFAULT_OUTPUT_FILENAME_TEMPLATE,
    {
      character: job.characterName,
      emotion: job.emotionName,
      emotionId: job.emotionId.slice(0, 8),
      variant: job.variantIndex,
      seed: job.seed,
      model: job.settings.model,
      createdAt: job.createdAt,
    },
  );
  const generationId = randomUUID();
  const outputPath = await uniquePath(
    store.emotionOutputDir(job.projectId, job.emotionName),
    stem,
    '.png',
  );
  const thumbPath = path.join(projectDir, 'thumbs', `${generationId}.webp`);
  await atomicWrite(outputPath, png);
  await atomicWrite(thumbPath, await makeThumbnail(png));
  let canvasPath: string | undefined;
  if (job.keepDiagnosticCanvas) {
    canvasPath = await uniquePath(path.join(projectDir, 'diagnostic'), `${stem}__canvas`, '.png');
    await atomicWrite(canvasPath, generated);
  }

  return {
    id: generationId,
    projectId: job.projectId,
    emotionId: job.emotionId,
    emotionName: job.emotionName,
    createdAt: new Date().toISOString(),
    file: store.toProjectRelative(job.projectId, outputPath),
    thumbFile: store.toProjectRelative(job.projectId, thumbPath),
    canvasFile: canvasPath ? store.toProjectRelative(job.projectId, canvasPath) : undefined,
    width: crop.width,
    height: crop.height,
    seed: job.seed,
    variantIndex: job.variantIndex,
    presetName: job.presetName,
    characterName: job.characterName,
    promptSetName: job.promptSetName,
    emotionSetName: job.emotionSetName,
    referenceName: job.referenceName,
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    characterPrompt: job.characterPrompt,
    characterNegativePrompt: job.characterNegativePrompt,
    emotionPrompt: job.emotionPrompt,
    settings: job.settings,
    anlasSpent,
  };
}
