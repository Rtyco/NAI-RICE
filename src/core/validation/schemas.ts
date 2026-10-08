import { z } from 'zod';
import { DEFAULT_OUTPUT_FILENAME_TEMPLATE } from '../output/OutputFilename';

export const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const generationSettingsSchema = z.object({
  model: z.string(),
  sampler: z.string(),
  steps: z.number().int().positive(),
  promptGuidance: z.number().finite(),
  cfgRescale: z.number().finite(),
  noiseSchedule: z.string(),
  inpaintStrength: z.number().min(0).max(1),
  seedMode: z.enum(['fixed', 'random-per-job']),
  fixedSeed: z.number().int().nonnegative().optional(),
  variantsPerEmotion: z.number().int().min(1).max(20),
  qualityTags: z.boolean().default(false),
  qualityLevel: z.enum(['standard', 'light']).default('standard'),
  ucPreset: z.enum(['none', 'heavy', 'light', 'human', 'furry']).default('none'),
  referenceInset: z.boolean().default(true),
  referenceInsetPosition: z
    .enum(['common-start', 'common-end', 'character-start', 'character-end'])
    .default('common-start'),
  emotionPosition: z.enum(['character-end', 'common-end']).default('character-end'),
});

export const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  commonPositive: z.string(),
  commonNegative: z.string(),
  generation: generationSettingsSchema,
});

const promptSetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  positive: z.string(),
  negative: z.string(),
});

export const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  promptSets: z.array(promptSetSchema).min(1),
  createdAt: z.string(),
});

export const emotionSetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  emotions: z.array(z.object({ id: z.string().min(1), name: z.string(), prompt: z.string() })),
});

export const promptPieceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  prompt: z.string(),
  multi: z.boolean().default(false),
});

export const pieceSetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  pieces: z.array(promptPieceSchema),
});

/**
 * SDStudio의 옛 조각 형식 `{description, pieces: {이름: 내용}, multi: {이름: 참}}`을
 * 지금 형식으로 바꾼다(SDStudio migratePieceLibrary와 같다).
 */
function migrateLegacyPieceSet(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const legacy = value as { name?: unknown; description?: unknown; pieces?: unknown; multi?: unknown };
  if (typeof legacy.pieces !== 'object' || legacy.pieces === null || Array.isArray(legacy.pieces))
    return value;
  const multi = (typeof legacy.multi === 'object' && legacy.multi) || {};
  return {
    name: legacy.description ?? legacy.name,
    version: 1,
    pieces: Object.entries(legacy.pieces).map(([name, prompt]) => ({
      name,
      prompt,
      multi: (multi as Record<string, unknown>)[name],
    })),
  };
}

/** SDStudio 프롬프트 조각 파일. 프로젝트 파일의 library 값도 이 모양이다. */
export const sdStudioPieceSetSchema = z.preprocess(
  migrateLegacyPieceSet,
  z.object({
    name: z.string().min(1),
    version: z.number().optional(),
    pieces: z.array(
      z.object({
        name: z.string(),
        prompt: z.string().default(''),
        multi: z
          .boolean()
          .nullish()
          .transform((multi) => multi ?? false),
      }),
    ),
  }),
);

export const canvasLayoutSchema = z.object({
  mode: z.enum(['auto', 'prepared']),
  resolution: z.enum(['1216x832', '832x1216', '1024x1024', 'custom']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  referenceSide: z.enum(['left', 'right', 'top', 'bottom']),
  referenceRatio: z.number().min(0.1).max(0.9),
  fit: z.enum(['contain', 'cover']),
  anchor: z.enum(['top', 'center', 'bottom']).default('center'),
  background: z.string(),
});

/** 레퍼런스·작업 ID. 폴더 이름으로 그대로 쓰므로 글자·숫자·하이픈만 허용한다. */
export const FOLDER_ID = /^[\p{L}\p{N}-]+$/u;

export const referenceSchema = z.object({
  id: z.string().regex(FOLDER_ID),
  name: z.string(),
  image: z
    .object({
      originalFile: z.string(),
      canvasFile: z.string(),
      maskFile: z.string(),
      originalName: z.string(),
      canvasWidth: z.number().int().positive(),
      canvasHeight: z.number().int().positive(),
      referenceRect: rectSchema,
      outputRect: rectSchema,
    })
    .optional(),
  layout: canvasLayoutSchema,
  maskExpansionPx: z.number().nonnegative(),
  backgroundThreshold: z.number().min(0).max(255),
  updatedAt: z.string(),
});

export const projectSchema = z.object({
  id: z.string().regex(FOLDER_ID),
  name: z.string(),
  presetId: z.string(),
  characterId: z.string(),
  promptSetId: z.string(),
  emotionSetId: z.string(),
  referenceId: z.string(),
  excludedEmotionIds: z.array(z.string()).default([]),
  favorites: z.record(z.string(), z.string()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const appSettingsSchema = z.object({
  outputFilenameTemplate: z.string().min(1).default(DEFAULT_OUTPUT_FILENAME_TEMPLATE),
  keepDiagnosticCanvas: z.boolean().default(true),
  export: z
    .object({
      format: z.enum(['png', 'webp', 'avif']),
      quality: z.number().int().min(1).max(100),
      target: z.enum(['favorite', 'latest']),
    })
    .default({ format: 'png', quality: 90, target: 'favorite' }),
  // 이전 버전의 naiTags(직접 고친 품질 태그 문구)는 NovelAI 고정값으로 바뀌어 읽지 않는다.
  requestDelayMs: z.number().int().min(0).max(1000).default(300),
  tagAutocomplete: z.boolean().default(true),
  appearance: z
    .object({
      theme: z.enum(['navy', 'graphite', 'violet', 'forest', 'rose']).catch('navy'),
      mode: z.enum(['dark', 'light', 'system']).catch('dark'),
    })
    .default({ theme: 'navy', mode: 'dark' }),
  update: z
    .object({
      autoCheck: z.boolean().default(true),
      skippedVersion: z.string().default(''),
    })
    .default({ autoCheck: true, skippedVersion: '' }),
});

export const librarySchema = z.object({
  schemaVersion: z.literal(2),
  settings: appSettingsSchema,
  presets: z.array(presetSchema).min(1),
  characters: z.array(characterSchema),
  emotionSets: z.array(emotionSetSchema),
  references: z.array(referenceSchema),
  projects: z.array(projectSchema),
  pieceSets: z.array(pieceSetSchema).default([]),
  lastProjectId: z.string().optional(),
});

export const generationRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  emotionId: z.string(),
  emotionName: z.string(),
  createdAt: z.string(),
  file: z.string(),
  thumbFile: z.string().optional(),
  canvasFile: z.string().optional(),
  width: z.number(),
  height: z.number(),
  seed: z.number(),
  variantIndex: z.number(),
  presetName: z.string(),
  characterName: z.string().default(''),
  promptSetName: z.string(),
  emotionSetName: z.string().default(''),
  referenceName: z.string().default(''),
  prompt: z.string(),
  negativePrompt: z.string(),
  characterPrompt: z.string(),
  characterNegativePrompt: z.string(),
  emotionPrompt: z.string(),
  settings: generationSettingsSchema,
  anlasSpent: z.number().optional(),
});

/** 한 번에 큐에 넣을 수 있는 작업 수. 감정 모음 하나를 변형 여러 장으로 돌려도 넉넉하다. */
export const MAX_ENQUEUE_JOBS = 2000;
/** NovelAI가 받는 캔버스보다 넉넉한 상한. 비용 판단은 이 크기로 다시 계산한다. */
const MAX_CANVAS_SIDE = 8192;
const canvasSideSchema = z.number().int().positive().max(MAX_CANVAS_SIDE);

/** 렌더러가 보낸 생성 작업. 메인 프로세스가 큐에 넣기 전에 검증한다. */
export const inpaintJobSnapshotSchema = z.object({
  id: z.string().min(1).max(200),
  createdAt: z.string(),
  projectId: z.string().regex(FOLDER_ID),
  projectName: z.string(),
  characterName: z.string(),
  emotionId: z.string().min(1),
  emotionName: z.string(),
  emotionPrompt: z.string(),
  presetName: z.string(),
  promptSetName: z.string(),
  emotionSetName: z.string(),
  referenceName: z.string(),
  prompt: z.string(),
  negativePrompt: z.string(),
  characterPrompt: z.string(),
  characterNegativePrompt: z.string(),
  source: z.object({
    commonPositive: z.string(),
    commonNegative: z.string(),
    characterPositive: z.string(),
  }),
  seed: z.number().int().min(0).max(4_294_967_295),
  variantIndex: z.number().int().nonnegative(),
  imagePath: z.string().min(1),
  maskPath: z.string().min(1),
  imageSha256: z.string().regex(/^[0-9a-f]{64}$/),
  maskSha256: z.string().regex(/^[0-9a-f]{64}$/),
  canvasWidth: canvasSideSchema,
  canvasHeight: canvasSideSchema,
  outputRect: rectSchema,
  outputFilenameTemplate: z.string(),
  keepDiagnosticCanvas: z.boolean(),
  settings: generationSettingsSchema,
  warnings: z.array(z.string()),
});

export const generationEnqueueRequestSchema = z.object({
  jobs: z.array(inpaintJobSnapshotSchema).min(1).max(MAX_ENQUEUE_JOBS),
});

/** v1 기록(characterId)도 읽는다. */
export const generationIndexSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  records: z.array(
    z.preprocess((value) => {
      const record = value as Record<string, unknown>;
      if (record && !record.projectId && record.characterId)
        return { ...record, projectId: record.characterId };
      return record;
    }, generationRecordSchema),
  ),
});

// ── v1 (마이그레이션·이전 백업 읽기 전용) ─────────────

export const v1WorkspaceSchema = z.object({
  schemaVersion: z.literal(1),
  presets: z.array(presetSchema).min(1),
  activePresetId: z.string(),
  emotionTemplates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        emotions: z.array(z.object({ name: z.string(), prompt: z.string() })),
      }),
    )
    .default([]),
  outputFilenameTemplate: z.string().default(DEFAULT_OUTPUT_FILENAME_TEMPLATE),
  keepDiagnosticCanvas: z.boolean().default(true),
  export: z
    .object({
      format: z.enum(['png', 'webp', 'avif']),
      quality: z.number(),
      target: z.enum(['favorite', 'latest']),
    })
    .default({ format: 'png', quality: 90, target: 'favorite' }),
  lastCharacterId: z.string().optional(),
});

export const v1CharacterSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  promptSets: z.array(promptSetSchema).min(1),
  activePromptSetId: z.string(),
  emotions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      prompt: z.string(),
      enabled: z.boolean(),
      favoriteGenerationId: z.string().optional(),
    }),
  ),
  reference: z
    .object({
      originalFile: z.string(),
      canvasFile: z.string(),
      maskFile: z.string(),
      originalName: z.string(),
      canvasWidth: z.number(),
      canvasHeight: z.number(),
      layout: canvasLayoutSchema,
      referenceRect: rectSchema,
      outputRect: rectSchema,
      maskExpansionPx: z.number(),
      backgroundThreshold: z.number(),
      updatedAt: z.string(),
    })
    .optional(),
});

export type V1Workspace = z.infer<typeof v1WorkspaceSchema>;
export type V1Character = z.infer<typeof v1CharacterSchema>;

export const sdStudioRootSchema = z
  .object({
    name: z.string().min(1),
    presets: z.object({
      SDImageGen: z.array(z.record(z.string(), z.unknown())).min(1),
    }),
    scenes: z.record(z.string(), z.unknown()),
  })
  .passthrough();
