import { unzipSync } from 'fflate';
import type { GenerationJobSnapshot, GenerationSettings } from '../domain/types';
import { naiHttpError, naiNetworkError, NaiApiError } from './NaiErrors';
import {
  buildNovelAIEncodeVibeRequest,
  buildNovelAIJobRequest,
  NAI_ENCODE_VIBE_ENDPOINT,
  NAI_USER_ENDPOINT,
} from './NovelAIRequestBuilder';

/** 작업 하나를 생성하는 요청. 입력 이미지·마스크는 그 작업 종류가 쓰는 것만 넘긴다. */
export type NovelAIImageRequest = {
  token: string;
  job: GenerationJobSnapshot;
  image?: Buffer;
  mask?: Buffer;
  /** 캐릭터 레퍼런스 그림 또는 바이브 인코딩 결과. */
  aid?: Buffer;
  signal?: AbortSignal;
};

export type NovelAIVibeRequest = {
  token: string;
  image: Buffer;
  settings: Pick<GenerationSettings, 'model'>;
  informationExtracted: number;
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

/** 응답 ZIP의 PNG를 이름 순서(`image_0`, `image_1`…)로 꺼낸다. 배경 제거는 세 장이 온다. */
function pngsFromZip(buffer: Uint8Array): Buffer[] {
  const files = unzipSync(buffer, {
    filter: (file) =>
      file.name.toLowerCase().endsWith('.png') && file.originalSize <= MAX_RESULT_PNG_BYTES,
  });
  const entries = Object.entries(files)
    .filter(([name]) => name.toLowerCase().endsWith('.png'))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  if (!entries.length)
    throw new NaiApiError('unsupported-request', '응답 ZIP에 PNG 이미지가 없습니다.');
  return entries.map(([, data]) => Buffer.from(data));
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

  async generate(request: NovelAIImageRequest): Promise<Buffer[]> {
    const { url, body } = buildNovelAIJobRequest(request.job, {
      imageBase64: request.image?.toString('base64'),
      maskBase64: request.mask?.toString('base64'),
      aidBase64: request.aid?.toString('base64'),
    });
    const response = await requestNovelAI(url, request.token, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: request.signal,
    });
    return pngsFromZip(new Uint8Array(await response.arrayBuffer()));
  }

  async encodeVibe(request: NovelAIVibeRequest): Promise<Buffer> {
    const response = await requestNovelAI(NAI_ENCODE_VIBE_ENDPOINT, request.token, {
      method: 'POST',
      body: JSON.stringify(
        buildNovelAIEncodeVibeRequest(
          request.image.toString('base64'),
          request.settings,
          request.informationExtracted,
        ),
      ),
      signal: request.signal,
    });
    return Buffer.from(await response.arrayBuffer());
  }
}
