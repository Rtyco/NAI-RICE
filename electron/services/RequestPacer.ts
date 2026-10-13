/** NovelAI 요청 사이에 설정한 간격을 둔다. 생성과 바이브 인코딩이 같은 간격을 함께 쓴다. */
export class RequestPacer {
  private lastRequestAt = 0;

  /** `delayMs`는 요청마다 읽으므로 설정을 바꾸면 다음 요청부터 반영된다. */
  constructor(private readonly delayMs: () => number) {}

  /** 간격을 지켜 요청을 보낸다. 간격은 앞 요청의 응답을 받은 때부터 세고, 취소하면 기다리지 않는다. */
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
