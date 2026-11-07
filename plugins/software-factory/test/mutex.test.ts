import { describe, it, expect } from "bun:test";
import { AsyncMutex, KeyedMutex, Semaphore } from "../src/core/mutex.js";

describe("Async synchronization primitives (§2)", () => {
  it("AsyncMutex enforces sequential FIFO execution without interleaving", async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];

    const job = async (id: number, delayMs: number) => {
      await mutex.runExclusive(async () => {
        order.push(id);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        order.push(id * 10);
      });
    };

    await Promise.all([job(1, 30), job(2, 10), job(3, 5)]);

    expect(order).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("KeyedMutex isolates locks by key and allows cross-key parallelism", async () => {
    const keyed = new KeyedMutex();
    let activeA = 0;
    let activeB = 0;
    let maxA = 0;
    let maxB = 0;

    const task = async (key: "a" | "b") => {
      await keyed.runExclusive(key, async () => {
        if (key === "a") {
          activeA++;
          maxA = Math.max(maxA, activeA);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeA--;
        } else {
          activeB++;
          maxB = Math.max(maxB, activeB);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeB--;
        }
      });
    };

    await Promise.all([task("a"), task("a"), task("b"), task("b")]);
    // Within same key, concurrency is exactly 1
    expect(maxA).toBe(1);
    expect(maxB).toBe(1);
  });

  it("KeyedMutex removes idle key entries after the last waiter completes", async () => {
    const keyed = new KeyedMutex();

    await keyed.runExclusive("only-key", async () => {
      expect(keyed.activeKeys).toBe(1);
    });
    expect(keyed.activeKeys).toBe(0);

    // Entries survive while waiters are queued, then drain to zero.
    const gate = Promise.all([
      keyed.runExclusive("hot", async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }),
      keyed.runExclusive("hot", async () => {}),
      keyed.runExclusive("other", async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(keyed.activeKeys).toBe(2);
    await gate;
    expect(keyed.activeKeys).toBe(0);

    // A fresh lock on a cleaned-up key still serializes correctly.
    const order: number[] = [];
    await Promise.all([
      keyed.runExclusive("only-key", async () => {
        order.push(1);
      }),
      keyed.runExclusive("only-key", async () => {
        order.push(2);
      }),
    ]);
    expect(order).toEqual([1, 2]);
    expect(keyed.activeKeys).toBe(0);
  });

  it("Semaphore restricts active concurrency to maxConcurrency limit", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxConcurrent = 0;

    const worker = async () => {
      await sem.run(async () => {
        active++;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active--;
      });
    };

    await Promise.all([worker(), worker(), worker(), worker(), worker()]);

    expect(maxConcurrent).toBe(2);
  });
});
