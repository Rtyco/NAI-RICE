import { describe, expect, it } from 'vitest';
import { RequestPacer } from '../../electron/services/RequestPacer';
import { VibeEncoder } from '../../electron/services/VibeEncoder';
import type { JobVibe } from '../../src/core/domain/types';

const settings = { model: 'nai-diffusion-4-5-full-inpainting' };
const vibe: JobVibe = {
  name: '노을',
  imagePath: 'inputs/a.png',
  imageSha256: 'a'.repeat(64),
  strength: 0.6,
  informationExtracted: 0.7,
};

function memoryCache() {
  const stored = new Map<string, Buffer>();
  return {
    readVibe: async (key: string) => stored.get(key),
    writeVibe: async (key: string, data: Buffer) => void stored.set(key, data),
  };
}

describe('RequestPacer', () => {
  it('waits the delay after the previous response', async () => {
    const pacer = new RequestPacer(() => 120);
    const signal = new AbortController().signal;
    await pacer.send(signal, async () => undefined);
    const started = Date.now();
    await pacer.send(signal, async () => undefined);
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it('does not wait once the request is cancelled', async () => {
    const pacer = new RequestPacer(() => 1000);
    await pacer.send(new AbortController().signal, async () => undefined);
    const controller = new AbortController();
    controller.abort();
    const started = Date.now();
    await pacer.send(controller.signal, async () => undefined);
    expect(Date.now() - started).toBeLessThan(100);
  });
});

describe('VibeEncoder', () => {
  const signal = new AbortController().signal;

  it('encodes once and reuses the stored result', async () => {
    const cache = memoryCache();
    let encodes = 0;
    const encoder = new VibeEncoder(
      cache,
      { encodeVibe: async () => Buffer.from(`E${(encodes += 1)}`) },
      new RequestPacer(() => 0),
    );
    const first = await encoder.encodeAll(settings, [vibe], [Buffer.from('png')], 't', signal);
    const second = await encoder.encodeAll(settings, [vibe], [Buffer.from('png')], 't', signal);
    expect(first.map(String)).toEqual(['E1']);
    expect(second.map(String)).toEqual(['E1']);
    expect(encodes).toBe(1);
  });

  it('blocks an encoding-only vibe whose encoding is missing', async () => {
    const encoder = new VibeEncoder(
      memoryCache(),
      { encodeVibe: async () => Buffer.from('never') },
      new RequestPacer(() => 0),
    );
    await expect(
      encoder.encodeAll(
        settings,
        [{ ...vibe, encodingId: 'imported' }],
        [Buffer.from('')],
        't',
        signal,
      ),
    ).rejects.toThrow('노을');
  });
});
