import { unzlibSync, zlibSync } from 'fflate';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const TEXT_TYPES = new Set(['tEXt', 'iTXt', 'zTXt']);

export type PngChunk = { type: string; data: Uint8Array; raw: Uint8Array };

let crcTable: Uint32Array | undefined;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export function readPngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error('PNG 파일이 아닙니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) break;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    chunks.push({
      type,
      data: bytes.subarray(offset + 8, offset + 8 + length),
      raw: bytes.subarray(offset, end),
    });
    offset = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');
const encoder = new TextEncoder();

function decodeTextChunk(chunk: PngChunk): [string, string] | null {
  const data = chunk.data;
  const keywordEnd = data.indexOf(0);
  if (keywordEnd <= 0) return null;
  const keyword = latin1.decode(data.subarray(0, keywordEnd));
  try {
    if (chunk.type === 'tEXt') {
      // NovelAI는 tEXt에 UTF-8을 그대로 기록하므로 UTF-8로 먼저 해석한다.
      return [keyword, utf8.decode(data.subarray(keywordEnd + 1))];
    }
    if (chunk.type === 'zTXt') {
      return [keyword, utf8.decode(unzlibSync(data.subarray(keywordEnd + 2)))];
    }
    // iTXt: keyword\0 flag method lang\0 translated\0 text
    const compressed = data[keywordEnd + 1] === 1;
    let cursor = keywordEnd + 3;
    const languageEnd = data.indexOf(0, cursor);
    cursor = languageEnd + 1;
    const translatedEnd = data.indexOf(0, cursor);
    const text = data.subarray(translatedEnd + 1);
    return [keyword, utf8.decode(compressed ? unzlibSync(text) : text)];
  } catch {
    return null;
  }
}

export function readPngText(bytes: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};
  for (const chunk of readPngChunks(bytes)) {
    if (!TEXT_TYPES.has(chunk.type)) continue;
    const decoded = decodeTextChunk(chunk);
    if (decoded) result[decoded[0]] = decoded[1];
  }
  return result;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) chunk[4 + index] = type.charCodeAt(index);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** UTF-8 텍스트는 iTXt(압축)로 기록한다. 한국어 감정 이름도 안전하게 보존된다. */
export function makeITextChunk(keyword: string, text: string): Uint8Array {
  const key = encoder.encode(keyword);
  const body = zlibSync(encoder.encode(text));
  const data = new Uint8Array(key.length + 5 + body.length);
  data.set(key, 0);
  // keyword\0, compression flag 1, method 0, empty language\0, empty translated\0
  data.set([0, 1, 0, 0, 0], key.length);
  data.set(body, key.length + 5);
  return makeChunk('iTXt', data);
}

/**
 * IEND 앞에 청크를 끼워 넣는다. 원본 응답의 텍스트 청크를 크롭 결과로 옮겨
 * NovelAI 메타데이터가 최종 결과물에도 남도록 할 때 사용한다.
 */
export function insertPngChunks(bytes: Uint8Array, extra: Uint8Array[]): Uint8Array {
  const chunks = readPngChunks(bytes);
  const parts: Uint8Array[] = [Uint8Array.from(PNG_SIGNATURE)];
  for (const chunk of chunks) {
    if (chunk.type === 'IEND') parts.push(...extra);
    parts.push(chunk.raw);
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function textKeyword(chunk: PngChunk): string | undefined {
  const end = chunk.data.indexOf(0);
  return end > 0 ? latin1.decode(chunk.data.subarray(0, end)) : undefined;
}

/** `from`의 텍스트 청크 중 `to`에 같은 키워드가 없는 것만 복사하고, `extra`를 덧붙인다. */
export function copyTextChunks(
  from: Uint8Array,
  to: Uint8Array,
  extra: Uint8Array[] = [],
): Uint8Array {
  const existing = new Set(
    readPngChunks(to)
      .filter((chunk) => TEXT_TYPES.has(chunk.type))
      .map(textKeyword),
  );
  const copied = readPngChunks(from)
    .filter((chunk) => TEXT_TYPES.has(chunk.type) && !existing.has(textKeyword(chunk)))
    .map((chunk) => Uint8Array.from(chunk.raw));
  return insertPngChunks(to, [...copied, ...extra]);
}
