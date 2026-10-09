import { isPng, readPngText } from './PngChunks';

/**
 * WebP로 저장한 결과의 메타데이터. WebP에는 PNG 텍스트 청크가 없으므로, PNG에 있던 텍스트(NovelAI의
 * Comment·Software 등과 이 앱의 보조 메타데이터)를 그대로 JSON으로 묶어 XMP 안에 넣는다. PNG로
 * 내보낼 때는 이 값으로 텍스트 청크를 다시 만든다.
 */
const NAMESPACE = 'https://github.com/Rtyco/NAI-RICE/ns/png-text/1.0/';
const OPEN = '<nairice:pngText>';
const CLOSE = '</nairice:pngText>';

export function isWebp(bytes: Uint8Array): boolean {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP';
}

/** RIFF 청크 중 `XMP ` 청크의 내용(UTF-8). 없으면 undefined. */
export function readWebpXmp(bytes: Uint8Array): string | undefined {
  if (!isWebp(bytes)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.length) return undefined;
    if (type === 'XMP ') return new TextDecoder().decode(bytes.subarray(start, start + size));
    // 청크 크기가 홀수면 1바이트를 채운다(RIFF 규칙).
    offset = start + size + (size % 2);
  }
  return undefined;
}

const escapeXml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const unescapeXml = (text: string) =>
  text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

export function textToXmp(text: Record<string, string>): string {
  return [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    `<rdf:Description rdf:about="" xmlns:nairice="${NAMESPACE}">`,
    `${OPEN}${escapeXml(JSON.stringify(text))}${CLOSE}`,
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
  ].join('');
}

export function xmpToText(xmp: string): Record<string, string> | undefined {
  const start = xmp.indexOf(OPEN);
  const end = xmp.indexOf(CLOSE, start);
  if (start < 0 || end < 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(unescapeXml(xmp.slice(start + OPEN.length, end)));
    if (!parsed || typeof parsed !== 'object') return undefined;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return undefined;
  }
}

/** PNG 텍스트 청크나 WebP XMP에 담긴 텍스트. 둘 다 아니면 빈 객체. */
export function readImageText(bytes: Uint8Array): Record<string, string> {
  if (isPng(bytes)) return readPngText(bytes);
  const xmp = readWebpXmp(bytes);
  return (xmp && xmpToText(xmp)) || {};
}
