import { z } from 'zod';
import type {
  Character,
  CharacterReference,
  EmotionSet,
  Library,
  PieceSet,
  Preset,
  Project,
  Reference,
  Vibe,
} from '../domain/types';
import { importSDStudioProject } from '../importers/SDStudioProjectImporter';
import {
  exportSDStudioCharacter,
  exportSDStudioPieceSet,
  exportSDStudioScenes,
  importSDStudioCharacters,
  isSDStudioCharacterFile,
  sceneTexts,
  usedPieceSets,
} from './SDStudioFiles';
import { createPieceSet, newId, readableId } from '../model/defaults';
import {
  characterSchema,
  librarySchema,
  presetSchema,
  referenceSchema,
  sdStudioPieceSetSchema,
  sdStudioRootSchema,
  v1CharacterSchema,
  v1WorkspaceSchema,
} from '../validation/schemas';
import { splitV1Character } from './Migration';

export class BackupImportError extends Error {}

const imagesSchema = z.object({
  original: z.string().startsWith('data:'),
  canvas: z.string().startsWith('data:'),
  mask: z.string().startsWith('data:'),
  paint: z.string().startsWith('data:').optional(),
});

export type ReferenceImagesData = z.infer<typeof imagesSchema>;

const envelope = <K extends string, T extends z.ZodTypeAny>(kind: K, body: T) =>
  z
    .object({ kind: z.literal(kind), schemaVersion: z.number(), exportedAt: z.string().optional() })
    .and(body);

const PROJECT_PARTS = {
  presets: true,
  characters: true,
  emotionSets: true,
  references: true,
  characterReferences: true,
  vibes: true,
  projects: true,
  pieceSets: true,
} as const;

export type ProjectLibrary = Pick<Library, keyof typeof PROJECT_PARTS>;

const formats = {
  library: envelope(
    'reference-inpaint-library',
    z.object({
      library: librarySchema,
      images: z.record(z.string(), imagesSchema).default({}),
      // `pictures/` 파일 이름 → data URL. 예전 백업에는 없다.
      pictures: z.record(z.string(), z.string()).default({}),
    }),
  ),
  project: envelope(
    'reference-inpaint-project',
    z.object({
      library: librarySchema.pick(PROJECT_PARTS),
      images: z.record(z.string(), imagesSchema).default({}),
      pictures: z.record(z.string(), z.string()).default({}),
    }),
  ),
  preset: envelope('reference-inpaint-preset', z.object({ preset: presetSchema })),
  character: envelope('reference-inpaint-character', z.object({ character: characterSchema })),
  characterV1: envelope(
    'reference-inpaint-character',
    z.object({ character: v1CharacterSchema, images: imagesSchema.optional() }),
  ),
  emotions: envelope(
    'reference-inpaint-emotions',
    z.object({
      name: z.string().optional(),
      character: z.object({ name: z.string() }).partial().passthrough().optional(),
      emotions: z.array(z.object({ name: z.string().min(1), prompt: z.string() })).min(1),
    }),
  ),
  reference: envelope(
    'reference-inpaint-reference',
    z.object({ reference: referenceSchema, images: imagesSchema.optional() }),
  ),
  workspaceV1: envelope(
    'reference-inpaint-workspace',
    z.object({ workspace: v1WorkspaceSchema.omit({ lastCharacterId: true }) }),
  ),
};

/** 모든 항목은 새 ID를 받는다. */
export type ImportBundle = {
  label: string;
  presets: Preset[];
  characters: Character[];
  emotionSets: EmotionSet[];
  references: Reference[];
  characterReferences: CharacterReference[];
  vibes: Vibe[];
  projects: Project[];
  pieceSets: PieceSet[];
  /** 레퍼런스 ID → 이미지 */
  images: Record<string, ReferenceImagesData>;
  /** 파일 이름 → data URL. 내용 해시 이름이다. */
  pictures: Record<string, string>;
  warnings: string[];
};

function emptyBundle(label: string): ImportBundle {
  return {
    label,
    presets: [],
    characters: [],
    emotionSets: [],
    references: [],
    characterReferences: [],
    vibes: [],
    projects: [],
    pieceSets: [],
    images: {},
    pictures: {},
    warnings: [],
  };
}

function pieceSetFromSDStudio(value: z.infer<typeof sdStudioPieceSetSchema>): PieceSet {
  return createPieceSet(value.name, value.pieces);
}

function sdStudioLibraryPieceSets(value: unknown): PieceSet[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap((entry) => {
    const parsed = sdStudioPieceSetSchema.safeParse(entry);
    return parsed.success ? [pieceSetFromSDStudio(parsed.data)] : [];
  });
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BackupImportError('파일을 읽을 수 없습니다. JSON 문법을 확인하십시오.');
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    throw new BackupImportError(`${label} 파일 형식이 올바르지 않습니다${path}.`);
  }
  return result.data;
}

function remapLibrary(
  library: ProjectLibrary,
  images: Record<string, ReferenceImagesData>,
  pictures: Record<string, string>,
  label = '전체 백업',
): ImportBundle {
  const bundle = emptyBundle(label);
  const ids = new Map<string, string>();
  const map = (old: string, next: string) => (ids.set(old, next), next);
  bundle.presets = library.presets.map((item) => ({ ...item, id: map(item.id, newId()) }));
  bundle.characters = library.characters.map((item) => ({ ...item, id: map(item.id, newId()) }));
  bundle.emotionSets = library.emotionSets.map((item) => ({ ...item, id: map(item.id, newId()) }));
  bundle.pieceSets = (library.pieceSets ?? []).map((item) => ({ ...item, id: newId() }));
  bundle.references = library.references.map((item) => {
    const id = map(item.id, readableId(item.name, 'reference'));
    if (images[item.id]) bundle.images[id] = images[item.id];
    return { ...item, id, image: images[item.id] ? item.image : undefined };
  });
  const withPicture = <T extends { image?: { file: string } }>(item: T): T =>
    item.image && pictures[item.image.file] ? item : { ...item, image: undefined };
  bundle.characterReferences = library.characterReferences.map((item) =>
    withPicture({ ...item, id: map(item.id, newId()) }),
  );
  bundle.vibes = library.vibes.map((item) => withPicture({ ...item, id: map(item.id, newId()) }));
  bundle.pictures = pictures;
  const linked = (id: string | undefined) => (id ? ids.get(id) : undefined);
  bundle.projects = library.projects.map((project) => ({
    ...project,
    id: readableId(project.name, 'project'),
    characterReferenceIds: project.characterReferenceIds.flatMap((id) => linked(id) ?? []),
    vibeIds: project.vibeIds.flatMap((id) => linked(id) ?? []),
    presetId: ids.get(project.presetId) ?? project.presetId,
    characters: project.characters.map((slot) => ({
      ...slot,
      characterId: ids.get(slot.characterId) ?? slot.characterId,
    })),
    emotionSetId: ids.get(project.emotionSetId) ?? project.emotionSetId,
    referenceId: ids.get(project.referenceId) ?? project.referenceId,
    favorites: {},
  }));
  return bundle;
}

/** 내용만으로 형식을 판별한다. `fallbackPresetId`는 프리셋이 없는 형식(SDStudio 등)용. */
export function parseImportFile(
  raw: string,
  fileName: string,
  fallbackPresetId: string,
): ImportBundle {
  const value = parseJson(raw) as Record<string, unknown>;
  const kind = typeof value?.kind === 'string' ? value.kind : '';
  const stem = fileName.replace(/\.json$/i, '');

  if (kind === 'reference-inpaint-library') {
    const data = parse(formats.library, value, '전체 백업');
    return remapLibrary(data.library, data.images, data.pictures);
  }
  if (kind === 'reference-inpaint-project') {
    const data = parse(formats.project, value, '작업');
    const name = data.library.projects[0]?.name ?? stem;
    return remapLibrary(data.library, data.images, data.pictures, `작업 "${name}"`);
  }
  if (kind === 'reference-inpaint-preset') {
    const data = parse(formats.preset, value, '생성 설정');
    return {
      ...emptyBundle(`생성 설정 "${data.preset.name}"`),
      presets: [{ ...data.preset, id: newId() }],
    };
  }
  if (kind === 'reference-inpaint-character') {
    if (value.schemaVersion === 1) {
      // 예전 캐릭터 백업: 감정과 레퍼런스까지 들어 있다.
      const data = parse(formats.characterV1, value, '캐릭터 백업');
      const split = splitV1Character(
        data.character,
        fallbackPresetId,
        readableId(data.character.name, 'project'),
      );
      const bundle: ImportBundle = {
        ...emptyBundle(`캐릭터 "${data.character.name}" (이전 형식)`),
        ...split.library,
        images: {},
      };
      bundle.projects = bundle.projects.map((project) => ({ ...project, favorites: {} }));
      if (data.images && split.referenceId) bundle.images[split.referenceId] = data.images;
      else
        bundle.references = bundle.references.map((reference) => ({
          ...reference,
          image: undefined,
        }));
      return bundle;
    }
    const data = parse(formats.character, value, '캐릭터');
    return {
      ...emptyBundle(`캐릭터 "${data.character.name}"`),
      characters: [{ ...data.character, id: newId() }],
    };
  }
  if (kind === 'reference-inpaint-emotions') {
    const data = parse(formats.emotions, value, '씬 모음');
    const name = data.name || data.character?.name || stem;
    return {
      ...emptyBundle(`씬 모음 "${name}"`),
      emotionSets: [
        {
          id: newId(),
          name,
          emotions: data.emotions.map((item) => ({
            id: newId(),
            name: item.name,
            prompt: item.prompt,
          })),
        },
      ],
    };
  }
  if (kind === 'reference-inpaint-reference') {
    const data = parse(formats.reference, value, '인페인트');
    const id = readableId(data.reference.name, 'reference');
    const bundle = emptyBundle(`인페인트 "${data.reference.name}"`);
    bundle.references = [
      { ...data.reference, id, image: data.images ? data.reference.image : undefined },
    ];
    if (data.images) bundle.images[id] = data.images;
    return bundle;
  }
  if (kind === 'reference-inpaint-workspace') {
    const data = parse(formats.workspaceV1, value, '전역 설정 백업');
    return {
      ...emptyBundle('이전 전역 설정 백업'),
      presets: data.workspace.presets.map((preset) => ({ ...preset, id: newId() })),
      emotionSets: data.workspace.emotionTemplates.map((template) => ({
        id: newId(),
        name: template.name,
        emotions: template.emotions.map((emotion) => ({ id: newId(), ...emotion })),
      })),
    };
  }
  if (isSDStudioCharacterFile(value)) {
    const characters = importSDStudioCharacters(value);
    return {
      ...emptyBundle(`SDStudio 캐릭터 프리셋 "${characters.map((item) => item.name).join(', ')}"`),
      characters,
    };
  }
  if (sdStudioRootSchema.safeParse(value).success) {
    const imported = importSDStudioProject(raw);
    const bundle = emptyBundle(`SDStudio "${String(value.name)}"`);
    bundle.characters = imported.characters;
    bundle.emotionSets = [imported.emotionSet];
    bundle.presets = imported.presets;
    bundle.projects = imported.project ? [imported.project] : [];
    // 씬 프롬프트의 <세트.조각>이 이어지도록 조각도 가져온다.
    bundle.pieceSets = sdStudioLibraryPieceSets(value.library);
    bundle.warnings = imported.warnings.map((warning) => warning.message);
    return bundle;
  }
  const pieceFile = sdStudioPieceSetSchema.safeParse(value);
  if (pieceFile.success) {
    const bundle = emptyBundle(`프롬프트 조각 "${pieceFile.data.name}"`);
    bundle.pieceSets = [pieceSetFromSDStudio(pieceFile.data)];
    return bundle;
  }
  throw new BackupImportError(
    '지원하지 않는 JSON입니다. 이 앱의 백업·내보내기 파일이나 SDStudio 캐릭터·프롬프트 조각 파일을 사용할 수 있습니다.',
  );
}

const stamp = () => new Date().toISOString();

export function exportPreset(preset: Preset) {
  return { kind: 'reference-inpaint-preset', schemaVersion: 2, exportedAt: stamp(), preset };
}

/** SDStudio 캐릭터 프리셋 파일. 예전 `reference-inpaint-character` 파일도 계속 읽는다. */
export function exportCharacter(character: Character) {
  return exportSDStudioCharacter(character);
}

/** SDStudio 프로젝트 파일(씬만). 씬이 부르는 조각 세트를 함께 넣는다. */
export function exportEmotionSet(set: EmotionSet, pieceSets: PieceSet[] = []) {
  return exportSDStudioScenes(set, pieceSets);
}

export function exportPieceSet(set: PieceSet) {
  return exportSDStudioPieceSet(set);
}

export function exportReference(reference: Reference, images?: ReferenceImagesData) {
  return {
    kind: 'reference-inpaint-reference',
    schemaVersion: 2,
    exportedAt: stamp(),
    reference,
    images,
  };
}

export function exportLibrary(
  library: Library,
  images: Record<string, ReferenceImagesData>,
  pictures: Record<string, string> = {},
) {
  const copy = structuredClone(library);
  delete copy.lastProjectId;
  return {
    kind: 'reference-inpaint-library',
    schemaVersion: 2,
    exportedAt: stamp(),
    library: copy,
    images,
    pictures,
  };
}

/** 생성 결과를 넣지 않아 대표 이미지(`favorites`)도 비운다. */
export function projectLibrary(library: Library, projectId: string): ProjectLibrary {
  const project = library.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('작업을 찾을 수 없습니다.');
  const ids = new Set([
    project.presetId,
    project.emotionSetId,
    project.referenceId,
    ...project.characters.map((slot) => slot.characterId),
    ...project.characterReferenceIds,
    ...project.vibeIds,
  ]);
  const pick = <T extends { id: string }>(items: T[]) => items.filter((item) => ids.has(item.id));
  const presets = pick(library.presets);
  const characters = pick(library.characters);
  const emotionSets = pick(library.emotionSets);
  const texts = [
    project.extraPrompt ?? '',
    ...presets.flatMap((preset) => [
      preset.commonPositive,
      preset.backPositive,
      preset.commonNegative,
    ]),
    ...characters.flatMap((character) =>
      character.promptSets.flatMap((set) => [set.positive, set.negative]),
    ),
    ...emotionSets.flatMap((set) => set.emotions.flatMap(sceneTexts)),
  ];
  return {
    presets,
    characters,
    emotionSets,
    references: pick(library.references),
    characterReferences: pick(library.characterReferences),
    vibes: pick(library.vibes),
    projects: [{ ...project, favorites: {} }],
    pieceSets: usedPieceSets(texts, library.pieceSets),
  };
}

/** 생성 결과는 넣지 않는다. */
export function exportProject(
  library: ProjectLibrary,
  images: Record<string, ReferenceImagesData>,
  pictures: Record<string, string> = {},
) {
  return {
    kind: 'reference-inpaint-project',
    schemaVersion: 2,
    exportedAt: stamp(),
    library,
    images,
    pictures,
  };
}

/** 가져온 ID → 덮어쓸 기존 ID. 생성 설정·캐릭터·감정 모음·프롬프트 조각만. */
export type ImportOverwrites = Record<string, string>;

/** 이름이 같은 하위 항목은 기존 ID를 이어받아야 작업의 선택과 감정별 결과가 이어진다. */
function keepIdsByName<T extends { id: string; name: string }>(
  previous: T[],
  next: T[],
  remapped: Map<string, string>,
): T[] {
  const byName = new Map(previous.map((item) => [item.name, item.id]));
  const used = new Set<string>();
  return next.map((item) => {
    const id = byName.get(item.name);
    if (!id || used.has(id)) return item;
    used.add(id);
    remapped.set(item.id, id);
    return { ...item, id };
  });
}

/** overwrites 항목은 기존 ID·이름을 유지하고 내용만 바꿔 작업 연결이 유지된다. */
export function mergeBundle(
  library: Library,
  bundle: ImportBundle,
  overwrites: ImportOverwrites = {},
): Library {
  const remapped = new Map<string, string>();
  const merge = <T extends { id: string }>(
    current: T[],
    incoming: T[],
    replace: (old: T, item: T) => T,
  ) => {
    let result = [...current];
    for (const item of incoming) {
      const old = overwrites[item.id]
        ? result.find((entry) => entry.id === overwrites[item.id])
        : undefined;
      if (!old) {
        result.push(item);
        continue;
      }
      remapped.set(item.id, old.id);
      result = result.map((entry) => (entry.id === old.id ? replace(old, item) : entry));
    }
    return result;
  };

  const presets = merge(library.presets, bundle.presets, (old, item) => ({
    ...item,
    id: old.id,
    name: old.name,
  }));
  const characters = merge(library.characters, bundle.characters, (old, item) => ({
    ...item,
    id: old.id,
    name: old.name,
    createdAt: old.createdAt,
    promptSets: keepIdsByName(old.promptSets, item.promptSets, remapped),
  }));
  const emotionSets = merge(library.emotionSets, bundle.emotionSets, (old, item) => ({
    ...item,
    id: old.id,
    name: old.name,
    emotions: keepIdsByName(old.emotions, item.emotions, remapped),
  }));
  const pieceSets = merge(library.pieceSets ?? [], bundle.pieceSets, (old, item) => ({
    ...item,
    id: old.id,
    name: old.name,
    pieces: keepIdsByName(old.pieces, item.pieces, remapped),
  }));
  const id = (value: string) => remapped.get(value) ?? value;
  const projects = [...library.projects, ...bundle.projects].map((project) => {
    const linked = {
      ...project,
      presetId: id(project.presetId),
      characters: project.characters.map((slot) => {
        const next = {
          ...slot,
          characterId: id(slot.characterId),
          promptSetId: id(slot.promptSetId),
        };
        const character = characters.find((item) => item.id === next.characterId);
        if (character && !character.promptSets.some((set) => set.id === next.promptSetId))
          next.promptSetId = character.promptSets[0].id;
        return next;
      }),
      emotionSetId: id(project.emotionSetId),
      excludedEmotionIds: project.excludedEmotionIds.map(id),
      favorites: Object.fromEntries(
        Object.entries(project.favorites).map(([emotionId, recordId]) => [id(emotionId), recordId]),
      ),
    };
    return linked;
  });

  return {
    ...library,
    presets,
    characters,
    emotionSets,
    references: [...library.references, ...bundle.references],
    characterReferences: [...library.characterReferences, ...bundle.characterReferences],
    vibes: [...library.vibes, ...bundle.vibes],
    projects,
    pieceSets,
  };
}

export function bundleSummary(bundle: ImportBundle): string {
  const parts = [
    bundle.presets.length && `생성 설정 ${bundle.presets.length}`,
    bundle.characters.length && `캐릭터 ${bundle.characters.length}`,
    bundle.emotionSets.length && `씬 모음 ${bundle.emotionSets.length}`,
    bundle.references.length && `인페인트 ${bundle.references.length}`,
    bundle.characterReferences.length && `캐릭터 레퍼런스 ${bundle.characterReferences.length}`,
    bundle.vibes.length && `바이브 ${bundle.vibes.length}`,
    bundle.projects.length && `작업 ${bundle.projects.length}`,
    bundle.pieceSets.length && `프롬프트 조각 ${bundle.pieceSets.length}`,
  ].filter(Boolean);
  return `${bundle.label}: ${parts.join(', ') || '추가할 항목 없음'}`;
}
