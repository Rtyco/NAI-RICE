import { Gunzip } from 'fflate';
import type { GenerationSettings, QualityLevel, UcPresetId } from '../domain/types';
import { isPng, readPngText } from './PngChunks';

/**
 * 이 앱이 결과 PNG에 함께 기록하는 보조 메타데이터 키.
 * 앱 이름이 NAI RICE로 바뀌었어도 이미 만든 이미지를 계속 읽을 수 있게 예전 식별자를 그대로 쓴다.
 */
export const DESK_METADATA_KEY = 'ReferenceInpaintDesk';

export type DeskMetadata = {
  app: 'reference-inpaint-desk';
  version: 1 | 2;
  characterName: string;
  presetName: string;
  commonPositive: string;
  commonNegative: string;
  promptSet: { name: string; positive: string; negative: string };
  emotion: { name: string; prompt: string };
  seed: number;
  /** v2부터: 품질 태그·UC 프리셋 설정과 모델. */
  qualityTags?: boolean;
  qualityLevel?: QualityLevel;
  ucPreset?: UcPresetId;
  model?: string;
};

export type ImageImportData = {
  source: 'novelai' | 'desk';
  commonPositive?: string;
  commonNegative?: string;
  characters: Array<{ positive: string; negative: string }>;
  settings: Partial<GenerationSettings>;
  seed?: number;
  width?: number;
  height?: number;
  modelLabel?: string;
  /** Source 라벨에서 추정한 인페인트 모델 ID. */
  model?: string;
  /** 이 앱의 결과물이면 품질 태그·UC 프리셋 설정을 그대로 알 수 있다. */
  qualityTags?: boolean;
  qualityLevel?: QualityLevel;
  ucPreset?: UcPresetId;
  /** NovelAI 웹이 기록한 품질 태그·UC 프리셋 힌트 번호(`tag_hint_qt`, `tag_hint_uc_preset`). */
  tagHints?: { quality?: number; uc?: number };
  desk?: DeskMetadata;
};

/** "NovelAI Diffusion V4.5 4BDE2A90" 같은 Source 라벨을 인페인트 모델 ID로 바꾼다. */
export function guessModelFromSource(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const text = label.toLowerCase();
  const curated = text.includes('curated');
  if (/v5/.test(text)) return 'nai-diffusion-5-full-inpainting';
  if (/v4\.5/.test(text))
    return curated ? 'nai-diffusion-4-5-curated-inpainting' : 'nai-diffusion-4-5-full-inpainting';
  if (/v4/.test(text))
    return curated ? 'nai-diffusion-4-curated-inpainting' : 'nai-diffusion-4-full-inpainting';
  // NovelAI V3 이미지는 "Stable Diffusion XL <해시>"로 기록된다(9CC2F394는 Furry).
  if (/furry|9cc2f394/.test(text)) return 'nai-diffusion-furry-3-inpainting';
  if (/stable diffusion xl/.test(text)) return 'nai-diffusion-3-inpainting';
  if (/v3|anime/.test(text)) return 'nai-diffusion-3-inpainting';
  return undefined;
}

// ── stealth (알파 채널 LSB) ─────────────────────────────

/** stealth 메타데이터 압축 해제 결과의 상한. 실제 NovelAI 메타데이터는 수 KB다. */
export const MAX_STEALTH_TEXT_BYTES = 1024 * 1024;
/** 한 번에 넣는 압축 데이터 크기. deflate 최대 압축률(약 1032:1)로도 한 번의 출력이 1MB 안팎에 그친다. */
const GUNZIP_INPUT_CHUNK = 1024;

/** 결과가 `limit`을 넘으면 그 자리에서 멈추는 gunzip. 압축 폭탄으로 메모리를 다 쓰지 않게 한다. */
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

/**
 * NovelAI가 알파 채널 최하위 비트에 숨겨 기록하는 메타데이터를 읽는다.
 * 비트는 열 우선(위→아래, 왼쪽→오른쪽) 순서이며 MSB부터 채운다.
 */
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
    // 헤더 길이를 믿고 큰 버퍼를 잡지 않도록, 남은 픽셀에 실제로 담길 수 있는 만큼만 허용한다.
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

// ── 해석 ───────────────────────────────────────────────

function stripReferenceInset(prompt: string): string {
  return prompt
    .split(',')
    .map((piece) => piece.trim())
    .filter((piece) => piece && piece.toLowerCase() !== 'reference inset')
    .join(', ');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseJsonObject(value: unknown): Record<string, any> | undefined {
  if (typeof value === 'object' && value !== null) return value as Record<string, any>;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseDesk(value: unknown): DeskMetadata | undefined {
  const parsed = parseJsonObject(value);
  return parsed?.app === 'reference-inpaint-desk' ? (parsed as DeskMetadata) : undefined;
}

/** PNG 텍스트(또는 stealth) 항목에서 NovelAI 생성 파라미터를 추출한다. 인식할 수 없으면 null. */
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

  if (comment) {
    const v4 = comment.v4_prompt?.caption;
    const v4Negative = comment.v4_negative_prompt?.caption;
    const base =
      asString(v4?.base_caption) ?? asString(comment.prompt) ?? asString(entries.Description);
    const negative = asString(v4Negative?.base_caption) ?? asString(comment.uc);
    if (base !== undefined) result.commonPositive = stripReferenceInset(base);
    if (negative !== undefined) result.commonNegative = negative;
    const positives: unknown[] = Array.isArray(v4?.char_captions) ? v4.char_captions : [];
    const negatives: unknown[] = Array.isArray(v4Negative?.char_captions)
      ? v4Negative.char_captions
      : [];
    result.characters = positives.map((item, index) => ({
      positive: stripReferenceInset(
        asString((item as Record<string, unknown>)?.char_caption) ?? '',
      ),
      negative: asString((negatives[index] as Record<string, unknown>)?.char_caption) ?? '',
    }));
    const settings: Partial<GenerationSettings> = {};
    const steps = asNumber(comment.steps);
    const scale = asNumber(comment.scale);
    const rescale = asNumber(comment.cfg_rescale);
    const strength = asNumber(comment.strength);
    if (steps !== undefined) settings.steps = Math.round(steps);
    if (scale !== undefined) settings.promptGuidance = scale;
    if (rescale !== undefined) settings.cfgRescale = rescale;
    if (strength !== undefined) settings.inpaintStrength = Math.max(0, Math.min(1, strength));
    if (asString(comment.sampler)) settings.sampler = comment.sampler;
    if (asString(comment.noise_schedule)) settings.noiseSchedule = comment.noise_schedule;
    result.settings = settings;
    result.seed = asNumber(comment.seed);
    result.width = asNumber(comment.width);
    result.height = asNumber(comment.height);
    const quality = asNumber(comment.tag_hint_qt);
    const uc = asNumber(comment.tag_hint_uc_preset);
    if (quality !== undefined || uc !== undefined) result.tagHints = { quality, uc };
  }

  if (desk) {
    // 이 앱의 결과물이면 분리 저장해 둔 원래 값을 우선한다. 캐릭터 프롬프트에 감정이 섞이지 않는다.
    result.commonPositive = desk.commonPositive;
    result.commonNegative = desk.commonNegative;
    result.characters = [{ positive: desk.promptSet.positive, negative: desk.promptSet.negative }];
    result.seed = desk.seed;
    if (desk.model) result.model = desk.model;
    if (desk.qualityTags !== undefined) result.qualityTags = desk.qualityTags;
    if (desk.qualityLevel !== undefined) result.qualityLevel = desk.qualityLevel;
    if (desk.ucPreset !== undefined) result.ucPreset = desk.ucPreset;
  }
  return result;
}

/**
 * PNG 바이트에서 메타데이터를 읽는다. 텍스트 청크가 없으면 `decodePixels`로 픽셀을 얻어
 * stealth 메타데이터를 시도한다. 픽셀 디코딩은 실행 환경(브라우저 캔버스 등)에 맡긴다.
 */
export async function readImageMetadata(
  bytes: Uint8Array,
  decodePixels?: () => Promise<{
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
  }>,
): Promise<ImageImportData | null> {
  if (isPng(bytes)) {
    const fromText = interpretMetadata(readPngText(bytes));
    if (fromText) return fromText;
  }
  if (!decodePixels) return null;
  const pixels = await decodePixels();
  const stealth = readStealthMetadata(pixels.data, pixels.width, pixels.height);
  return stealth ? interpretMetadata(stealth) : null;
}
