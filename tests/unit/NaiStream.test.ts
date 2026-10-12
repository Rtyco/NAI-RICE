import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationJobSnapshot } from '../../src/core/domain/types';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/core/model/defaults';
import { decodeMsgpack, NaiStreamParser } from '../../src/core/providers/NaiStream';
import { NovelAIProvider } from '../../src/core/providers/NovelAIProvider';
import {
  NAI_IMAGE_ENDPOINT,
  NAI_IMAGE_STREAM_ENDPOINT,
} from '../../src/core/providers/NovelAIRequestBuilder';

/** 시험용 MessagePack 인코더. 문자열 키 맵·짧은 문자열·작은 정수·바이너리만 쓴다. */
function pack(value: Record<string, string | number | Uint8Array>): Uint8Array {
  const out: number[] = [0x80 | Object.keys(value).length];
  const text = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    out.push(0xa0 | bytes.length, ...bytes);
  };
  for (const [key, item] of Object.entries(value)) {
    text(key);
    if (typeof item === 'string') text(item);
    else if (typeof item === 'number') out.push(0xcd, item >> 8, item & 0xff);
    else out.push(0xc5, item.length >> 8, item.length & 0xff, ...item);
  }
  return new Uint8Array(out);
}

function frame(message: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + message.length);
  new DataView(out.buffer).setUint32(0, message.length);
  out.set(message, 4);
  return out;
}

/** Response 본문으로 넘길 ArrayBuffer. */
const bytes = (data: Uint8Array) => data.slice().buffer as ArrayBuffer;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
const JPEG = new Uint8Array([0xff, 0xd8, 9]);

describe('NovelAI 스트리밍 응답', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('MessagePack 맵·문자열·정수·바이너리를 읽어', () => {
    expect(decodeMsgpack(pack({ event_type: 'final', samp_ix: 0, image: PNG }))).toEqual({
      event_type: 'final',
      samp_ix: 0,
      image: PNG,
    });
    expect(decodeMsgpack(new Uint8Array([0x92, 0xc3, 0xcb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0]))).toEqual(
      [true, 1.5],
    );
  });

  it('조각으로 나뉘어 와도 길이 머리로 메시지를 모아 이벤트로 바꿔', () => {
    const stream = new Uint8Array([
      ...frame(pack({ event_type: 'intermediate', samp_ix: 0, step_ix: 6, image: JPEG })),
      ...frame(pack({ event_type: 'final', samp_ix: 0, image: PNG })),
    ]);
    const parser = new NaiStreamParser('msgpack');
    const events = [
      ...parser.push(stream.subarray(0, 3)),
      ...parser.push(stream.subarray(3, 20)),
      ...parser.push(stream.subarray(20)),
    ];
    expect(events).toEqual([
      { type: 'intermediate', sample: 0, step: 6, image: JPEG },
      { type: 'final', sample: 0, step: 0, image: PNG },
    ]);
  });

  it('SSE로 오면 data 줄의 JSON과 base64 그림을 읽어', () => {
    const parser = new NaiStreamParser('sse');
    const body = `event: x\ndata: {"event_type":"final","samp_ix":0,"image":"${Buffer.from(PNG).toString('base64')}"}\n\n`;
    const bytes = new TextEncoder().encode(body);
    expect([...parser.push(bytes.subarray(0, 10)), ...parser.push(bytes.subarray(10))]).toEqual([
      { type: 'final', sample: 0, step: 0, image: PNG },
    ]);
  });

  const job = {
    kind: 'txt2img',
    prompt: 'a',
    negativePrompt: '',
    characterPrompt: '',
    characterNegativePrompt: '',
    canvasWidth: 832,
    canvasHeight: 1216,
    seed: 1,
    settings: { ...DEFAULT_GENERATION_SETTINGS, model: 'nai-diffusion-4-5-full-inpainting' },
  } as unknown as GenerationJobSnapshot;

  it('중간 그림을 받으면 스트리밍 주소로 보내고 중간 그림과 최종 그림을 나눠 줘', async () => {
    const body = new Uint8Array([
      ...frame(pack({ event_type: 'intermediate', samp_ix: 0, step_ix: 5, image: JPEG })),
      ...frame(pack({ event_type: 'final', samp_ix: 0, image: PNG })),
    ]);
    const fetch = vi.fn(
      async () => new Response(bytes(body), { headers: { 'content-type': 'application/msgpack' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const previews: number[] = [];
    const result = await new NovelAIProvider().generate({
      token: 'T',
      job,
      onPreview: ({ step }) => previews.push(step),
    });
    expect(result.map((image) => [...image])).toEqual([[...PNG]]);
    expect(previews).toEqual([5]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(NAI_IMAGE_STREAM_ENDPOINT);
    expect(JSON.parse(String(init.body)).parameters.stream).toBe('msgpack');
  });

  it('오류 이벤트는 NovelAI 오류로 던지고, V3는 스트리밍하지 않아', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes(frame(pack({ event_type: 'error', message: 'bad' }))))),
    );
    await expect(
      new NovelAIProvider().generate({ token: 'T', job, onPreview: () => undefined }),
    ).rejects.toThrow('bad');

    const fetch = vi.fn(async () => new Response('not a zip'));
    vi.stubGlobal('fetch', fetch);
    const v3 = {
      ...job,
      settings: { ...job.settings, model: 'nai-diffusion-3-inpainting' },
    } as GenerationJobSnapshot;
    await new NovelAIProvider()
      .generate({ token: 'T', job: v3, onPreview: () => undefined })
      .catch(() => undefined);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(NAI_IMAGE_ENDPOINT);
    expect(JSON.parse(String(init.body)).parameters.stream).toBeUndefined();
  });
});
