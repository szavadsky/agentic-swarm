import { describe, expect, it } from "bun:test";
import { Semaphores } from "../src/core/semaphores.js";

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5));

describe("named counting semaphores", () => {
  it("takes one count per distinct name per holder", async () => {
    const semaphores = new Semaphores([
      { name: "shared", max: 1 },
      { name: "other", max: 2 },
    ]);

    const release = await semaphores.acquire([
      "shared",
      "other",
      "shared",
      "other",
    ]);

    expect(semaphores.held("shared")).toBe(1);
    expect(semaphores.held("other")).toBe(1);
    release();
    expect(semaphores.held("shared")).toBe(0);
    expect(semaphores.held("other")).toBe(0);
  });

  it("waits FIFO for a free count and releases idempotently", async () => {
    const semaphores = new Semaphores([{ name: "one", max: 1 }]);
    const order: string[] = [];

    const first = await semaphores.acquire(["one"]);
    order.push("first");
    const second = semaphores.acquire(["one"]).then((release) => {
      order.push("second");
      return release;
    });
    const third = semaphores.acquire(["one"]).then((release) => {
      order.push("third");
      return release;
    });

    await tick();
    expect(order).toEqual(["first"]);

    first();
    first();
    const secondRelease = await second;
    await tick();
    expect(semaphores.held("one")).toBe(1);
    expect(order).toEqual(["first", "second"]);

    secondRelease();
    const thirdRelease = await third;
    expect(order).toEqual(["first", "second", "third"]);
    thirdRelease();
    expect(semaphores.held("one")).toBe(0);
  });

  it("tryAcquire takes nothing when any name is full", async () => {
    const semaphores = new Semaphores([
      { name: "a", max: 1 },
      { name: "b", max: 1 },
    ]);
    const heldB = semaphores.tryAcquire(["b"]);
    expect(heldB).toBeDefined();

    expect(semaphores.tryAcquire(["a", "b"])).toBeUndefined();
    expect(semaphores.held("a")).toBe(0);
    expect(semaphores.held("b")).toBe(1);

    const heldA = semaphores.tryAcquire(["a"]);
    expect(heldA).toBeDefined();
    expect(semaphores.held("a")).toBe(1);
    heldA?.();
    heldB?.();
    expect(semaphores.tryAcquire(["a", "b"])).toBeDefined();
  });

  it("refuses an undeclared name at the call, never inside a release", async () => {
    const semaphores = new Semaphores([{ name: "declared", max: 1 }]);
    expect(() => semaphores.tryAcquire(["missing"])).toThrow(
      'no semaphore named "missing"',
    );
    expect(() => semaphores.acquire(["declared", "missing"])).toThrow(
      'no semaphore named "missing"',
    );
    expect(semaphores.held("declared")).toBe(0);
  });

  it("refuses a repeated declaration and a max below one", () => {
    expect(
      () =>
        new Semaphores([
          { name: "twice", max: 1 },
          { name: "twice", max: 1 },
        ]),
    ).toThrow('semaphore "twice" is declared twice');
    expect(() => new Semaphores([{ name: "zero", max: 0 }])).toThrow(
      'semaphore "zero" needs a positive integer max',
    );
  });
});
