/** 진행 중이면 마지막 값만 남겼다가 끝나는 즉시 잇는다. 일정 시간 기다리는 방식은 늦게 따라와 답답하다. */
export class LatestOnly<T> {
  private queued: { value: T } | null = null;
  private running = false;

  constructor(private readonly task: (value: T) => Promise<void>) {}

  get busy(): boolean {
    return this.running;
  }

  push(value: T): void {
    this.queued = { value };
    if (this.running) return;
    this.running = true;
    void this.drain();
  }

  clear(): void {
    this.queued = null;
  }

  private async drain(): Promise<void> {
    try {
      for (let next = this.queued; next; next = this.queued) {
        this.queued = null;
        await this.task(next.value);
      }
    } finally {
      this.running = false;
    }
  }
}
