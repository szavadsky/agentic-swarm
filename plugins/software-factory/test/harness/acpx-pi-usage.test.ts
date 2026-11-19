import { describe, expect, it } from "bun:test";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { createAcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };
const PER_PROMPT = {
  input: 100,
  output: 10,
  cacheRead: 5,
  cacheWrite: 2,
};
const PI_ACPX: AcpxConfig = {
  agent: "pi",
  effort: { configId: "thought_level" },
  usage: { cache: true, command: "/session" },
};

function request(
  cwd: string,
  prompt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    model: { id: "opencode-go/beam-free" },
    cwd,
    prompt,
    timeouts: TIMEOUTS,
    ...extra,
  };
}

describe("AcpxHarness pi usage command", () => {
  it("records /session totals and deltas a resumed turn against the ref", async () => {
    const stub = createAcpxStub({ sessionUsage: PER_PROMPT });
    const options = {
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    };
    try {
      const cwd = path.dirname(stub.binary);
      const first = await new AcpxHarness(options).turn(
        request(cwd, "first [[text:ONE]]"),
      );

      expect(first.stop).toEqual({ kind: "done" });
      expect(first.text).toBe("ONE");
      // pi's prompt result carries no usage; these are the /session totals.
      expect(first.usage).toEqual({
        in: 100,
        cacheRead: 5,
        cacheWrite5m: 2,
        cacheWrite1h: 0,
        out: 10,
        reasoningOut: 0,
      });
      expect(first.session?.cumulativeUsage).toEqual(first.usage);

      const second = await new AcpxHarness(options).turn(
        request(cwd, "second [[text:TWO]]", { session: first.session }),
      );

      // The second /session reply is cumulative (200/20, cache 10/4); the
      // turn records only what the resumed prompt added.
      expect(second.stop).toEqual({ kind: "done" });
      expect(second.usage).toEqual({
        in: 100,
        cacheRead: 5,
        cacheWrite5m: 2,
        cacheWrite1h: 0,
        out: 10,
        reasoningOut: 0,
      });
      expect(second.session?.cumulativeUsage).toEqual({
        in: 200,
        cacheRead: 10,
        cacheWrite5m: 4,
        cacheWrite1h: 0,
        out: 20,
        reasoningOut: 0,
      });

      const calls = stub.invocations();
      const commands = calls.filter((args) => args.at(-1) === "/session");
      expect(commands).toHaveLength(2);
      for (const [index, args] of commands.entries()) {
        // The usage command is the whole prompt: no model turn and no --model.
        expect(args).not.toContain("--model");
        expect(args.slice(args.indexOf("-s"))).toEqual([
          "-s",
          index === 0 ? first.session!.id : second.session!.id,
          "/session",
        ]);
      }
      // The model saw exactly the two turn prompts, never /session.
      expect(
        calls.filter((args) => args.at(-1)?.includes("[[text:")),
      ).toHaveLength(2);
    } finally {
      stub.cleanup();
    }
  });

  it("keeps the stop and records no totals when /session fails", async () => {
    const stub = createAcpxStub({
      sessionUsage: PER_PROMPT,
      sessionCommand: "fail",
    });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const result = await harness.turn(request(cwd, "first [[text:ONE]]"));

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("ONE");
      // No fabricated counts and no baseline to delta from next time.
      expect(result.usage).toEqual({
        in: 0,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 0,
        reasoningOut: 0,
      });
      expect(result.session?.cumulativeUsage).toBeUndefined();
      expect(
        stub.invocations().some((args) => args.at(-1) === "/session"),
      ).toBe(true);

      // A later failed read must carry the ref's existing baseline forward,
      // or the next successful delta would lose its starting point.
      const prior = {
        in: 50,
        cacheRead: 1,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 5,
        reasoningOut: 0,
      };
      const resumed = await harness.turn(
        request(cwd, "second [[text:TWO]]", {
          session: { ...result.session!, cumulativeUsage: prior },
        }),
      );
      expect(resumed.stop).toEqual({ kind: "done" });
      expect(resumed.session?.cumulativeUsage).toEqual(prior);
    } finally {
      stub.cleanup();
    }
  });

  it("refreshes the baseline after compaction so its tokens stay off the next turn", async () => {
    const stub = createAcpxStub({
      sessionUsage: PER_PROMPT,
      compactUsage: { input: 30, output: 3, cacheRead: 1 },
    });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: { ...PI_ACPX, compact: true },
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first [[text:ONE]]"));
      const compacted = await harness.compact(first.session!);

      // The compaction's own tokens are read through the same usage command and
      // reported once; its cumulative total becomes the next turn's baseline.
      expect(compacted.usage).toEqual({
        in: 30,
        cacheRead: 1,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 3,
        reasoningOut: 0,
      });
      expect(compacted.session.cumulativeUsage).toEqual({
        in: 130,
        cacheRead: 6,
        cacheWrite5m: 2,
        cacheWrite1h: 0,
        out: 13,
        reasoningOut: 0,
      });

      const second = await harness.turn(
        request(cwd, "second [[text:TWO]]", {
          session: compacted.session,
        }),
      );
      // Only the resumed prompt's increment, not the compaction's 30/3.
      expect(second.usage).toEqual({
        in: 100,
        cacheRead: 5,
        cacheWrite5m: 2,
        cacheWrite1h: 0,
        out: 10,
        reasoningOut: 0,
      });
    } finally {
      stub.cleanup();
    }
  });

  it("leaves a resumed turn unknown when the ref has no baseline, then recovers", async () => {
    const stub = createAcpxStub({ sessionUsage: PER_PROMPT });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      sessionDir: path.dirname(stub.binary),
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first [[text:ONE]]"));
      const withoutBaseline = { ...first.session! };
      delete withoutBaseline.cumulativeUsage;

      const resumed = await harness.turn(
        request(cwd, "second [[text:TWO]]", { session: withoutBaseline }),
      );

      // The cumulative reply is 200/20 after two prompts, but without a prior
      // baseline this turn cannot claim any of it: its own usage stays unknown.
      expect(resumed.stop).toEqual({ kind: "done" });
      expect(resumed.usage).toEqual({
        in: 0,
        cacheRead: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 0,
        reasoningOut: 0,
      });
      expect(resumed.session?.cumulativeUsage).toEqual({
        in: 200,
        cacheRead: 10,
        cacheWrite5m: 4,
        cacheWrite1h: 0,
        out: 20,
        reasoningOut: 0,
      });

      const third = await harness.turn(
        request(cwd, "third [[text:THREE]]", { session: resumed.session }),
      );
      expect(third.usage).toEqual({
        in: 100,
        cacheRead: 5,
        cacheWrite5m: 2,
        cacheWrite1h: 0,
        out: 10,
        reasoningOut: 0,
      });
      expect(third.session?.cumulativeUsage).toEqual({
        in: 300,
        cacheRead: 15,
        cacheWrite5m: 6,
        cacheWrite1h: 0,
        out: 30,
        reasoningOut: 0,
      });
    } finally {
      stub.cleanup();
    }
  });
});
