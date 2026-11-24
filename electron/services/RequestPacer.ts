export const MAX_REQUEST_DELAY_MS = 10_000;

export type RequestDelayConfig = number | { baseMs: number; random?: boolean; jitterMs?: number };

export function resolveRequestDelay(
  config: RequestDelayConfig,
  random: () => number = Math.random,
): number {
  const clamp = (value: number) => Math.max(0, Math.min(MAX_REQUEST_DELAY_MS, value));
  if (typeof config === 'number') return clamp(config);
  const base = clamp(config.baseMs);
  if (!config.random) return base;
  const jitter = clamp(config.jitterMs ?? 0);
  return base + Math.round(Math.max(0, Math.min(1, random())) * jitter);
}

/** 생성과 바이브 인코딩이 같은 간격을 함께 쓴다. */
export class RequestPacer {
  private lastRequestAt = 0;

  /** 요청마다 읽는다. */
  constructor(
    private readonly delayMs: () => RequestDelayConfig,
    private readonly random: () => number = Math.random,
  ) {}

  /** 간격은 앞 응답을 받은 때부터 센다. 취소하면 기다리지 않는다. */
  async send<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
    await this.wait(signal);
    this.lastRequestAt = Date.now();
    const result = await request();
    this.lastRequestAt = Date.now();
    return result;
  }

  private wait(signal: AbortSignal): Promise<void> {
    const delay = resolveRequestDelay(this.delayMs(), this.random);
    const remaining = this.lastRequestAt + delay - Date.now();
    if (remaining <= 0 || signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(finish, remaining);
      signal.addEventListener('abort', finish, { once: true });
      function finish() {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      }
    });
  }
}
