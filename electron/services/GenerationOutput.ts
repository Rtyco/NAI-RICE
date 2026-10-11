import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { GenerationRecord, QueuedGenerationJob } from '../../src/core/domain/types';
import { DESK_METADATA_KEY, type DeskMetadata } from '../../src/core/metadata/NaiMetadata';
import {
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
  renderOutputFilename,
} from '../../src/core/output/OutputFilename';
import { usesMedium } from '../../src/core/providers/NaiModels';
import { atomicWrite, uniquePath } from './fsUtils';
import { cropWithMetadata, encodeForStorage, makeThumbnail, withMetadata } from './Images';
import type { GenerationStore } from './ports';

/** 결과 PNG에 함께 남기는 이 앱의 원래 입력. 다시 불러올 때 캐릭터 프롬프트와 감정을 나눠 읽는다. */
export function deskMetadataFor(job: QueuedGenerationJob): DeskMetadata {
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
    ...(usesMedium(job.settings) ? { effort: 'medium' as const } : {}),
    ...(job.extraCharacters ? { extraCharacters: job.extraCharacters } : {}),
  };
}

function localDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 인페인트는 캔버스에서 결과 영역만 잘라 낸다. 자유 생성 i2i도 64 배수로 넣은 여백을 잘라 낸다. 나머지는
 * 받은 이미지가 그대로 결과다.
 */
async function resultImage(
  job: QueuedGenerationJob,
  generated: Buffer,
  metadata: Record<string, string>,
): Promise<{ png: Buffer; width: number; height: number }> {
  const rect =
    job.kind === 'inpaint' ? job.outputRect : job.kind === 'img2img' ? job.outputRect : undefined;
  if (!rect) return withMetadata(generated, metadata);
  const { png, crop } = await cropWithMetadata(generated, rect, metadata);
  return { png, width: crop.width, height: crop.height };
}

/**
 * NovelAI가 돌려준 이미지를 감정 폴더에 저장하고, 썸네일·진단 캔버스를 남긴 뒤
 * generations.json에 넣을 기록을 만든다.
 */
export async function saveGenerationOutput(
  store: GenerationStore,
  job: QueuedGenerationJob,
  generated: Buffer,
  anlasSpent: number | undefined,
): Promise<GenerationRecord> {
  const { png, width, height } = await resultImage(job, generated, {
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
  // 감정이 없는 자유 생성은 만든 날짜(현지 시각)별 폴더에 모은다.
  const folder = job.emotionId ? job.emotionName : localDate(job.createdAt);
  const format = store.settings?.storageFormat ?? 'png';
  const output = await encodeForStorage(png, format);
  const outputPath = await uniquePath(
    store.emotionOutputDir(job.projectId, job.kind, folder),
    stem,
    output.extension,
  );
  const thumbPath = path.join(projectDir, 'thumbs', `${generationId}.webp`);
  await atomicWrite(outputPath, output.buffer);
  await atomicWrite(thumbPath, await makeThumbnail(png));
  let canvasPath: string | undefined;
  if (job.kind === 'inpaint' && job.keepDiagnosticCanvas) {
    const canvas = await encodeForStorage(generated, format);
    canvasPath = await uniquePath(
      path.join(projectDir, 'diagnostic'),
      `${stem}__canvas`,
      canvas.extension,
    );
    await atomicWrite(canvasPath, canvas.buffer);
  }

  return {
    id: generationId,
    kind: job.kind,
    ...(job.sourceRecordId ? { sourceRecordId: job.sourceRecordId } : {}),
    projectId: job.projectId,
    emotionId: job.emotionId,
    emotionName: job.emotionName,
    createdAt: new Date().toISOString(),
    file: store.toProjectRelative(job.projectId, outputPath),
    thumbFile: store.toProjectRelative(job.projectId, thumbPath),
    canvasFile: canvasPath ? store.toProjectRelative(job.projectId, canvasPath) : undefined,
    ...(job.kind === 'img2img' || job.kind === 'augment' ? { inputFile: job.imagePath } : {}),
    width,
    height,
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
    ...(job.extraCharacters ? { extraCharacters: job.extraCharacters } : {}),
    ...(job.characterCenters ? { characterCenters: job.characterCenters } : {}),
    emotionPrompt: job.emotionPrompt,
    settings: job.settings,
    anlasSpent,
    anlasEstimate: job.anlasEstimate,
  };
}
