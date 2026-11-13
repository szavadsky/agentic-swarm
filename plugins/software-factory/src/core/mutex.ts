/**
 * Async synchronization primitives for coordinating concurrent tasks.
 */

/**
 * Non-reentrant, FIFO asynchronous mutex.
 */
export class AsyncMutex {
  private locked = false;
  private queue: Array<(release: () => void) => void> = [];

  public isLocked(): boolean {
    return this.locked;
  }

  public acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        const next = this.queue.shift();
        if (next) {
          next(release);
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(resolve);
      }
    });
  }

  public async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Keyed asynchronous mutex providing independent locks per string key.
 * Automatically cleans up idle entries when all waiters have completed.
 */
export class KeyedMutex {
  private mutexes = new Map<string, { mutex: AsyncMutex; count: number }>();

  /** Number of retained key entries (0 when idle; exposed for tests). */
  public get activeKeys(): number {
    return this.mutexes.size;
  }
  public async runExclusive<T>(
    key: string,
    fn: () => Promise<T> | T
  ): Promise<T> {
    let entry = this.mutexes.get(key);
    if (!entry) {
      entry = { mutex: new AsyncMutex(), count: 0 };
      this.mutexes.set(key, entry);
    }

    entry.count++;
    try {
      return await entry.mutex.runExclusive(fn);
    } finally {
      entry.count--;
      // Delete only if this entry is still the current one: entry B created
      // after entry A hit zero must not be removed by A's late unlock.
      if (entry.count <= 0 && this.mutexes.get(key) === entry) {
        this.mutexes.delete(key);
      }
    }
  }
}
