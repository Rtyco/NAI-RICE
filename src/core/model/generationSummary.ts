import type { GenerationRecord, GenerationSummary } from '../domain/types';

/** 화면 목록에 보낼 요약. 최종 프롬프트와 설정은 빼고 모델 이름만 남긴다. */
export function toGenerationSummary(record: GenerationRecord): GenerationSummary {
  return {
    id: record.id,
    projectId: record.projectId,
    emotionId: record.emotionId,
    emotionName: record.emotionName,
    createdAt: record.createdAt,
    file: record.file,
    thumbFile: record.thumbFile,
    canvasFile: record.canvasFile,
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
    anlasSpent: record.anlasSpent,
    model: record.settings.model,
  };
}
