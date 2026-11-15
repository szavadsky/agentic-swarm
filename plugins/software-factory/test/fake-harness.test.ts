import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnResult,
} from "../src/harness/fake/fake-harness.js";
import type { Stop, TurnRequest } from "../src/harness/types.js";

const model = { id: "test/model", effort: "high" };

function request(overrides: Partial<TurnRequest> = {}): TurnRequest {
  return {
    model,
    cwd: os.tmpdir(),
    prompt: "do the thing",
    timeouts: { idleMs: 1_000, wallMs: 5_000 },
    ...overrides,
  };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fake-harness-"));
}

describe("FakeHarness (kernel contract)", () => {
  it("reports its id and configured caps", async () => {
    const harness = new FakeHarness({
      id: "fake-test",
      caps: { compact: "server", effort: ["low", "high"] },
    });
    const caps = await harness.caps(model);
    expect(harness.id).toBe("fake-test");
    expect(caps.compact).toBe("server");
    expect(caps.effort).toEqual(["low", "high"]);
    expect(caps.usage.cache).toBe(true);
  });

  it("returns a completed TurnResult and creates session ids for fresh turns", async () => {
    const harness = new FakeHarness();
    harness.script((req) =>
      fakeTurnResult(req, {
        text: "hello",
        usage: { in: 10, cacheRead: 4, out: 3, costUsd: 0.02 },
      }),
    );

    const res = await harness.turn(request());

    expect(res.stop).toEqual({ kind: "done" });
    expect(res.text).toBe("hello");
    expect(res.usage).toEqual({
      in: 10,
      cacheRead: 4,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 3,
      reasoningOut: 0,
      costUsd: 0.02,
    });
    expect(res.session?.id).toMatch(/^fake-session-/);
    expect(res.session?.cwd).toBe(os.tmpdir());
    expect(res.session?.model).toEqual(model);
    expect(res.model).toEqual(model);
    expect(res.attempts).toEqual([
      { model, stop: { kind: "done" }, usage: res.usage },
    ]);
    expect(harness.calls).toHaveLength(1);
  });

  it("forwards the fallback chain and reports the model actually used", async () => {
    const fallback = { id: "test/backup" };
    const harness = new FakeHarness();
    let seen: TurnRequest["fallbacks"];
    harness.script((req) => {
      seen = req.fallbacks;
      return fakeTurnResult(req, { model: fallback, text: "from backup" });
    });

    const res = await harness.turn(request({ fallbacks: [fallback] }));
    expect(seen).toEqual([fallback]);
    expect(res.model).toEqual(fallback);
    expect(res.attempts?.[0]?.model).toEqual(fallback);
  });

  it("keeps a resumed session id and gives distinct fresh ids", async () => {
    const harness = new FakeHarness();
    harness.script((req) => fakeTurnResult(req));
    harness.script((req) => fakeTurnResult(req));
    harness.script((req) => fakeTurnResult(req));

    const first = await harness.turn(request());
    const second = await harness.turn(request());
    expect(first.session?.id).not.toBe(second.session?.id);

    const resumed = await harness.turn(request({ session: first.session }));
    expect(resumed.session?.id).toBe(first.session?.id);
    expect(resumed.session?.model).toEqual(model);
  });

  it("runs file side effects in cwd and writes the outcome file", async () => {
    const dir = tempDir();
    const outcomePath = path.join(dir, "outcome.json");
    const harness = new FakeHarness();
    harness.script((req, ctx) => {
      fs.writeFileSync(path.join(req.cwd, "implemented.txt"), "done");
      ctx.writeOutcome({ status: "done", summary: "implemented" });
      return fakeTurnResult(req, {
        text: "wrote files",
        usage: { in: 1, out: 2 },
      });
    });

    try {
      const res = await harness.turn(request({ cwd: dir, outcomePath }));

      expect(fs.readFileSync(path.join(dir, "implemented.txt"), "utf8")).toBe(
        "done",
      );
      expect(JSON.parse(fs.readFileSync(outcomePath, "utf8"))).toEqual({
        status: "done",
        summary: "implemented",
      });
      expect(res.text).toBe("wrote files");
      expect(res.usage.in).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes through every scripted stop, including each infra cause", async () => {
    const stops: Stop[] = [
      { kind: "cancelled" },
      { kind: "refusal", details: "policy" },
      { kind: "truncated", cause: "max-tokens" },
      { kind: "truncated", cause: "turn-limit" },
      { kind: "infra", cause: "quota" },
      { kind: "infra", cause: "rate" },
      { kind: "infra", cause: "auth" },
      { kind: "infra", cause: "crash" },
      { kind: "infra", cause: "overflow" },
      { kind: "infra", cause: "timeout" },
    ];
    const harness = new FakeHarness();
    for (const stop of stops) {
      harness.scriptResult({ stop, text: stop.kind, usage: { in: 7, out: 5 } });
    }

    for (const stop of stops) {
      const res = await harness.turn(request());
      expect(res.stop).toEqual(stop);
      expect(res.usage.in).toBe(7);
      expect(res.usage.out).toBe(5);
    }
  });

  it("compacts a session when asked", async () => {
    const harness = new FakeHarness();
    harness.scriptResult({});
    const res = await harness.turn(request());
    const compacted = await harness.compact(res.session!);

    expect(compacted.compacted).toBe(true);
    expect(compacted.id).toBe(res.session!.id);
    expect(harness.compactions).toHaveLength(1);
    expect(harness.knownSessions().get(compacted.id)?.compacted).toBe(true);
  });

  it("fails loudly when a turn was not scripted", async () => {
    const harness = new FakeHarness();
    await expect(harness.turn(request())).rejects.toThrow(
      "FakeHarness: no scripted turn",
    );
  });
});
