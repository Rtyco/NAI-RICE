import { z } from 'zod';

/**
 * NovelAI 웹 바이브 파일(`.naiv4vibe`)과 묶음(`.naiv4vibeBundle`), 2026-10 웹 코드 기준.
 * - `type: 'image'`: `id`는 그림 base64의 SHA-256. 인코딩은 `encodings[모델 키][SHA-256("information_extracted:값")]`.
 * - `type: 'encoding'`: 인코딩만 있다. `id`는 인코딩의 SHA-256, 키는 `unknown`, 정보 추출 값은 `importInfo`.
 */
export const VIBE_FILE_ID = 'novelai-vibe-transfer';
export const VIBE_BUNDLE_ID = 'novelai-vibe-transfer-bundle';
export const VIBE_FILE_PATTERN = /\.naiv4vibe(bundle)?$/i;

/** 웹 모델 키 → 일반 생성 모델 ID. V4 인코딩도 받아 둔다. */
export const VIBE_MODEL_KEYS: Record<string, string> = {
  'v4-5full': 'nai-diffusion-4-5-full',
  'v4-5curated': 'nai-diffusion-4-5-curated',
  v4full: 'nai-diffusion-4-full',
  v4curated: 'nai-diffusion-4-curated-preview',
};

export function vibeModelKey(generateModel: string): string | undefined {
  return Object.entries(VIBE_MODEL_KEYS).find(([, model]) => model === generateModel)?.[0];
}

const encodingEntrySchema = z.object({
  encoding: z.string().min(1),
  params: z.object({ information_extracted: z.number().optional() }).passthrough().nullish(),
});

const vibeDocumentSchema = z.object({
  identifier: z.literal(VIBE_FILE_ID),
  version: z.number().optional(),
  type: z.enum(['image', 'encoding']),
  image: z.string().nullish(),
  id: z.string(),
  encodings: z.record(z.string(), z.record(z.string(), encodingEntrySchema)).catch({}),
  name: z.string().nullish(),
  thumbnail: z.string().nullish(),
  createdAt: z.unknown().optional(),
  importInfo: z
    .object({
      model: z.string().optional(),
      information_extracted: z.number().optional(),
      strength: z.number().optional(),
    })
    .passthrough()
    .nullish(),
});

export type VibeDocument = z.infer<typeof vibeDocumentSchema>;

export type VibeEncoding = {
  /** 일반 생성 모델 ID */
  model: string;
  informationExtracted: number;
  /** base64 */
  encoding: string;
};

/** 형식이 맞지 않는 바이브는 빼고, 하나도 없으면 오류. */
export function parseVibeFile(text: string): VibeDocument[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('NovelAI 바이브 파일이 아닙니다.');
  }
  const value = parsed as { identifier?: unknown; vibes?: unknown };
  const items =
    value?.identifier === VIBE_BUNDLE_ID && Array.isArray(value.vibes) ? value.vibes : [parsed];
  const documents = items.flatMap((item) => {
    const result = vibeDocumentSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
  if (!documents.length)
    throw new Error('NovelAI 바이브 파일이 아니거나 읽을 수 있는 바이브가 없습니다.');
  return documents;
}

/** 정보 추출 값을 모르면 `importInfo`, 그것도 없으면 1. */
export function documentEncodings(document: VibeDocument): VibeEncoding[] {
  const fallback = document.importInfo?.information_extracted ?? 1;
  return Object.entries(document.encodings).flatMap(([key, entries]) => {
    const model = VIBE_MODEL_KEYS[key];
    if (!model) return [];
    return Object.values(entries).map((entry) => ({
      model,
      informationExtracted: entry.params?.information_extracted ?? fallback,
      encoding: entry.encoding,
    }));
  });
}

/** 해시는 부르는 쪽이 만든다. */
export function encodingParamsSource(informationExtracted: number): string {
  return `information_extracted:${informationExtracted}`;
}

/** 원본 그림이 없으면 `type: 'encoding'`. */
export function buildVibeDocument(
  input: {
    name: string;
    /** PNG base64 */
    imageBase64?: string;
    thumbnail?: string;
    encodings: VibeEncoding[];
    strength: number;
    informationExtracted: number;
    createdAt: number;
  },
  sha256: (text: string) => string,
): VibeDocument & { importInfo: { model: string } } {
  const encodings: VibeDocument['encodings'] = {};
  for (const item of input.encodings) {
    const key = vibeModelKey(item.model);
    if (!key) continue;
    const hash = input.imageBase64
      ? sha256(encodingParamsSource(item.informationExtracted))
      : 'unknown';
    encodings[key] = {
      ...encodings[key],
      [hash]: {
        encoding: item.encoding,
        params: input.imageBase64
          ? { information_extracted: item.informationExtracted }
          : undefined,
      },
    };
    // 웹처럼 모델·인코딩 하나만 담는다.
    if (!input.imageBase64) break;
  }
  const first = input.encodings.find((item) => vibeModelKey(item.model));
  return {
    identifier: VIBE_FILE_ID,
    version: 1,
    type: input.imageBase64 ? 'image' : 'encoding',
    ...(input.imageBase64 ? { image: input.imageBase64 } : {}),
    id: sha256(input.imageBase64 ?? first?.encoding ?? ''),
    encodings,
    name: input.name,
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
    createdAt: input.createdAt,
    importInfo: {
      model: first?.model ?? 'nai-diffusion-4-5-full',
      information_extracted: input.imageBase64
        ? input.informationExtracted
        : (first?.informationExtracted ?? input.informationExtracted),
      strength: input.strength,
    },
  };
}

export function buildVibeBundle(documents: VibeDocument[]) {
  return { identifier: VIBE_BUNDLE_ID, version: 1, vibes: documents };
}

/** V4 이상은 `reference_image_multiple`의 인코딩. V3처럼 그림이 들어 있으면 `image`(다시 인코딩해야 한다). */
export type MetadataVibe = {
  encoding?: string;
  image?: string;
  strength: number;
  informationExtracted: number;
};

const IMAGE_BASE64_PREFIXES = ['iVBORw0KGgo', '/9j/', 'UklGR'];

export function metadataVibes(comment: Record<string, unknown>): MetadataVibe[] {
  const list = comment.reference_image_multiple;
  if (!Array.isArray(list)) return [];
  const strengths = Array.isArray(comment.reference_strength_multiple)
    ? comment.reference_strength_multiple
    : [];
  const informations = Array.isArray(comment.reference_information_extracted_multiple)
    ? comment.reference_information_extracted_multiple
    : [];
  return list.flatMap((value, index) => {
    if (typeof value !== 'string' || !value) return [];
    const strength = typeof strengths[index] === 'number' ? strengths[index] : 0.6;
    const informationExtracted = typeof informations[index] === 'number' ? informations[index] : 1;
    const image = IMAGE_BASE64_PREFIXES.some((prefix) => value.startsWith(prefix));
    return [
      { ...(image ? { image: value } : { encoding: value }), strength, informationExtracted },
    ];
  });
}
