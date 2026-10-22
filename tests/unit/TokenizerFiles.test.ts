import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { TokenizerFiles } from '../../electron/services/TokenizerFiles';
import type { TokenizerName } from '../../src/core/prompts/PromptTokens';

const file = deflateSync(new TextEncoder().encode(JSON.stringify({ text: '#version\na b' })));

describe('TokenizerFiles', () => {
  it('NovelAI 웹과 같은 주소에서 한 번만 받고 다음부터는 저장한 파일을 읽어', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'tokenizers-'));
    const urls: string[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      return new Response(file);
    };
    expect(new Uint8Array(await new TokenizerFiles(folder, fetch).load('clip'))).toEqual(file);
    expect(new Uint8Array(await new TokenizerFiles(folder, fetch).load('clip'))).toEqual(file);
    expect(urls).toEqual([
      'https://novelai.net/tokenizer/compressed/clip_tokenizer.def?v=2&static=true',
    ]);
  });

  it('풀리지 않는 파일은 저장하지 않고, 정해진 이름만 받아', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'tokenizers-'));
    let calls = 0;
    const files = new TokenizerFiles(folder, async () => {
      calls += 1;
      return new Response(calls === 1 ? 'not a tokenizer' : file);
    });
    await expect(files.load('t5')).rejects.toThrow();
    expect(new Uint8Array(await files.load('t5'))).toEqual(file);
    expect(() => files.load('../escape' as TokenizerName)).toThrow('알 수 없는 토크나이저');
  });
});
