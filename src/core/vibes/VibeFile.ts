import { z } from 'zod';

/**
 * NovelAI 웹의 바이브 파일(`.naiv4vibe`)과 묶음(`.naiv4vibeBundle`). 형식은 NovelAI 웹 코드(2026-10)를 따른다.
 *
 * - `type: 'image'`: 원본 그림(base64 PNG)이 있고 `id`는 그 base64 문자열의 SHA-256이다. 인코딩은
 *   `encodings[모델 키][SHA-256("information_extracted:값")]`에 있다.
 * - `type: 'encoding'`: 원본 없이 인코딩만 있다(「Export as Encodings」, 이미지 메타데이터). `id`는 인코딩
 *   문자열의 SHA-256이고 키는 `unknown`, 정보 추출 값은 `importInfo`에 있다.
 */
export const VIBE_FILE_ID = 'novelai-vibe-transfer';
export const VIBE_BUNDLE_ID = 'novelai-vibe-transfer-bundle';
export const VIBE_FILE_PATTERN = /\.naiv4vibe(bundle)?$/i;

/** 웹의 인코딩 모델 키와 그 모델의 일반 생성 ID. 앱은 V4.5만 바이브를 쓰지만 V4 인코딩도 받아 둔다. */
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
  /** 일반 생성 모델 ID(`nai-diffusion-4-5-full` 등). */
  model: string;
  informationExtracted: number;
  /** base64. */
  encoding: string;
};

/** 바이브 파일이나 묶음의 내용을 읽는다. 형식이 맞지 않는 바이브는 빼고, 하나도 없으면 오류를 던진다. */
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

/** 문서에 든 인코딩 중 아는 모델의 것. 정보 추출 값을 모르면 `importInfo`, 그것도 없으면 1로 본다. */
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

/** 웹이 인코딩을 저장하는 키의 원문. 해시는 부르는 쪽이 SHA-256으로 만든다. */
export function encodingParamsSource(informationExtracted: number): string {
  return `information_extracted:${informationExtracted}`;
}

/** 내보낼 바이브 한 개. 원본 그림이 없는(인코딩만 가져온) 바이브는 `type: 'encoding'`으로 쓴다. */
export function buildVibeDocument(
  input: {
    name: string;
    /** 원본 그림 base64(PNG). 없으면 인코딩만 쓴다. */
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
    // 인코딩만 있는 문서는 웹처럼 모델 하나·인코딩 하나만 담는다.
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

/**
 * NovelAI 이미지의 생성 정보(Comment)에 든 바이브. V4 이상은 `reference_image_multiple`에 인코딩이 들어 있고,
 * V3처럼 그림 자체가 들어 있으면 `image`로 돌려준다(가져올 때 다시 인코딩해야 한다).
 */
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
