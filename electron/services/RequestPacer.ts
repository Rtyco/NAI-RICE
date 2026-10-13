/** 생성과 바이브 인코딩이 같은 간격을 함께 쓴다. */
export class RequestPacer {
  private lastRequestAt = 0;

  /** 요청마다 읽는다. */
  constructor(private readonly delayMs: () => number) {}

  /** 간격은 앞 응답을 받은 때부터 센다. 취소하면 기다리지 않는다. */
  async send<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
    await this.wait(signal);
    this.lastRequestAt = Date.now();
    const result = await request();
    this.lastRequestAt = Date.now();
    return result;
  }

  private wait(signal: AbortSignal): Promise<void> {
    const delay = Math.max(0, Math.min(1000, this.delayMs()));
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
