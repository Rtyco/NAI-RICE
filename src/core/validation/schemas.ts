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
  width: z.number().int().min(256).max(2048).multipleOf(64).default(832),
  height: z.number().int().min(256).max(2048).multipleOf(64).default(1216),
  img2imgStrength: z.number().min(0.01).max(0.99).default(0.4),
  img2imgNoise: z.number().min(0).max(0.99).default(0),
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
  mode: z.enum(['reference', 'txt2img', 'img2img']).default('reference'),
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
  freeGeneration: z
    .object({
      presetId: z.string(),
      characterId: z.string(),
      promptSetId: z.string(),
      prompt: z.string(),
      count: z.number().int().min(1).max(20),
      mode: z.enum(['txt2img', 'img2img']).default('txt2img'),
      source: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('record'), generationId: z.string().min(1) }),
          z.object({
            kind: z.literal('input'),
            imagePath: z.string().min(1),
            name: z.string(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          }),
        ])
        .optional(),
    })
    .default({
      presetId: '',
      characterId: '',
      promptSetId: '',
      prompt: '',
      count: 1,
      mode: 'txt2img',
    }),
  lastProjectId: z.string().optional(),
});

export const generationKindSchema = z.enum(['inpaint', 'txt2img', 'img2img', 'augment']);

export const augmentToolSchema = z.enum([
  'emotion',
  'bg-removal',
  'declutter',
  'lineart',
  'sketch',
  'colorize',
]);

export const generationRecordSchema = z.object({
  id: z.string(),
  // 생성 방식 구분이 생기기 전의 기록은 모두 인페인트다.
  kind: generationKindSchema.default('inpaint'),
  sourceRecordId: z.string().optional(),
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
  anlasEstimate: z.number().optional(),
});

/** 한 번에 큐에 넣을 수 있는 작업 수. 감정 모음 하나를 변형 여러 장으로 돌려도 넉넉하다. */
export const MAX_ENQUEUE_JOBS = 2000;
/** NovelAI가 받는 캔버스보다 넉넉한 상한. 비용 판단은 이 크기로 다시 계산한다. */
const MAX_CANVAS_SIDE = 8192;
const canvasSideSchema = z.number().int().positive().max(MAX_CANVAS_SIDE);

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** 렌더러가 보낸 생성 작업의 공통 부분. 메인 프로세스가 큐에 넣기 전에 검증한다. */
const jobSnapshotCommonSchema = z.object({
  id: z.string().min(1).max(200),
  createdAt: z.string(),
  projectId: z.string().regex(FOLDER_ID),
  projectName: z.string(),
  characterName: z.string(),
  // 자유 생성은 감정이 없다.
  emotionId: z.string(),
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
  canvasWidth: canvasSideSchema,
  canvasHeight: canvasSideSchema,
  outputFilenameTemplate: z.string(),
  settings: generationSettingsSchema,
  warnings: z.array(z.string()),
  sourceRecordId: z.string().min(1).optional(),
});

const sourceImageSchema = { imagePath: z.string().min(1), imageSha256: sha256Schema };

/** 생성 방식마다 필요한 입력이 다르다. `kind`로 나눠 검사한다. */
export const generationJobSnapshotSchema = z.discriminatedUnion('kind', [
  jobSnapshotCommonSchema.extend({
    kind: z.literal('inpaint'),
    ...sourceImageSchema,
    maskPath: z.string().min(1),
    maskSha256: sha256Schema,
    outputRect: rectSchema,
    keepDiagnosticCanvas: z.boolean(),
  }),
  jobSnapshotCommonSchema.extend({ kind: z.literal('txt2img') }),
  jobSnapshotCommonSchema.extend({
    kind: z.literal('img2img'),
    ...sourceImageSchema,
    strength: z.number().min(0).max(1),
    noise: z.number().min(0).max(1),
  }),
  jobSnapshotCommonSchema.extend({
    kind: z.literal('augment'),
    ...sourceImageSchema,
    tool: augmentToolSchema,
    mood: z.string().max(40).optional(),
    toolPrompt: z.string(),
    defry: z.number().int().min(0).max(5),
  }),
]);

export const generationEnqueueRequestSchema = z.object({
  jobs: z.array(generationJobSnapshotSchema).min(1).max(MAX_ENQUEUE_JOBS),
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

// v1 형식: 이전 작업 폴더를 옮기거나 이전 백업을 읽을 때만 쓴다.

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
