import { describe, expect, it } from 'vitest';
import { classifyNaiError, naiHttpError } from '../../src/core/providers/NaiErrors';

describe('NovelAI error classification', () => {
  it.each([
    [401, '', 'auth', false],
    [403, '', 'auth', false],
    [429, '', 'rate-limit', true],
    [500, '', 'server', true],
    [503, '', 'server', true],
    [400, 'prompt token limit exceeded', 'prompt-limit', false],
    [400, 'insufficient Anlas balance', 'quota', false],
    [422, 'bad request', 'unsupported-request', false],
  ])('classifies HTTP %s as %s', (status, detail, kind, retryable) => {
    const error = naiHttpError(status as number, JSON.stringify({ message: detail }));
    expect(classifyNaiError(status as number, detail as string)).toBe(kind);
    expect(error.retryable).toBe(retryable);
  });
});
