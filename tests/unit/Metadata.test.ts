import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  DESK_METADATA_KEY,
  interpretMetadata,
  MAX_STEALTH_TEXT_BYTES,
  readImageMetadata,
  readStealthMetadata,
} from '../../src/core/metadata/NaiMetadata';
import {
  copyTextChunks,
  crc32,
  insertPngChunks,
  makeITextChunk,
  readPngChunks,
  readPngText,
} from '../../src/core/metadata/PngChunks';

// 1×1 투명 PNG
const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
);

function tEXt(keyword: string, text: string): Uint8Array {
  const data = new TextEncoder().encode(`${keyword}\0${text}`);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set([116, 69, 88, 116], 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

const naiComment = {
  prompt: 'reference inset, masterpiece, 1girl',
  uc: 'lowres',
  steps: 23,
  scale: 5.5,
  cfg_rescale: 0.2,
  seed: 42,
  sampler: 'k_euler',
  noise_schedule: 'karras',
  width: 1216,
  height: 832,
  v4_prompt: {
    caption: {
      base_caption: 'reference inset, masterpiece, 1girl',
      char_captions: [{ char_caption: 'silver hair, smile', centers: [{ x: 0.5, y: 0.5 }] }],
    },
  },
  v4_negative_prompt: {
    caption: { base_caption: 'lowres, text', char_captions: [{ char_caption: 'bad hands' }] },
  },
};

describe('PNG text chunks', () => {
  it('tEXt와 압축 iTXt를 읽고 쓰며 이미지 데이터는 유지해', () => {
    const withText = insertPngChunks(TINY_PNG, [
      tEXt('Software', 'NovelAI'),
      makeITextChunk('Emotion', '기쁨 😊'),
    ]);
    expect(readPngText(withText)).toEqual({ Software: 'NovelAI', Emotion: '기쁨 😊' });
    const types = readPngChunks(withText).map((chunk) => chunk.type);
    expect(types.at(-1)).toBe('IEND');
    expect(types.filter((type) => type === 'IDAT')).toHaveLength(1);
  });

  it('크롭 결과로 원본 텍스트 청크를 옮기고 중복 키는 건너뛰어', () => {
    const source = insertPngChunks(TINY_PNG, [tEXt('Comment', '{}'), tEXt('Software', 'NovelAI')]);
    const target = insertPngChunks(TINY_PNG, [tEXt('Software', 'Other')]);
    const merged = copyTextChunks(source, target, [makeITextChunk('Extra', 'x')]);
    expect(readPngText(merged)).toEqual({ Software: 'Other', Comment: '{}', Extra: 'x' });
  });
});

describe('NovelAI metadata', () => {
  it('Comment JSON에서 프롬프트·캐릭터·설정을 꺼내고 reference inset을 지워', async () => {
    const png = insertPngChunks(TINY_PNG, [tEXt('Comment', JSON.stringify(naiComment))]);
    const data = await readImageMetadata(png);
    expect(data).toMatchObject({
      source: 'novelai',
      commonPositive: 'masterpiece, 1girl',
      commonNegative: 'lowres, text',
      characters: [{ positive: 'silver hair, smile', negative: 'bad hands' }],
      settings: { steps: 23, promptGuidance: 5.5, cfgRescale: 0.2, sampler: 'k_euler' },
      seed: 42,
      width: 1216,
    });
  });

  it('NovelAI 웹이 남긴 품질 태그·UC 프리셋 힌트를 읽어', () => {
    expect(
      interpretMetadata({
        Comment: JSON.stringify({ ...naiComment, tag_hint_qt: 1, tag_hint_uc_preset: 3 }),
      })?.tagHints,
    ).toEqual({ quality: 1, uc: 3 });
    expect(interpretMetadata({ Comment: JSON.stringify(naiComment) })?.tagHints).toBeUndefined();
  });

  it('이 앱의 보조 메타데이터가 있으면 감정이 섞이지 않은 원래 값을 우선해', () => {
    const data = interpretMetadata({
      Comment: JSON.stringify(naiComment),
      [DESK_METADATA_KEY]: JSON.stringify({
        app: 'reference-inpaint-desk',
        version: 1,
        characterName: '아리아',
        presetName: 'P',
        commonPositive: 'masterpiece, 1girl',
        commonNegative: 'lowres',
        promptSet: { name: '기본', positive: 'silver hair', negative: 'bad hands' },
        emotion: { name: '기쁨', prompt: 'smile' },
        seed: 42,
      }),
    });
    expect(data?.source).toBe('desk');
    expect(data?.characters).toEqual([{ positive: 'silver hair', negative: 'bad hands' }]);
    expect(data?.desk?.emotion.name).toBe('기쁨');
  });

  /** payload를 알파 채널 LSB에 열 우선으로 심은 이미지를 만든다. bitLength로 헤더 길이를 바꿀 수 있다. */
  function stealthImage(payload: Uint8Array, bitLength = payload.length * 8) {
    const bytes = [
      ...new TextEncoder().encode('stealth_pngcomp'),
      ...[24, 16, 8, 0].map((shift) => (bitLength >>> shift) & 0xff),
      ...payload,
    ];
    const bits = bytes.flatMap((byte) =>
      Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1),
    );
    const height = 64;
    const width = Math.ceil(bits.length / height);
    const rgba = new Uint8Array(width * height * 4).fill(254);
    bits.forEach((bit, index) => {
      const column = Math.floor(index / height);
      const row = index % height;
      rgba[(row * width + column) * 4 + 3] = 254 | bit;
    });
    return { rgba, width, height };
  }

  it('알파 채널 stealth 메타데이터를 열 우선 순서로 읽어', () => {
    const payload = gzipSync(
      new TextEncoder().encode(JSON.stringify({ Comment: JSON.stringify(naiComment) })),
    );
    const { rgba, width, height } = stealthImage(payload);
    const stealth = readStealthMetadata(rgba, width, height);
    expect(stealth).not.toBeNull();
    expect(interpretMetadata(stealth!)?.seed).toBe(42);
  });

  it('픽셀에 담길 수 없는 stealth 헤더 길이는 버퍼를 잡지 않고 null이야', () => {
    const payload = gzipSync(new TextEncoder().encode('{}'));
    const { rgba, width, height } = stealthImage(payload, 0xffffffff);
    expect(readStealthMetadata(rgba, width, height)).toBeNull();
  });

  it('압축 해제 결과가 상한을 넘는 stealth 메타데이터는 null이야', () => {
    const bomb = gzipSync(new Uint8Array(MAX_STEALTH_TEXT_BYTES + 1).fill(0x20));
    const { rgba, width, height } = stealthImage(bomb);
    expect(readStealthMetadata(rgba, width, height)).toBeNull();
  });

  it('메타데이터가 없으면 null이야', async () => {
    expect(await readImageMetadata(TINY_PNG)).toBeNull();
    expect(readStealthMetadata(new Uint8Array(16 * 4), 4, 4)).toBeNull();
  });
});
