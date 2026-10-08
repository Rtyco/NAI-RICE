import { unzipSync } from 'fflate';
import type { GenerationSettings } from '../domain/types';
import { naiHttpError, naiNetworkError, NaiApiError } from './NaiErrors';
import {
  buildNovelAIInpaintRequest,
  NAI_IMAGE_ENDPOINT,
  NAI_USER_ENDPOINT,
} from './NovelAIRequestBuilder';

export type NovelAIImageRequest = {
  token: string;
  prompt: string;
  negativePrompt: string;
  characterPrompt: string;
  characterNegativePrompt: string;
  image: Buffer;
  mask: Buffer;
  width: number;
  height: number;
  seed: number;
  settings: GenerationSettings;
  signal?: AbortSignal;
};

export type NovelAIUserStatus = {
  valid: boolean;
  anlas?: number;
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
  const hasV5Quota =
    Number.isFinite(percent) &&
    typeof usage?.isNegative === 'boolean' &&
    Number.isFinite(timeUntilNextPercent);

  return {
    valid: true,
    ...(Number.isFinite(fixed) && Number.isFinite(purchased) ? { anlas: fixed + purchased } : {}),
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

export class NovelAIProvider {
  async validateToken(token: string, signal?: AbortSignal): Promise<NovelAIUserStatus> {
    let response: Response;
    try {
      response = await fetch(NAI_USER_ENDPOINT, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal,
      });
    } catch (error) {
      throw naiNetworkError(error);
    }
    if (!response.ok) throw naiHttpError(response.status, await response.text());
    return parseNovelAIUserStatus((await response.json()) as Record<string, any>);
  }

  async generate(request: NovelAIImageRequest): Promise<Buffer> {
    const body = buildNovelAIInpaintRequest({
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      characterPrompt: request.characterPrompt,
      characterNegativePrompt: request.characterNegativePrompt,
      imageBase64: request.image.toString('base64'),
      maskBase64: request.mask.toString('base64'),
      width: request.width,
      height: request.height,
      seed: request.seed,
      settings: request.settings,
    });
    let response: Response;
    try {
      response = await fetch(NAI_IMAGE_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${request.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: request.signal,
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
    return firstPngFromZip(new Uint8Array(await response.arrayBuffer()));
  }
}
