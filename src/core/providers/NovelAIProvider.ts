import { unzipSync } from 'fflate';
import type { GenerationJobSnapshot } from '../domain/types';
import { naiHttpError, naiNetworkError, NaiApiError } from './NaiErrors';
import { buildNovelAIJobRequest, NAI_USER_ENDPOINT } from './NovelAIRequestBuilder';

/** 작업 하나를 생성하는 요청. 입력 이미지·마스크는 그 작업 종류가 쓰는 것만 넘긴다. */
export type NovelAIImageRequest = {
  token: string;
  job: GenerationJobSnapshot;
  image?: Buffer;
  mask?: Buffer;
  signal?: AbortSignal;
};

export type NovelAIUserStatus = {
  valid: boolean;
  anlas?: number;
  /** 구독 등급. 0 Paper, 1 Tablet, 2 Scroll, 3 Opus. */
  tier?: number;
  v5Quota?: {
    percent: number;
    isNegative: boolean;
    timeUntilNextPercent: number;
  };
};

export function parseNovelAIUserStatus(payload: Record<string, any>): NovelAIUserStatus {
  const steps = payload?.subscription?.trainingStepsLeft;
  const fixed = Number(steps?.fixedTrainingStepsLeft);
  const purchased = Number(steps?.purchasedTrainingSteps);
  const usage = payload?.subscription?.usage;
  const percent = Number(usage?.percent);
  const timeUntilNextPercent = Number(usage?.timeUntilNextPercent);
  const tier = payload?.subscription?.tier;
  const hasV5Quota =
    Number.isFinite(percent) &&
    typeof usage?.isNegative === 'boolean' &&
    Number.isFinite(timeUntilNextPercent);

  return {
    valid: true,
    ...(Number.isFinite(fixed) && Number.isFinite(purchased) ? { anlas: fixed + purchased } : {}),
    ...(Number.isInteger(tier) ? { tier } : {}),
    ...(hasV5Quota
      ? {
          v5Quota: {
            percent: Math.max(0, Math.round(percent)),
            isNegative: usage.isNegative,
            timeUntilNextPercent: Math.max(0, timeUntilNextPercent),
          },
        }
      : {}),
  };
}

/** 응답 ZIP 안 PNG 한 장의 상한. 실제 결과는 수 MB다. */
const MAX_RESULT_PNG_BYTES = 64 * 1024 * 1024;

function firstPngFromZip(buffer: Uint8Array): Buffer {
  const files = unzipSync(buffer, {
    filter: (file) =>
      file.name.toLowerCase().endsWith('.png') && file.originalSize <= MAX_RESULT_PNG_BYTES,
  });
  const entry = Object.entries(files).find(([name]) => name.toLowerCase().endsWith('.png'));
  if (!entry) throw new NaiApiError('unsupported-request', '응답 ZIP에 PNG 이미지가 없습니다.');
  return Buffer.from(entry[1]);
}

/** NovelAI에 요청하고, 연결 실패와 오류 응답을 NaiApiError로 바꾼다. */
async function requestNovelAI(
  url: string,
  token: string,
  init: { method: 'GET' | 'POST'; body?: string; signal?: AbortSignal },
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    throw naiNetworkError(error);
  }
  if (!response.ok) {
    throw naiHttpError(
      response.status,
      await response.text(),
      response.headers.get('x-correlation-id') ?? undefined,
    );
  }
  return response;
}

export class NovelAIProvider {
  async validateToken(token: string, signal?: AbortSignal): Promise<NovelAIUserStatus> {
    const response = await requestNovelAI(NAI_USER_ENDPOINT, token, { method: 'GET', signal });
    return parseNovelAIUserStatus((await response.json()) as Record<string, any>);
  }

  async generate(request: NovelAIImageRequest): Promise<Buffer> {
    const { url, body } = buildNovelAIJobRequest(request.job, {
      imageBase64: request.image?.toString('base64'),
      maskBase64: request.mask?.toString('base64'),
    });
    const response = await requestNovelAI(url, request.token, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: request.signal,
    });
    return firstPngFromZip(new Uint8Array(await response.arrayBuffer()));
  }
}
