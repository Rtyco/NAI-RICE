import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationJobSnapshot } from '../../src/core/domain/types';
import { NovelAIProvider, parseNovelAIUserStatus } from '../../src/core/providers/NovelAIProvider';
import { NAI_AUGMENT_ENDPOINT } from '../../src/core/providers/NovelAIRequestBuilder';

describe('parseNovelAIUserStatus', () => {
  it('V5 무료 생성 잔여 할당량과 Anlas를 함께 읽어', () => {
    expect(
      parseNovelAIUserStatus({
        subscription: {
          trainingStepsLeft: {
            fixedTrainingStepsLeft: 10_000,
            purchasedTrainingSteps: 250,
          },
          usage: {
            percent: 83.6,
            isNegative: false,
            timeUntilNextPercent: 120,
          },
        },
      }),
    ).toEqual({
      valid: true,
      anlas: 10_250,
      v5Quota: {
        percent: 84,
        isNegative: false,
        timeUntilNextPercent: 120,
      },
    });
  });

  it('구독 등급을 읽고, 정수가 아니면 비워 둬', () => {
    expect(parseNovelAIUserStatus({ subscription: { tier: 3 } }).tier).toBe(3);
    expect(parseNovelAIUserStatus({ subscription: { tier: '3' } }).tier).toBeUndefined();
    expect(parseNovelAIUserStatus({}).tier).toBeUndefined();
  });

  it('서버가 보고한 100% 초과 잔량을 보존하고 불완전한 응답은 미확인으로 둬', () => {
    expect(
      parseNovelAIUserStatus({
        subscription: {
          usage: { percent: 111, isNegative: false, timeUntilNextPercent: 0 },
        },
      }).v5Quota?.percent,
    ).toBe(111);

    expect(
      parseNovelAIUserStatus({ subscription: { usage: { percent: 0 } } }).v5Quota,
    ).toBeUndefined();
  });
});

describe('NovelAIProvider 요청', () => {
  afterEach(() => vi.unstubAllGlobals());

  const job = {
    kind: 'augment',
    tool: 'lineart',
    toolPrompt: '',
    defry: 0,
    canvasWidth: 64,
    canvasHeight: 64,
  } as unknown as GenerationJobSnapshot;

  it('작업 종류에 맞는 주소로 보내고 응답 ZIP의 PNG를 돌려줘', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetch = vi.fn(async () => new Response(zipSync({ 'image_0.png': png })));
    vi.stubGlobal('fetch', fetch);
    const result = await new NovelAIProvider().generate({
      token: 'T',
      job,
      image: Buffer.from('IMG'),
    });
    expect([...result]).toEqual([...png]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(NAI_AUGMENT_ENDPOINT);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer T');
    expect(JSON.parse(String(init.body))).toMatchObject({ req_type: 'lineart', image: 'SU1H' });
  });

  it('오류 응답과 연결 실패를 종류가 있는 오류로 바꿔', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"bad token"}', { status: 401 })),
    );
    await expect(new NovelAIProvider().validateToken('T')).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(
      new NovelAIProvider().generate({ token: 'T', job, image: Buffer.from('IMG') }),
    ).rejects.toMatchObject({ kind: 'network', retryable: true });
  });
});
