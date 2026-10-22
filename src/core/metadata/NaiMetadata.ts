import { Gunzip } from 'fflate';
import type {
  CharacterCenter,
  Effort,
  ExtraCharacterPrompt,
  GenerationSettings,
  QualityLevel,
  UcPresetId,
} from '../domain/types';
import { readImageText } from './WebpMetadata';
import { removeReferenceInset } from '../prompts/PromptComposer';
import { supportsEffort } from '../providers/NaiModels';
import { metadataVibes, VIBE_BUNDLE_ID, VIBE_FILE_ID, type MetadataVibe } from '../vibes/VibeFile';

/** 앱 이름이 바뀌어도 이미 만든 이미지를 읽도록 예전 키를 쓴다. */
export const DESK_METADATA_KEY = 'ReferenceInpaintDesk';

export type DeskMetadata = {
  app: 'reference-inpaint-desk';
  version: 1 | 2;
  characterName: string;
  presetName: string;
  commonPositive: string;
  commonNegative: string;
  promptSet: { name: string; positive: string; negative: string };
  emotion: { name: string; prompt: string; negative?: string };
  seed: number;
  /** v2부터 */
  qualityTags?: boolean;
  qualityLevel?: QualityLevel;
  ucPreset?: UcPresetId;
  model?: string;
  /** medium일 때만 남긴다. */
  effort?: Effort;
  /** 두 번째 캐릭터부터, 씬 프롬프트가 섞인 최종 프롬프트. */
  extraCharacters?: ExtraCharacterPrompt[];
};

export type ImageImportData = {
  source: 'novelai' | 'desk';
  commonPositive?: string;
  commonNegative?: string;
  characters: Array<{ positive: string; negative: string }>;
  /** `use_coords`일 때만 */
  characterCenters?: CharacterCenter[];
  settings: Partial<GenerationSettings>;
  seed?: number;
  width?: number;
  height?: number;
  modelLabel?: string;
  /** Source 라벨에서 추정한 인페인트 모델 ID */
  model?: string;
  effort?: Effort;
  /** 이 앱의 결과일 때만 */
  qualityTags?: boolean;
  qualityLevel?: QualityLevel;
  ucPreset?: UcPresetId;
  /** `tag_hint_qt`, `tag_hint_uc_preset` */
  tagHints?: { quality?: number; uc?: number };
  desk?: DeskMetadata;
  /** `reference_image_multiple` */
  vibes?: MetadataVibe[];
  /** `naidata` JSON 문자열 */
  vibeFile?: string;
};

/** NovelAI 웹은 바이브를 넣어 내려받을 때 바이브 파일 JSON을 base64로 `naidata` 청크에 넣는다(2026-10). */
export function embeddedVibeFile(entries: Record<string, unknown>): string | undefined {
  const raw = entries.naidata;
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const identifier = (JSON.parse(text) as { identifier?: unknown }).identifier;
    return identifier === VIBE_FILE_ID || identifier === VIBE_BUNDLE_ID ? text : undefined;
  } catch {
    return undefined;
  }
}

/** V5는 Source 라벨이 모두 "NovelAI Diffusion V5 <해시>"이고 모델이 해시로만 갈린다. 생성과 인페인트의 해시가 다르다(2026-10 실측). */
const V5_SOURCE_HASHES: Record<string, { model: string; effort: Effort }> = {
  '0ADF9AB7': { model: 'nai-diffusion-5-full-inpainting', effort: 'high' },
  '657484A5': { model: 'nai-diffusion-5-full-inpainting', effort: 'high' },
  '70AB5786': { model: 'nai-diffusion-5-full-inpainting', effort: 'medium' },
  '93F4BD30': { model: 'nai-diffusion-5-full-inpainting', effort: 'medium' },
  DB276663: { model: 'nai-diffusion-5-curated', effort: 'high' },
};

function v5SourceHash(label: string | undefined) {
  const hash = /v5\s+([0-9a-f]{8})\b/i.exec(label ?? '')?.[1].toUpperCase();
  return hash ? V5_SOURCE_HASHES[hash] : undefined;
}

/** 예: "NovelAI Diffusion V4.5 4BDE2A90" */
export function guessModelFromSource(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const text = label.toLowerCase();
  const curated = text.includes('curated');
  if (/v5/.test(text))
    return (
      v5SourceHash(label)?.model ??
      (curated ? 'nai-diffusion-5-curated' : 'nai-diffusion-5-full-inpainting')
    );
  if (/v4\.5/.test(text))
    return curated ? 'nai-diffusion-4-5-curated-inpainting' : 'nai-diffusion-4-5-full-inpainting';
  if (/v4/.test(text))
    return curated ? 'nai-diffusion-4-curated-inpainting' : 'nai-diffusion-4-full-inpainting';
  // V3는 "Stable Diffusion XL <해시>"(9CC2F394는 Furry).
  if (/furry|9cc2f394/.test(text)) return 'nai-diffusion-furry-3-inpainting';
  if (/stable diffusion xl/.test(text)) return 'nai-diffusion-3-inpainting';
  if (/v3|anime/.test(text)) return 'nai-diffusion-3-inpainting';
  return undefined;
}

/** 바이브를 쓴 이미지는 인코딩(하나에 base64 약 65KB)이 들어 있어 웹 최대 16개를 넉넉히 받는다. */
export const MAX_STEALTH_TEXT_BYTES = 8 * 1024 * 1024;
/** deflate 최대 압축률(약 1032:1)로도 한 번의 출력이 1MB 안팎이다. */
const GUNZIP_INPUT_CHUNK = 1024;

/** 압축 폭탄 방지 */
function gunzipLimited(data: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip((chunk) => {
    total += chunk.length;
    if (total > limit) throw new Error('too large');
    chunks.push(chunk);
  });
  for (let offset = 0; offset < data.length; offset += GUNZIP_INPUT_CHUNK) {
    const end = Math.min(offset + GUNZIP_INPUT_CHUNK, data.length);
    stream.push(data.subarray(offset, end), end === data.length);
  }
  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}

/** NovelAI가 알파 최하위 비트에 숨긴 메타데이터. 열 우선(위→아래, 왼쪽→오른쪽), MSB부터. */
export function readStealthMetadata(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Record<string, unknown> | null {
  let column = 0;
  let row = 0;
  const nextBit = (): number => {
    if (column >= width) throw new Error('eof');
    const bit = rgba[(row * width + column) * 4 + 3] & 1;
    row += 1;
    if (row === height) {
      row = 0;
      column += 1;
    }
    return bit;
  };
  const readBytes = (count: number): Uint8Array => {
    const bytes = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | nextBit();
      bytes[index] = value;
    }
    return bytes;
  };
  try {
    const magic = new TextDecoder().decode(readBytes(15));
    if (magic !== 'stealth_pngcomp' && magic !== 'stealth_pnginfo') return null;
    const lengthBytes = readBytes(4);
    const bitLength = new DataView(lengthBytes.buffer).getUint32(0);
    const byteLength = Math.floor(bitLength / 8);
    // 헤더 길이를 믿고 큰 버퍼를 잡지 않는다.
    const remainingBits = width * height - column * height - row;
    if (byteLength * 8 > remainingBits) return null;
    const payload = readBytes(byteLength);
    const text = new TextDecoder().decode(
      magic === 'stealth_pngcomp' ? gunzipLimited(payload, MAX_STEALTH_TEXT_BYTES) : payload,
    );
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null ? (value as JsonObject) : undefined;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseJsonObject(value: unknown): JsonObject | undefined {
  if (typeof value !== 'string') return asObject(value);
  try {
    return asObject(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function parseDesk(value: unknown): DeskMetadata | undefined {
  const parsed = parseJsonObject(value);
  return parsed?.app === 'reference-inpaint-desk' ? (parsed as DeskMetadata) : undefined;
}

/** 인식할 수 없으면 null. */
export function interpretMetadata(entries: Record<string, unknown>): ImageImportData | null {
  const comment = parseJsonObject(entries.Comment);
  const desk = parseDesk(entries[DESK_METADATA_KEY]);
  if (!comment && !desk) return null;

  const result: ImageImportData = {
    source: desk ? 'desk' : 'novelai',
    characters: [],
    settings: {},
    modelLabel: asString(entries.Source),
    model: guessModelFromSource(asString(entries.Source)),
    desk,
  };
  if (result.model && supportsEffort(result.model))
    result.effort = v5SourceHash(result.modelLabel)?.effort ?? 'high';

  if (comment) {
    const v4Prompt = asObject(comment.v4_prompt);
    const v4 = asObject(v4Prompt?.caption);
    const v4Negative = asObject(asObject(comment.v4_negative_prompt)?.caption);
    const base =
      asString(v4?.base_caption) ?? asString(comment.prompt) ?? asString(entries.Description);
    const negative = asString(v4Negative?.base_caption) ?? asString(comment.uc);
    if (base !== undefined) result.commonPositive = removeReferenceInset(base);
    if (negative !== undefined) result.commonNegative = negative;
    const positives = asList(v4?.char_captions);
    const negatives = asList(v4Negative?.char_captions);
    result.characters = positives.map((item, index) => ({
      positive: removeReferenceInset(asString(asObject(item)?.char_caption) ?? ''),
      negative: asString(asObject(negatives[index])?.char_caption) ?? '',
    }));
    const useCoords = v4Prompt?.use_coords ?? comment.use_coords;
    if (useCoords === true && positives.length) {
      const centers = positives.map((item) => {
        const center = asObject(asList(asObject(item)?.centers)[0]);
        const x = asNumber(center?.x);
        const y = asNumber(center?.y);
        return x !== undefined && y !== undefined ? { x, y } : undefined;
      });
      if (centers.every(Boolean)) result.characterCenters = centers as CharacterCenter[];
    }
    const settings: Partial<GenerationSettings> = {};
    const steps = asNumber(comment.steps);
    const scale = asNumber(comment.scale);
    const rescale = asNumber(comment.cfg_rescale);
    const strength = asNumber(comment.strength);
    if (steps !== undefined) settings.steps = Math.round(steps);
    if (scale !== undefined) settings.promptGuidance = scale;
    if (rescale !== undefined) settings.cfgRescale = rescale;
    if (strength !== undefined) settings.inpaintStrength = Math.max(0, Math.min(1, strength));
    const sampler = asString(comment.sampler);
    const noiseSchedule = asString(comment.noise_schedule);
    if (sampler) settings.sampler = sampler as GenerationSettings['sampler'];
    if (noiseSchedule) settings.noiseSchedule = noiseSchedule as GenerationSettings['noiseSchedule'];
    if (typeof comment.skip_cfg_above_sigma === 'number') settings.variety = true;
    if (comment.sm === true) settings.smea = comment.sm_dyn === true ? 'dyn' : 'smea';
    if (comment.dynamic_thresholding === true) settings.decrisp = true;
    result.settings = settings;
    result.seed = asNumber(comment.seed);
    result.width = asNumber(comment.width);
    result.height = asNumber(comment.height);
    const quality = asNumber(comment.tag_hint_qt);
    const uc = asNumber(comment.tag_hint_uc_preset);
    if (quality !== undefined || uc !== undefined) result.tagHints = { quality, uc };
    const vibes = metadataVibes(comment);
    if (vibes.length) result.vibes = vibes;
  }
  const vibeFile = embeddedVibeFile(entries);
  if (vibeFile) result.vibeFile = vibeFile;

  if (desk) {
    // 이 앱의 결과면 따로 저장한 원래 값이 감정 섞이지 않은 값이다.
    result.commonPositive = desk.commonPositive;
    result.commonNegative = desk.commonNegative;
    result.characters = [
      { positive: desk.promptSet.positive, negative: desk.promptSet.negative },
      ...(desk.extraCharacters ?? []).map((character) => ({
        positive: removeReferenceInset(character.prompt),
        negative: character.negative,
      })),
    ];
    result.seed = desk.seed;
    if (desk.model) result.model = desk.model;
    if (desk.model) result.effort = desk.effort ?? 'high';
    if (desk.qualityTags !== undefined) result.qualityTags = desk.qualityTags;
    if (desk.qualityLevel !== undefined) result.qualityLevel = desk.qualityLevel;
    if (desk.ucPreset !== undefined) result.ucPreset = desk.ucPreset;
  }
  return result;
}

/** PNG는 텍스트 청크, 이 앱의 WebP는 XMP. 없으면 `decodePixels`로 stealth를 읽는다. */
export async function readImageMetadata(
  bytes: Uint8Array,
  decodePixels?: () => Promise<{
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
  }>,
): Promise<ImageImportData | null> {
  const fromText = interpretMetadata(readImageText(bytes));
  if (fromText) return fromText;
  if (!decodePixels) return null;
  const pixels = await decodePixels();
  const stealth = readStealthMetadata(pixels.data, pixels.width, pixels.height);
  return stealth ? interpretMetadata(stealth) : null;
}
