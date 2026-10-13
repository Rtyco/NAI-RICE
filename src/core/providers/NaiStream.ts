/**
 * `stream: "msgpack"`이면 4바이트 빅엔디언 길이 + MessagePack 맵(`event_type`: intermediate(JPEG)·final·error)이
 * 이어진다(NovelAI 웹 2026-10). 커뮤니티 구현의 SSE(`data:` JSON, base64)도 읽는다.
 */
export type NaiStreamEvent = {
  type: 'intermediate' | 'final' | 'error';
  /** `samp_ix`. 앱은 늘 한 장이라 0. */
  sample: number;
  /** `step_ix` */
  step: number;
  image?: Uint8Array;
  message?: string;
};

class Reader {
  offset = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private take(count: number): number {
    const at = this.offset;
    if (at + count > this.bytes.length) throw new Error('MessagePack 메시지가 잘렸습니다.');
    this.offset += count;
    return at;
  }
  u8 = () => this.view.getUint8(this.take(1));
  u16 = () => this.view.getUint16(this.take(2));
  u32 = () => this.view.getUint32(this.take(4));
  bytesOf = (count: number) => this.bytes.subarray(this.take(count), this.offset);
  read(): unknown {
    const byte = this.u8();
    if (byte <= 0x7f) return byte;
    if (byte >= 0xe0) return byte - 0x100;
    if ((byte & 0xf0) === 0x80) return this.map(byte & 0x0f);
    if ((byte & 0xf0) === 0x90) return this.array(byte & 0x0f);
    if ((byte & 0xe0) === 0xa0) return this.text(byte & 0x1f);
    const view = this.view;
    switch (byte) {
      case 0xc0:
        return null;
      case 0xc2:
        return false;
      case 0xc3:
        return true;
      case 0xc4:
        return this.bytesOf(this.u8());
      case 0xc5:
        return this.bytesOf(this.u16());
      case 0xc6:
        return this.bytesOf(this.u32());
      case 0xc7:
        return this.extension(this.u8());
      case 0xc8:
        return this.extension(this.u16());
      case 0xc9:
        return this.extension(this.u32());
      case 0xca:
        return view.getFloat32(this.take(4));
      case 0xcb:
        return view.getFloat64(this.take(8));
      case 0xcc:
        return this.u8();
      case 0xcd:
        return this.u16();
      case 0xce:
        return this.u32();
      case 0xcf:
        return Number(view.getBigUint64(this.take(8)));
      case 0xd0:
        return view.getInt8(this.take(1));
      case 0xd1:
        return view.getInt16(this.take(2));
      case 0xd2:
        return view.getInt32(this.take(4));
      case 0xd3:
        return Number(view.getBigInt64(this.take(8)));
      case 0xd4:
        return this.extension(1);
      case 0xd5:
        return this.extension(2);
      case 0xd6:
        return this.extension(4);
      case 0xd7:
        return this.extension(8);
      case 0xd8:
        return this.extension(16);
      case 0xd9:
        return this.text(this.u8());
      case 0xda:
        return this.text(this.u16());
      case 0xdb:
        return this.text(this.u32());
      case 0xdc:
        return this.array(this.u16());
      case 0xdd:
        return this.array(this.u32());
      case 0xde:
        return this.map(this.u16());
      case 0xdf:
        return this.map(this.u32());
    }
    throw new Error(`알 수 없는 MessagePack 형식입니다: 0x${byte.toString(16)}`);
  }
  private text(length: number): string {
    return new TextDecoder().decode(this.bytesOf(length));
  }
  /** 확장 형식(타임스탬프 등)은 쓰지 않는다. */
  private extension(length: number): undefined {
    this.take(1 + length);
    return undefined;
  }
  private array(length: number): unknown[] {
    return Array.from({ length }, () => this.read());
  }
  private map(length: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let index = 0; index < length; index += 1) result[String(this.read())] = this.read();
    return result;
  }
}

export function decodeMsgpack(bytes: Uint8Array): unknown {
  return new Reader(bytes).read();
}

function base64Bytes(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function toEvent(value: unknown): NaiStreamEvent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const type = raw.event_type;
  if (type !== 'intermediate' && type !== 'final' && type !== 'error') return undefined;
  const image =
    raw.image instanceof Uint8Array
      ? raw.image
      : typeof raw.image === 'string' && raw.image
        ? base64Bytes(raw.image)
        : undefined;
  return {
    type,
    sample: typeof raw.samp_ix === 'number' ? raw.samp_ix : 0,
    step: typeof raw.step_ix === 'number' ? raw.step_ix : 0,
    ...(image ? { image } : {}),
    ...(typeof raw.message === 'string' ? { message: raw.message } : {}),
  };
}

export class NaiStreamParser {
  private buffer = new Uint8Array(0);
  private text = '';

  constructor(private readonly format: 'msgpack' | 'sse') {}

  push(chunk: Uint8Array): NaiStreamEvent[] {
    return this.format === 'sse' ? this.pushText(chunk) : this.pushFrames(chunk);
  }

  /** 스트림이 끝났을 때 남은 SSE 이벤트 */
  flush(): NaiStreamEvent[] {
    if (this.format !== 'sse') return [];
    const rest = this.text;
    this.text = '';
    return this.sseEvent(rest);
  }

  private pushFrames(chunk: Uint8Array): NaiStreamEvent[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer);
    joined.set(chunk, this.buffer.length);
    const view = new DataView(joined.buffer);
    const events: NaiStreamEvent[] = [];
    let offset = 0;
    while (joined.length - offset >= 4) {
      const length = view.getUint32(offset);
      if (joined.length - offset - 4 < length) break;
      const event = toEvent(decodeMsgpack(joined.subarray(offset + 4, offset + 4 + length)));
      if (event) events.push(event);
      offset += 4 + length;
    }
    this.buffer = joined.slice(offset);
    return events;
  }

  private decoder = new TextDecoder();

  private pushText(chunk: Uint8Array): NaiStreamEvent[] {
    this.text += this.decoder.decode(chunk, { stream: true });
    const blocks = this.text.split(/\r?\n\r?\n/);
    this.text = blocks.pop() ?? '';
    return blocks.flatMap((block) => this.sseEvent(block));
  }

  private sseEvent(block: string): NaiStreamEvent[] {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data) return [];
    try {
      const event = toEvent(JSON.parse(data));
      return event ? [event] : [];
    } catch {
      return [];
    }
  }
}
