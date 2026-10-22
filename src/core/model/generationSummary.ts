import type { GenerationRecord, GenerationSummary } from '../domain/types';

export function toGenerationSummary(record: GenerationRecord): GenerationSummary {
  return {
    id: record.id,
    kind: record.kind,
    sourceRecordId: record.sourceRecordId,
    projectId: record.projectId,
    emotionId: record.emotionId,
    emotionName: record.emotionName,
    createdAt: record.createdAt,
    file: record.file,
    thumbFile: record.thumbFile,
    canvasFile: record.canvasFile,
    augment: record.augment,
    aid: record.aid,
    width: record.width,
    height: record.height,
    seed: record.seed,
    variantIndex: record.variantIndex,
    presetName: record.presetName,
    characterName: record.characterName,
    promptSetName: record.promptSetName,
    emotionSetName: record.emotionSetName,
    referenceName: record.referenceName,
    emotionPrompt: record.emotionPrompt,
    emotionNegative: record.emotionNegative,
    anlasSpent: record.anlasSpent,
    anlasEstimate: record.anlasEstimate,
    model: record.settings.model,
  };
}
