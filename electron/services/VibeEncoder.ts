import type { GenerationSettings, JobVibe } from '../../src/core/domain/types';
import { encodedOnlyMessage, vibeCacheKey } from '../../src/core/providers/NovelAIRequestBuilder';
import type { GenerationStore, ImageGenerator } from './ports';
import type { RequestPacer } from './RequestPacer';

/** 같은 그림·모델·추출량이면 캐시를 쓰고, 없으면 인코딩(2 Anlas)해 저장한다. 인코딩도 요청 간격을 지킨다. */
export class VibeEncoder {
  constructor(
    private readonly cache: Pick<GenerationStore, 'readVibe' | 'writeVibe'>,
    private readonly provider: Pick<ImageGenerator, 'encodeVibe'>,
    private readonly pacer: RequestPacer,
  ) {}

  /** `sources`는 `vibes`와 같은 순서 */
  async encodeAll(
    settings: Pick<GenerationSettings, 'model'>,
    vibes: JobVibe[],
    sources: Buffer[],
    token: string,
    signal: AbortSignal,
  ): Promise<Buffer[]> {
    const encoded: Buffer[] = [];
    for (const [index, vibe] of vibes.entries())
      encoded.push(await this.encode(settings, vibe, sources[index], token, signal));
    return encoded;
  }

  private async encode(
    settings: Pick<GenerationSettings, 'model'>,
    vibe: JobVibe,
    source: Buffer,
    token: string,
    signal: AbortSignal,
  ): Promise<Buffer> {
    const key = vibeCacheKey(
      vibe.encodingId ?? vibe.imageSha256,
      settings,
      vibe.informationExtracted,
    );
    const cached = await this.cache.readVibe(key);
    if (cached) return cached;
    if (vibe.encodingId) throw new Error(encodedOnlyMessage(vibe.name));
    const provider = this.provider;
    if (!provider.encodeVibe) throw new Error('바이브를 인코딩할 수 없습니다.');
    const encoded = await this.pacer.send(signal, () =>
      provider.encodeVibe!({
        token,
        image: source,
        settings,
        informationExtracted: vibe.informationExtracted,
        signal,
      }),
    );
    await this.cache.writeVibe(key, encoded);
    return encoded;
  }
}
