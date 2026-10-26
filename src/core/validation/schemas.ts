import { z } from 'zod';
import {
  DEFAULT_EXPORT_FILENAME_TEMPLATE,
  DEFAULT_OUTPUT_FILENAME_TEMPLATE,
} from '../output/OutputFilename';
import { DEFAULT_DIVIDER, DEFAULT_SETTINGS } from '../model/defaults';
import { splitAtLastMarker } from '../prompts/PromptComposer';

export const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const centerSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const extraCharacterSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  negative: z.string(),
});

// 1.1.1 이하의 「공통 끝」과 「공통 | 자리」는 둘 다 상위·하위 사이다.
const emotionPositionSchema = z.preprocess(
  (value) => (value === 'common-end' || value === 'common-marker' ? 'middle' : value),
  z.enum(['middle', 'character-end']),
);

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
  emotionPosition: emotionPositionSchema.default('character-end'),
  width: z.number().int().min(256).max(2048).multipleOf(64).default(832),
  height: z.number().int().min(256).max(2048).multipleOf(64).default(1216),
  img2imgStrength: z.number().min(0.01).max(0.99).default(0.4),
  img2imgNoise: z.number().min(0).max(0.99).default(0),
  variety: z.boolean().catch(false).default(false),
  smea: z.enum(['off', 'smea', 'dyn']).catch('off').default('off'),
  decrisp: z.boolean().catch(false).default(false),
  effort: z.enum(['high', 'medium']).default('high'),
});

// 빈 이름은 폴더 밖으로 읽는다.
const folderSchema = z.string().trim().min(1).optional().catch(undefined);

/** 1.1.1 이하의 「공통 | 자리」 생성 설정은 마지막 `|` 뒤를 하위로 옮기면 결과가 같다. */
function readBackPositive(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const preset = value as Record<string, unknown>;
  if (preset.backPositive !== undefined || typeof preset.commonPositive !== 'string') return value;
  const generation = preset.generation as Record<string, unknown> | undefined;
  const split =
    generation?.emotionPosition === 'common-marker'
      ? splitAtLastMarker(preset.commonPositive)
      : undefined;
  return split
    ? { ...preset, commonPositive: split.front, backPositive: split.back }
    : { ...preset, backPositive: '' };
}

export const presetSchema = z.preprocess(
  readBackPositive,
  z.object({
    id: z.string().min(1),
    name: z.string(),
    folder: folderSchema,
    commonPositive: z.string(),
    backPositive: z.string(),
    commonNegative: z.string(),
    generation: generationSettingsSchema,
  }),
);

const promptSetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  positive: z.string(),
  negative: z.string(),
});

export const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  folder: folderSchema,
  promptSets: z.array(promptSetSchema).min(1),
  createdAt: z.string(),
});

const sceneOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  prompt: z.string(),
  characterPrompts: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

const sceneOptionTextSchema = sceneOptionSchema.pick({ prompt: true, characterPrompts: true });

export const emotionSetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  folder: folderSchema,
  emotions: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      prompt: z.string(),
      extraPrompts: z.array(z.string()).optional(),
      negative: z.string().optional(),
      augmentMood: z.string().trim().min(1).max(40).optional().catch(undefined),
      augmentDefry: z.number().int().min(0).max(5).optional().catch(undefined),
      slots: z.array(z.array(sceneOptionSchema)).optional(),
      seed: z.number().int().min(0).max(4_294_967_295).optional().catch(undefined),
      width: z.number().int().min(64).max(8192).optional().catch(undefined),
      height: z.number().int().min(64).max(8192).optional().catch(undefined),
    }),
  ),
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
  folder: folderSchema,
  pieces: z.array(promptPieceSchema),
});

/** SDStudio 옛 형식 `{description, pieces: {이름: 내용}, multi: {이름: 참}}`(SDStudio migratePieceLibrary와 같다). */
function migrateLegacyPieceSet(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const legacy = value as {
    name?: unknown;
    description?: unknown;
    pieces?: unknown;
    multi?: unknown;
  };
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

/** 프로젝트 파일의 library 값도 이 모양이다. */
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
  fit: z.enum(['contain', 'cover', 'free']),
  anchor: z.enum(['top', 'center', 'bottom']).default('center'),
  free: z
    .object({
      x: z.number(),
      y: z.number(),
      scaleX: z.number().positive(),
      scaleY: z.number().positive(),
      rotation: z.number(),
      flipX: z.boolean(),
    })
    .optional(),
  background: z.string(),
});

/** 폴더 이름으로 쓴다. */
export const FOLDER_ID = /^[\p{L}\p{N}-]+$/u;

export const referenceSchema = z.object({
  id: z.string().regex(FOLDER_ID),
  name: z.string(),
  folder: folderSchema,
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
      paintFile: z.string().optional(),
    })
    .optional(),
  layout: canvasLayoutSchema,
  divider: z
    .object({
      enabled: z.boolean(),
      color: z.string(),
      widthPx: z.number().int().min(0).max(64),
      placement: z.enum(['outside', 'center', 'inside']).default('outside'),
      gapPx: z.number().int().min(0).max(64).default(0),
    })
    .default(() => ({ ...DEFAULT_DIVIDER })),
  inpaintStrength: z.number().min(0).max(1).catch(1).default(1),
  maskExpansionPx: z.number().nonnegative(),
  backgroundThreshold: z.number().min(0).max(255),
  updatedAt: z.string(),
});

const characterSlotSchema = z.object({
  characterId: z.string(),
  promptSetId: z.string(),
  center: centerSchema.optional(),
});

/** 예전 단일 `characterId`·`promptSetId` */
function readSingleCharacter(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const item = value as Record<string, unknown>;
  if (Array.isArray(item.characters)) return item;
  const { characterId, promptSetId, ...rest } = item;
  return {
    ...rest,
    characters:
      typeof characterId === 'string' && characterId
        ? [{ characterId, promptSetId: typeof promptSetId === 'string' ? promptSetId : '' }]
        : [],
  };
}

/** 예전 단일 `vibeId` */
function readSingleVibe(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const { vibeId, ...rest } = value as Record<string, unknown>;
  if (Array.isArray(rest.vibeIds)) return rest;
  return { ...rest, vibeIds: typeof vibeId === 'string' && vibeId ? [vibeId] : [] };
}

/** 예전 단일 `characterReferenceId` */
function readSingleCharacterReference(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const { characterReferenceId, ...rest } = value as Record<string, unknown>;
  if (Array.isArray(rest.characterReferenceIds)) return rest;
  return {
    ...rest,
    characterReferenceIds:
      typeof characterReferenceId === 'string' && characterReferenceId
        ? [characterReferenceId]
        : [],
  };
}

export const refineSettingsSchema = z.object({
  model: z.string(),
  prompt: z.enum(['source', 'negative-only', 'empty', 'custom']),
  customPositive: z.string().max(20000).optional(),
  customNegative: z.string().max(20000).optional(),
  size: z.union([
    z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
    z.enum(['exact-ratio', 'closest-ratio']),
  ]),
  fit: z.enum(['crop', 'pad']),
  strength: z.number().min(0.01).max(0.99),
  noise: z.number().min(0).max(0.99),
  count: z.number().int().min(1).max(10),
  seedMode: z.enum(['source', 'random']),
});

export const projectSchema = z.preprocess(
  (value) => readSingleCharacterReference(readSingleVibe(readSingleCharacter(value))),
  z.object({
    id: z.string().regex(FOLDER_ID),
    name: z.string(),
    folder: folderSchema,
    // 없어진 img2img 모드는 인페인트로 읽는다.
    mode: z.enum(['reference', 'txt2img']).catch('reference'),
    presetId: z.string(),
    characters: z.array(characterSlotSchema),
    positionMode: z.enum(['ai', 'manual']).catch('ai'),
    emotionSetId: z.string(),
    extraPrompt: z.string().optional().catch(undefined),
    referenceId: z.string(),
    aidMode: z.enum(['character', 'vibe']).optional().catch(undefined),
    characterReferenceIds: z.array(z.string().min(1)).catch([]),
    vibeIds: z.array(z.string().min(1)).catch([]),
    normalizeVibes: z.boolean().optional().catch(undefined),
    refine: refineSettingsSchema.optional().catch(undefined),
    autoRefine: z.boolean().optional().catch(undefined),
    excludedEmotionIds: z.array(z.string()).default([]),
    favorites: z.record(z.string(), z.string()).default({}),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

const pictureSchema = z
  .object({
    file: z.string().regex(/^[0-9a-f]{24}\.png$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    name: z.string().catch(''),
  })
  .optional()
  .catch(undefined);

const unitSchema = (fallback: number) => z.number().min(0).max(1).catch(fallback);

/** NovelAI 웹 슬라이더는 0~1이지만 직접 입력하면 음수 등도 받는다. */
export const AID_VALUE_LIMIT = 10;
const aidValue = z.number().min(-AID_VALUE_LIMIT).max(AID_VALUE_LIMIT);
const aidValueSchema = (fallback: number) => aidValue.catch(fallback);

const referenceTargetSchema = z.enum(['character&style', 'character', 'style']);

/** 예전 `styleAware`: 켜기는 character&style, 끄기는 character. */
function readStyleAware(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const { styleAware, ...rest } = value as Record<string, unknown>;
  if (rest.target !== undefined || typeof styleAware !== 'boolean') return rest;
  return { ...rest, target: styleAware ? 'character&style' : 'character' };
}

export const characterReferenceSchema = z.preprocess(
  readStyleAware,
  z.object({
    id: z.string().min(1),
    name: z.string(),
    folder: folderSchema,
    image: pictureSchema,
    target: referenceTargetSchema.catch('character&style'),
    strength: aidValueSchema(1),
    fidelity: aidValueSchema(1),
    updatedAt: z.string().catch(''),
  }),
);

/** 예전 단일 `aid`. 그때 캐릭터 레퍼런스 세기는 늘 1이었다. */
function readSingleAid(value: unknown): unknown {
  const read = readStyleAware(value);
  if (!read || typeof read !== 'object') return read;
  const { kind, vibes, references, ...rest } = read as Record<string, unknown>;
  if (kind === 'vibe' && !Array.isArray(vibes)) return { kind, vibes: [rest] };
  if (kind === 'character' && !Array.isArray(references))
    return { kind, references: [{ strength: 1, ...rest }] };
  return read;
}

export const vibeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  folder: folderSchema,
  image: pictureSchema,
  strength: aidValueSchema(0.6),
  informationExtracted: unitSchema(1),
  encodingId: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional()
    .catch(undefined),
  updatedAt: z.string().catch(''),
});

const exportFormatSchema = z.enum(['png', 'webp', 'avif']);
export const exportQualitySchema = z.number().int().min(1).max(100);

export const appSettingsSchema = z.object({
  outputFilenameTemplate: z.string().min(1).default(DEFAULT_OUTPUT_FILENAME_TEMPLATE),
  keepDiagnosticCanvas: z.boolean().default(true),
  storageFormat: z.enum(['png', 'webp-lossless']).default('webp-lossless'),
  export: z
    .object({
      format: exportFormatSchema,
      quality: exportQualitySchema,
      target: z.enum(['favorite', 'latest']),
      scope: z.enum(['scene', 'combo', 'all']).default('scene'),
      filenameTemplate: z.string().default(DEFAULT_EXPORT_FILENAME_TEMPLATE),
    })
    .default(() => ({ ...DEFAULT_SETTINGS.export })),
  // 예전 naiTags(직접 고친 품질 태그 문구)는 읽지 않는다.
  requestDelayMs: z.number().int().min(0).max(1000).default(300),
  streaming: z.boolean().default(false),
  tagAutocomplete: z.boolean().default(true),
  appearance: z
    .object({
      theme: z.enum(['navy', 'graphite', 'violet', 'forest', 'rose']).catch('navy'),
      mode: z.enum(['dark', 'light', 'system']).catch('dark'),
    })
    .default({ theme: 'navy', mode: 'dark' }),
  layout: z
    .object({
      focusLevel: z.enum(['panels', 'inputs', 'all']).catch('panels'),
      edgePeek: z.boolean().default(false),
      simpleUi: z.boolean().catch(false),
      chipEdit: z.boolean().catch(false),
      chipNames: z.boolean().catch(true),
      refineChip: z.boolean().catch(true),
      welcomeChips: z.boolean().catch(true),
      narrowOverlay: z.boolean().catch(true),
      iconFolders: z.boolean().catch(true),
      comboOptions: z.enum(['first', 'all', 'none']).catch('first'),
    })
    .default({
      focusLevel: 'panels',
      edgePeek: false,
      simpleUi: false,
      chipEdit: false,
      chipNames: true,
      refineChip: true,
      welcomeChips: true,
      narrowOverlay: true,
      iconFolders: true,
      comboOptions: 'first',
    }),
  update: z
    .object({
      autoCheck: z.boolean().default(true),
      skippedVersion: z.string().default(''),
      seenVersion: z.string().default(''),
    })
    .default({ autoCheck: true, skippedVersion: '', seenVersion: '' }),
});

/** 해시 이름이라 경로 문자가 없다. */
const sourceFileSchema = z.string().regex(/^[0-9a-f]+\.png$/);

/** 예전 「자유 인페인팅」 모드(mode 'inpaint', 이미지는 `inpaint`)를 i2i 인페인팅으로 읽는다. */
function readFreeInpaintMode(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const free = value as Record<string, unknown>;
  if (free.mode !== 'inpaint' && (typeof free.inpaint !== 'object' || free.inpaint === null))
    return free;
  return {
    ...free,
    mode: free.mode === 'inpaint' ? 'img2img' : free.mode,
    image: typeof free.inpaint === 'object' && free.inpaint ? free.inpaint : free.image,
    inpaint: true,
  };
}

export const augmentToolSchema = z.enum([
  'emotion',
  'bg-removal',
  'declutter',
  'lineart',
  'sketch',
  'colorize',
]);

export const librarySchema = z.object({
  schemaVersion: z.literal(2),
  settings: appSettingsSchema,
  presets: z.array(presetSchema).min(1),
  characters: z.array(characterSchema),
  emotionSets: z.array(emotionSetSchema),
  references: z.array(referenceSchema),
  characterReferences: z.array(characterReferenceSchema).default([]),
  vibes: z.array(vibeSchema).default([]),
  projects: z.array(projectSchema),
  pieceSets: z.array(pieceSetSchema).default([]),
  freeGeneration: z
    .preprocess(
      (value) => readSingleCharacter(readFreeInpaintMode(value)),
      z.object({
        presetId: z.string(),
        characters: z.array(characterSlotSchema),
        positionMode: z.enum(['ai', 'manual']).catch('ai'),
        prompt: z.string(),
        count: z.number().int().min(1).max(20),
        mode: z.enum(['txt2img', 'img2img', 'augment']).catch('txt2img'),
        image: z
          .object({
            name: z.string(),
            file: sourceFileSchema,
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            outputRect: rectSchema,
            maskFile: sourceFileSchema.optional(),
            fromRecord: z.object({ projectId: z.string(), generationId: z.string() }).optional(),
            fromReference: z
              .object({
                referenceId: z.string(),
                name: z.string(),
                inpaintStrength: z.number().min(0).max(1),
              })
              .optional()
              .catch(undefined),
          })
          .optional(),
        inpaint: z.boolean().default(false),
        refine: refineSettingsSchema.optional().catch(undefined),
        autoRefine: z.boolean().optional().catch(undefined),
        augment: z
          .object({
            tool: augmentToolSchema,
            mood: z.string().min(1).max(40),
            toolPrompt: z.string(),
            defry: z.number().int().min(0).max(5),
            count: z.number().int().min(1).max(4),
          })
          .optional()
          .catch(undefined),
        negative: z.string().default(''),
        // 예전에는 늘 공통 포지티브 끝이었다.
        promptPosition: emotionPositionSchema.catch('middle'),
        aidMode: z.enum(['character', 'vibe']).optional().catch(undefined),
        characterReferenceIds: z.array(z.string().min(1)).catch([]),
        vibeIds: z.array(z.string().min(1)).catch([]),
        normalizeVibes: z.boolean().optional().catch(undefined),
      }),
    )
    .default({
      presetId: '',
      characters: [],
      positionMode: 'ai',
      prompt: '',
      negative: '',
      count: 1,
      mode: 'txt2img',
      inpaint: false,
      promptPosition: 'middle',
      characterReferenceIds: [],
      vibeIds: [],
    }),
  lastProjectId: z.string().optional(),
  folderColors: z
    .record(
      z.string(),
      z.enum(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']),
    )
    .optional()
    .catch(undefined),
});

export const generationKindSchema = z.enum(['inpaint', 'txt2img', 'img2img', 'augment']);

const augmentInfoSchema = z.object({
  tool: augmentToolSchema,
  mood: z.string().optional(),
  toolPrompt: z.string().optional(),
  defry: z.number().optional(),
  part: z.number().int().min(0).optional(),
  parts: z.number().int().min(1).optional(),
});

export const generationRecordSchema = z.object({
  id: z.string(),
  // 예전 기록은 모두 인페인트다.
  kind: generationKindSchema.default('inpaint'),
  sourceRecordId: z.string().optional(),
  projectId: z.string(),
  emotionId: z.string(),
  emotionName: z.string(),
  createdAt: z.string(),
  file: z.string(),
  thumbFile: z.string().optional(),
  canvasFile: z.string().optional(),
  inputFile: z.string().optional(),
  augment: augmentInfoSchema.optional().catch(undefined),
  aid: z
    .preprocess(
      readSingleAid,
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('character'),
          references: z.array(
            z.object({
              name: z.string().catch(''),
              target: referenceTargetSchema.catch('character&style'),
              strength: z.number().catch(1),
              fidelity: z.number(),
            }),
          ),
        }),
        z.object({
          kind: z.literal('vibe'),
          vibes: z.array(
            z.object({
              name: z.string().catch(''),
              strength: z.number(),
              informationExtracted: z.number(),
            }),
          ),
          normalize: z.boolean().optional().catch(undefined),
        }),
      ]),
    )
    .optional()
    .catch(undefined),
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
  extraCharacters: z.array(extraCharacterSchema).optional(),
  characterCenters: z.array(centerSchema).optional(),
  emotionPrompt: z.string(),
  emotionNegative: z.string().optional(),
  emotionExtraPrompts: z.array(z.string()).optional(),
  comboKey: z.string().optional(),
  comboName: z.string().optional(),
  comboOptions: z.array(sceneOptionTextSchema).optional(),
  settings: generationSettingsSchema,
  anlasSpent: z.number().optional(),
  anlasEstimate: z.number().optional(),
});

/** 형식이 그대로 확장자가 된다. */
export const exportRequestSchema = z.object({
  projectId: z.string().regex(FOLDER_ID),
  name: z.string(),
  items: z.array(z.object({ generationId: z.string(), name: z.string() })),
  format: exportFormatSchema,
  quality: exportQualitySchema,
  mode: z.enum(['folder', 'zip']),
});

export const MAX_ENQUEUE_JOBS = 2000;
/** 비용은 이 크기로 다시 계산한다. */
const MAX_CANVAS_SIDE = 8192;
const canvasSideSchema = z.number().int().positive().max(MAX_CANVAS_SIDE);

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

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
  emotionNegative: z.string().optional(),
  emotionExtraPrompts: z.array(z.string()).max(100).optional(),
  comboKey: z.string().max(4000).optional(),
  comboName: z.string().max(4000).optional(),
  comboOptions: z.array(sceneOptionTextSchema).max(200).optional(),
  presetName: z.string(),
  promptSetName: z.string(),
  emotionSetName: z.string(),
  referenceName: z.string(),
  prompt: z.string(),
  negativePrompt: z.string(),
  characterPrompt: z.string(),
  characterNegativePrompt: z.string(),
  extraCharacters: z.array(extraCharacterSchema).max(32).optional(),
  characterCenters: z.array(centerSchema).max(32).optional(),
  source: z.object({
    commonPositive: z.string(),
    backPositive: z.string().optional(),
    extraPrompt: z.string().optional(),
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
  refine: refineSettingsSchema.optional(),
  aid: z
    .preprocess(
      readSingleAid,
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('character'),
          references: z
            .array(
              z.object({
                name: z.string(),
                imagePath: z.string().min(1),
                imageSha256: sha256Schema,
                target: referenceTargetSchema,
                strength: aidValue,
                fidelity: aidValue,
              }),
            )
            .min(1),
        }),
        z.object({
          kind: z.literal('vibe'),
          vibes: z
            .array(
              z.object({
                name: z.string(),
                imagePath: z.string().min(1),
                imageSha256: sha256Schema,
                strength: aidValue,
                informationExtracted: z.number().min(0).max(1),
                encodingId: sha256Schema.optional(),
              }),
            )
            .min(1),
          normalize: z.boolean().optional(),
        }),
      ]),
    )
    .optional(),
});

const sourceImageSchema = { imagePath: z.string().min(1), imageSha256: sha256Schema };

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
    outputRect: rectSchema.optional(),
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

export const generationFindRequestSchema = z.object({
  projectIds: z.array(z.string()).max(10000),
  query: z.object({ text: z.string().min(1).max(4000), wholeTag: z.boolean() }),
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

// v1: 이전 작업 폴더나 백업을 읽을 때만.

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
    // 씬만 담은 파일(「현재 프로젝트에 씬만 불러오기」용)은 프리셋이 비어 있다.
    presets: z
      .object({ SDImageGen: z.array(z.record(z.string(), z.unknown())).min(1).optional() })
      .passthrough(),
    scenes: z.record(z.string(), z.unknown()),
  })
  .passthrough();
