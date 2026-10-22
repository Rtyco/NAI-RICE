import { promises as fs } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { TOKENIZER_NAMES, type TokenizerName } from '../../src/core/prompts/PromptTokens';
import { atomicWrite } from './fsUtils';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** NovelAI 웹이 받는 파일과 같다(2026-10). 로그인이 필요 없는 정적 파일이다. */
const url = (name: TokenizerName) =>
  `https://novelai.net/tokenizer/compressed/${name}_tokenizer.def?v=2&static=true`;

/** 프롬프트 토큰 막대용. 처음 한 번 받아 두고 다음부터는 파일에서 읽는다. */
export class TokenizerFiles {
  private readonly loading = new Map<TokenizerName, Promise<Uint8Array>>();

  constructor(
    private readonly folder: string,
    private readonly fetch: Fetch,
  ) {}

  load(name: TokenizerName): Promise<Uint8Array> {
    if (!TOKENIZER_NAMES.includes(name)) throw new Error(`알 수 없는 토크나이저입니다: ${name}`);
    let loading = this.loading.get(name);
    if (!loading) {
      loading = this.read(name).catch((error: unknown) => {
        this.loading.delete(name);
        throw error;
      });
      this.loading.set(name, loading);
    }
    return loading;
  }

  private async read(name: TokenizerName): Promise<Uint8Array> {
    const file = path.join(this.folder, `${name}_tokenizer.v2.def`);
    const saved = await fs.readFile(file).catch(() => undefined);
    if (saved) return saved;
    let response: Response;
    try {
      response = await this.fetch(url(name), { signal: AbortSignal.timeout(45_000) });
    } catch {
      throw new Error('NovelAI에서 토크나이저를 받을 수 없습니다. 인터넷 연결을 확인하십시오.');
    }
    if (!response.ok) throw new Error(`토크나이저를 받을 수 없습니다 (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // 깨진 파일을 저장해 두면 다시 받지 않으므로 풀어서 확인한다.
    JSON.parse(inflateRawSync(bytes).toString('utf8'));
    await atomicWrite(file, bytes);
    return bytes;
  }
}
