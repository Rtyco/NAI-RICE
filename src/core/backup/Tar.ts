/** ustar. 한글이나 100바이트를 넘는 이름은 앞에 PAX 헤더(`path`)를 둔다. SD Studio(tar-stream)가 이 형식을 읽고 쓴다. */
export const TAR_BLOCK = 512;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function writeString(block: Uint8Array, offset: number, length: number, text: string) {
  block.set(encoder.encode(text).subarray(0, length), offset);
}

function writeOctal(block: Uint8Array, offset: number, length: number, value: number) {
  writeString(block, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`);
}

function header(name: string, size: number, mtime: Date, type: string): Uint8Array {
  const block = new Uint8Array(TAR_BLOCK);
  writeString(block, 0, 100, name);
  writeOctal(block, 100, 8, 0o644);
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, size);
  writeOctal(block, 136, 12, Math.floor(mtime.getTime() / 1000));
  block.fill(0x20, 148, 156);
  writeString(block, 156, 1, type);
  writeString(block, 257, 6, 'ustar\0');
  writeString(block, 263, 2, '00');
  const sum = block.reduce((total, byte) => total + byte, 0);
  writeString(block, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
  return block;
}

export function tarPadding(size: number): Uint8Array {
  return new Uint8Array((TAR_BLOCK - (size % TAR_BLOCK)) % TAR_BLOCK);
}

/** PAX 레코드 `<길이> path=<값>\n`의 길이는 자기 자릿수까지 센다. */
function paxRecord(key: string, value: string): Uint8Array {
  const body = encoder.encode(` ${key}=${value}\n`).length;
  let length = body + String(body).length;
  if (String(length).length !== String(body).length) length = body + String(length).length;
  return encoder.encode(`${length} ${key}=${value}\n`);
}

/** PAX 헤더가 필요하면 그 내용까지 든다. 뒤에 내용과 `tarPadding(size)`를 붙여 쓴다. */
export function tarFileHeader(name: string, size: number, mtime = new Date()): Uint8Array {
  const plain = /^[\x20-\x7e]*$/.test(name) && name.length <= 100;
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').slice(-100);
  const entry = header(plain ? name : fallback, size, mtime, '0');
  if (plain) return entry;
  const pax = paxRecord('path', name);
  const parts = [
    header(`PaxHeader/${fallback}`.slice(0, 100), pax.length, mtime, 'x'),
    pax,
    tarPadding(pax.length),
    entry,
  ];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function tarEnd(): Uint8Array {
  return new Uint8Array(TAR_BLOCK * 2);
}

export type TarHeader = { name: string; size: number; type: string };

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return decoder.decode(end < 0 ? slice : slice.subarray(0, end));
}

/** 빈 블록(끝)이면 null. 체크섬이 틀리면 tar가 아니다. */
export function parseTarHeader(block: Uint8Array): TarHeader | null {
  if (block.every((byte) => byte === 0)) return null;
  const stored = parseInt(readString(block, 148, 8).trim(), 8);
  let sum = 0;
  for (let index = 0; index < TAR_BLOCK; index += 1)
    sum += index >= 148 && index < 156 ? 0x20 : block[index];
  if (stored !== sum) throw new Error('tar 파일이 아니거나 손상되었습니다.');
  const name = readString(block, 0, 100);
  const prefix = readString(block, 345, 155);
  return {
    name: prefix ? `${prefix}/${name}` : name,
    size: parseInt(readString(block, 124, 12).trim() || '0', 8),
    type: String.fromCharCode(block[156] || 0x30),
  };
}

export function parsePax(data: Uint8Array): Record<string, string> {
  const text = decoder.decode(data);
  const values: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^\d+ ([^=]+)=(.*)$/s.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}
