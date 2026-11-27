/**
 * Named counting semaphores: a holder takes one count from each distinct name
 * it references, every name at once, so a multi-name holder can never be
 * granted half its set.
 */

import type { Release, SemaphoreDeclaration } from "./semaphores-types.js";

interface Waiter {
  names: readonly string[];
  resolve: (release: Release) => void;
}

export class Semaphores {
  private readonly max = new Map<string, number>();
  private readonly inUse = new Map<string, number>();
  /**
   * FIFO waiters: the head that cannot be granted blocks later ones rather
   * than letting a narrow request overtake a wide one.
   */
  private readonly waiting: Waiter[] = [];

  constructor(declarations: readonly SemaphoreDeclaration[]) {
    for (const declaration of declarations) {
      const { name, max } = declaration;
      if (name === "") throw new Error("a semaphore needs a non-empty name");
      if (!Number.isInteger(max) || max < 1) {
        throw new Error(
          `semaphore "${name}" needs a positive integer max, got ${max}`,
        );
      }
      if (this.max.has(name)) {
        throw new Error(`semaphore "${name}" is declared twice`);
      }
      this.max.set(name, max);
    }
  }

  /** Counts currently held under `name`; zero for a name nobody holds. */
  public held(name: string): number {
    return this.inUse.get(name) ?? 0;
  }

  /** Takes every distinct name's count without waiting, or nothing at all. */
  public tryAcquire(names: readonly string[]): Release | undefined {
    return this.take(this.distinct(names));
  }

  /**
   * Waits for every distinct name to have a free count, then takes them
   * together. A name repeated in `names` costs one count, so a holder that
   * reaches one semaphore through its step, subscription and harness still
   * takes a single count.
   */
  public acquire(names: readonly string[]): Promise<Release> {
    const distinct = this.distinct(names);
    const release = this.take(distinct);
    if (release !== undefined) return Promise.resolve(release);
    return new Promise((resolve) => {
      this.waiting.push({ names: distinct, resolve });
    });
  }

  /** The distinct names, sorted so logs and multi-name sets are stable. */
  private distinct(names: readonly string[]): string[] {
    const distinct = [...new Set(names)].sort();
    for (const name of distinct) {
      if (!this.max.has(name)) {
        throw new Error(`no semaphore named "${name}" is declared`);
      }
    }
    return distinct;
  }

  private take(names: readonly string[]): Release | undefined {
    for (const name of names) {
      if (this.held(name) >= this.max.get(name)!) return undefined;
    }
    for (const name of names) this.inUse.set(name, this.held(name) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const name of names) this.inUse.set(name, this.held(name) - 1);
      this.pump();
    };
  }

  /** Grants the waiting head wherever it fits, then the next, in arrival order. */
  private pump(): void {
    for (;;) {
      const waiter = this.waiting[0];
      if (waiter === undefined) return;
      const release = this.take(waiter.names);
      if (release === undefined) return;
      this.waiting.shift();
      waiter.resolve(release);
    }
  }
}
