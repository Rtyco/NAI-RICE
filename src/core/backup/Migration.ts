import type { EmotionSet, Library, Project, Reference } from '../domain/types';
import { DEFAULT_SETTINGS, createReference, newId, readableId } from '../model/defaults';
import type { V1Character, V1Workspace } from '../validation/schemas';

export type V1CharacterMove = {
  /** characters/<id> 폴더를 그대로 projects/<id>로 옮긴다(생성 결과 경로 유지). */
  projectId: string;
  /** reference/ 안의 파일을 references/<id>/로 복사한다. 이미지가 없으면 undefined. */
  referenceId?: string;
};

function stripReferenceDir(file: string): string {
  return file.replace(/^reference\//, '');
}

/** v1 캐릭터 하나를 캐릭터·감정 모음·레퍼런스·작업으로 나눈다. 감정 ID는 생성 기록과 맞도록 유지한다. */
export function splitV1Character(
  v1: V1Character,
  presetId: string,
  projectId: string = v1.id,
): { library: Pick<Library, 'characters' | 'emotionSets' | 'references' | 'projects'>; referenceId?: string } {
  const character = { id: newId(), name: v1.name, promptSets: v1.promptSets, createdAt: v1.createdAt };
  const emotionSet: EmotionSet = {
    id: newId(),
    name: `${v1.name} 감정`,
    emotions: v1.emotions.map(({ id, name, prompt }) => ({ id, name, prompt })),
  };
  let reference: Reference;
  if (v1.reference) {
    const r = v1.reference;
    reference = {
      id: readableId(v1.name, 'reference'),
      name: v1.name,
      image: {
        originalFile: stripReferenceDir(r.originalFile),
        canvasFile: stripReferenceDir(r.canvasFile),
        maskFile: stripReferenceDir(r.maskFile),
        originalName: r.originalName,
        canvasWidth: r.canvasWidth,
        canvasHeight: r.canvasHeight,
        referenceRect: r.referenceRect,
        outputRect: r.outputRect,
      },
      layout: r.layout,
      maskExpansionPx: r.maskExpansionPx,
      backgroundThreshold: r.backgroundThreshold,
      updatedAt: r.updatedAt,
    };
  } else {
    reference = createReference(v1.name);
  }
  const favorites: Record<string, string> = {};
  for (const emotion of v1.emotions) {
    if (emotion.favoriteGenerationId) favorites[emotion.id] = emotion.favoriteGenerationId;
  }
  const project: Project = {
    id: projectId,
    name: v1.name,
    presetId,
    characterId: character.id,
    promptSetId: v1.promptSets.some((set) => set.id === v1.activePromptSetId) ? v1.activePromptSetId : v1.promptSets[0].id,
    emotionSetId: emotionSet.id,
    referenceId: reference.id,
    excludedEmotionIds: v1.emotions.filter((emotion) => !emotion.enabled).map((emotion) => emotion.id),
    favorites,
    createdAt: v1.createdAt,
    updatedAt: v1.updatedAt,
  };
  return {
    library: { characters: [character], emotionSets: [emotionSet], references: [reference], projects: [project] },
    referenceId: v1.reference ? reference.id : undefined,
  };
}

export function migrateV1(workspace: V1Workspace, characters: V1Character[]): { library: Library; moves: V1CharacterMove[] } {
  const library: Library = {
    schemaVersion: 2,
    settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      outputFilenameTemplate: workspace.outputFilenameTemplate,
      keepDiagnosticCanvas: workspace.keepDiagnosticCanvas,
      export: { ...workspace.export, quality: Math.round(workspace.export.quality) },
    },
    presets: workspace.presets,
    pieceSets: [],
    characters: [],
    emotionSets: workspace.emotionTemplates.map((template) => ({
      id: newId(),
      name: template.name,
      emotions: template.emotions.map((emotion) => ({ id: newId(), ...emotion })),
    })),
    references: [],
    projects: [],
    lastProjectId: workspace.lastCharacterId,
  };
  const presetId = workspace.presets.some((preset) => preset.id === workspace.activePresetId)
    ? workspace.activePresetId
    : workspace.presets[0].id;
  const moves: V1CharacterMove[] = [];
  for (const v1 of characters) {
    const split = splitV1Character(v1, presetId);
    library.characters.push(...split.library.characters);
    library.emotionSets.push(...split.library.emotionSets);
    library.references.push(...split.library.references);
    library.projects.push(...split.library.projects);
    moves.push({ projectId: v1.id, referenceId: split.referenceId });
  }
  return { library, moves };
}
