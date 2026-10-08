import { z } from 'zod';
import type {
  Character,
  EmotionSet,
  Library,
  PieceSet,
  Preset,
  Project,
  Reference,
} from '../domain/types';
import { importSDStudioProject } from '../importers/SDStudioProjectImporter';
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
});

export type ReferenceImagesData = z.infer<typeof imagesSchema>;

const envelope = <K extends string, T extends z.ZodTypeAny>(kind: K, body: T) =>
  z
    .object({ kind: z.literal(kind), schemaVersion: z.number(), exportedAt: z.string().optional() })
    .and(body);

const formats = {
  library: envelope(
    'reference-inpaint-library',
    z.object({ library: librarySchema, images: z.record(z.string(), imagesSchema).default({}) }),
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

/** 가져오기 결과. 모든 항목은 새 ID를 받아 기존 라이브러리 뒤에 추가된다. */
export type ImportBundle = {
  label: string;
  presets: Preset[];
  characters: Character[];
  emotionSets: EmotionSet[];
  references: Reference[];
  projects: Project[];
  pieceSets: PieceSet[];
  /** 새 레퍼런스 ID → 이미지 */
  images: Record<string, ReferenceImagesData>;
  warnings: string[];
};

function emptyBundle(label: string): ImportBundle {
  return {
    label,
    presets: [],
    characters: [],
    emotionSets: [],
    references: [],
    projects: [],
    pieceSets: [],
    images: {},
    warnings: [],
  };
}

/** SDStudio 형식(이름 + 조각 목록)을 새 ID의 프롬프트 조각 세트로 바꾼다. */
function pieceSetFromSDStudio(value: z.infer<typeof sdStudioPieceSetSchema>): PieceSet {
  return createPieceSet(value.name, value.pieces);
}

/** SDStudio 프로젝트 파일의 library 값에서 프롬프트 조각 세트를 꺼낸다. 형식이 맞지 않는 것은 건너뛴다. */
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

/** 라이브러리 백업을 새 ID로 다시 매핑한다(기존 항목과 충돌하지 않게). */
function remapLibrary(library: Library, images: Record<string, ReferenceImagesData>): ImportBundle {
  const bundle = emptyBundle('전체 백업');
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
  bundle.projects = library.projects.map((project) => ({
    ...project,
    id: readableId(project.name, 'project'),
    presetId: ids.get(project.presetId) ?? project.presetId,
    characterId: ids.get(project.characterId) ?? project.characterId,
    emotionSetId: ids.get(project.emotionSetId) ?? project.emotionSetId,
    referenceId: ids.get(project.referenceId) ?? project.referenceId,
    favorites: {},
  }));
  return bundle;
}

/**
 * 파일 내용만으로 형식을 판별해 가져올 항목 묶음으로 바꾼다. 버튼과 드래그앤드롭이 같은 경로를 쓴다.
 * `fallbackPresetId`는 프리셋이 없는 형식(SDStudio 등)으로 작업을 만들 때 쓴다.
 */
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
    return remapLibrary(data.library as Library, data.images);
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
      // 이전 버전 캐릭터 백업: 감정과 레퍼런스까지 함께 들어 있다.
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
    const data = parse(formats.emotions, value, '감정 모음');
    const name = data.name || data.character?.name || stem;
    return {
      ...emptyBundle(`감정 모음 "${name}"`),
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
  if (sdStudioRootSchema.safeParse(value).success) {
    const imported = importSDStudioProject(raw);
    const bundle = emptyBundle(`SDStudio "${imported.character.name}"`);
    bundle.characters = [imported.character];
    bundle.emotionSets = [imported.emotionSet];
    bundle.presets = imported.preset ? [imported.preset] : [];
    // 감정 프롬프트가 부르는 <세트.조각>이 그대로 이어지도록 프로젝트에 든 프롬프트 조각도 가져온다.
    bundle.pieceSets = [
      ...sdStudioLibraryPieceSets(value.library),
      ...(imported.variantSet ? [imported.variantSet] : []),
    ];
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

// ── 내보내기 ────────────────────────────────────────

const stamp = () => new Date().toISOString();

export function exportPreset(preset: Preset) {
  return { kind: 'reference-inpaint-preset', schemaVersion: 2, exportedAt: stamp(), preset };
}

export function exportCharacter(character: Character) {
  return { kind: 'reference-inpaint-character', schemaVersion: 2, exportedAt: stamp(), character };
}

export function exportEmotionSet(set: EmotionSet) {
  return {
    kind: 'reference-inpaint-emotions',
    schemaVersion: 2,
    exportedAt: stamp(),
    name: set.name,
    emotions: set.emotions.map(({ name, prompt }) => ({ name, prompt })),
  };
}

/** SDStudio와 같은 형식으로 내보낸다. 그대로 SDStudio에서 열 수 있다. */
export function exportPieceSet(set: PieceSet) {
  return {
    name: set.name,
    version: 1,
    pieces: set.pieces.map(({ name, prompt, multi }) => ({ name, prompt, multi })),
  };
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

export function exportLibrary(library: Library, images: Record<string, ReferenceImagesData>) {
  const copy = structuredClone(library);
  delete copy.lastProjectId;
  return {
    kind: 'reference-inpaint-library',
    schemaVersion: 2,
    exportedAt: stamp(),
    library: copy,
    images,
  };
}

/** 가져온 항목 ID → 그 내용으로 덮어쓸 기존 항목 ID. 생성 설정·캐릭터·감정 모음·프롬프트 조각만 덮어쓸 수 있다. */
export type ImportOverwrites = Record<string, string>;

/**
 * 이름이 같은 하위 항목(프롬프트 세트·감정)은 기존 ID를 이어받는다.
 * 그래야 작업이 고른 프롬프트 세트와 감정별 생성 결과가 덮어쓴 뒤에도 그대로 이어진다.
 */
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

/**
 * 묶음을 라이브러리에 넣는다. 기본은 새로 추가하고, overwrites에 지정한 항목은
 * 기존 항목의 ID와 이름을 유지한 채 내용만 바꾼다. 그 항목을 쓰는 작업은 그대로 연결된다.
 */
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
      characterId: id(project.characterId),
      promptSetId: id(project.promptSetId),
      emotionSetId: id(project.emotionSetId),
      excludedEmotionIds: project.excludedEmotionIds.map(id),
      favorites: Object.fromEntries(
        Object.entries(project.favorites).map(([emotionId, recordId]) => [id(emotionId), recordId]),
      ),
    };
    // 덮어쓴 캐릭터에 고르던 프롬프트 세트가 없으면 첫 세트로 바꾼다.
    const character = characters.find((item) => item.id === linked.characterId);
    if (character && !character.promptSets.some((set) => set.id === linked.promptSetId))
      linked.promptSetId = character.promptSets[0].id;
    return linked;
  });

  return {
    ...library,
    presets,
    characters,
    emotionSets,
    references: [...library.references, ...bundle.references],
    projects,
    pieceSets,
  };
}

export function bundleSummary(bundle: ImportBundle): string {
  const parts = [
    bundle.presets.length && `생성 설정 ${bundle.presets.length}`,
    bundle.characters.length && `캐릭터 ${bundle.characters.length}`,
    bundle.emotionSets.length && `감정 모음 ${bundle.emotionSets.length}`,
    bundle.references.length && `인페인트 ${bundle.references.length}`,
    bundle.projects.length && `작업 ${bundle.projects.length}`,
    bundle.pieceSets.length && `프롬프트 조각 ${bundle.pieceSets.length}`,
  ].filter(Boolean);
  return `${bundle.label}: ${parts.join(', ') || '추가할 항목 없음'}`;
}
