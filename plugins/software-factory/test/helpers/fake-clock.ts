export interface FakeClock {
  advance(ms: number): void;
  restore(): void;
}

/** Replace the wall clock so a test can cross a cache TTL without sleeping. */
export function installFakeClock(startMs = Date.now()): FakeClock {
  const RealDate = globalThis.Date;
  let nowMs = startMs;
  const FakeDate = new Proxy(RealDate, {
    apply: () => new RealDate(nowMs).toString(),
    construct: (_target, args) =>
      Reflect.construct(RealDate, args.length === 0 ? [nowMs] : args),
    get(target, property, receiver) {
      if (property === "now") return () => nowMs;
      return Reflect.get(target, property, receiver);
    },
  });
  globalThis.Date = FakeDate as DateConstructor;
  return {
    advance(ms) {
      nowMs += ms;
    },
    restore() {
      globalThis.Date = RealDate;
    },
  };
}
