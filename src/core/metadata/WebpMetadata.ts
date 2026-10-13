import { isPng, readPngText } from './PngChunks';

/** WebP에는 텍스트 청크가 없어 PNG 텍스트(NovelAI Comment 등과 앱 메타데이터)를 JSON으로 XMP에 넣는다. PNG로 내보낼 때 다시 청크로 만든다. */
const NAMESPACE = 'https://github.com/Rtyco/NAI-RICE/ns/png-text/1.0/';
const OPEN = '<nairice:pngText>';
const CLOSE = '</nairice:pngText>';

export function isWebp(bytes: Uint8Array): boolean {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP';
}

/** UTF-8. 없으면 undefined. */
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
    // RIFF: 홀수 크기는 1바이트를 채운다.
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

export function readImageText(bytes: Uint8Array): Record<string, string> {
  if (isPng(bytes)) return readPngText(bytes);
  const xmp = readWebpXmp(bytes);
  return (xmp && xmpToText(xmp)) || {};
}
