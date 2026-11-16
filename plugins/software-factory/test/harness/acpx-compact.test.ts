import { describe, expect, it } from "bun:test";
import path from "node:path";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import {
  runAcpxCommand,
  type AcpxRuntime,
} from "../../src/harness/acpx/turn.js";
import type { Harness } from "../../src/harness/types.js";
import { compactSession } from "../../src/kernel/flow-context.js";
import { sessionCacheHot } from "../../src/kernel/sessions.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { installFakeClock } from "../helpers/fake-clock.js";
import { createAcpxStub, type AcpxStub } from "./acpx-stub.js";

const TIMEOUTS = { idleMs: 10_000, wallMs: 30_000 };

const PI_ACPX: AcpxConfig = {
  agent: "pi",
  compact: true,
  effort: {
    configId: "thought_level",
  },
  usage: { cache: false },
};

const AGY_ACPX: AcpxConfig = {
  agent: "agy acp",
  raw: true,
  args: ["--approve-all"],
  usage: { cache: true },
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

function runtimeFor(stub: AcpxStub, config: AcpxConfig): AcpxRuntime {
  return {
    id: config.agent,
    command: { binary: stub.binary, prefix: [] },
    acpx: config,
  };
}

/** The only kernel fields `compactSession` reads. */
function compactRuntime(harness: Harness): KernelRuntime {
  return {
    harnesses: new Map([[harness.id, harness]]),
  } as unknown as KernelRuntime;
}

async function waitForPrompt(stub: AcpxStub, marker: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (stub.invocations().some((args) => args.at(-1)?.includes(marker))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for acpx prompt containing ${marker}`);
}

describe("AcpxHarness session compaction", () => {
  it("runs /compact as the whole prompt on the named session and parses the summary", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      const command = await runAcpxCommand(
        runtimeFor(stub, PI_ACPX),
        PI_ACPX,
        first.session!,
        "/compact",
      );

      expect(command.summary.errors).toEqual([]);
      expect(command.summary.stopReason).toBe("end_turn");
      expect(command.summary.text).toContain("Compaction completed");

      const invocation = stub
        .invocations()
        .find((args) => args.at(-1) === "/compact")!;
      // No model prompt: no --model and the slash command is the only prompt.
      expect(invocation).not.toContain("--model");
      expect(invocation.slice(invocation.indexOf("-s"))).toEqual([
        "-s",
        first.session!.id,
        "/compact",
      ]);
    } finally {
      stub.cleanup();
    }
  });

  it("returns a compacted ref and the next turn resumes the same session", async () => {
    const stub = createAcpxStub();
    const options = { id: "pi", binary: stub.binary, acpx: PI_ACPX };
    const harness = new AcpxHarness(options);
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));

      expect(await harness.caps({ id: "opencode-go/beam-free" })).toMatchObject(
        { compact: "server" },
      );
      const compacted = await compactSession(
        compactRuntime(harness),
        first.session!,
      );
      expect(compacted?.session.compacted).toBe(true);
      expect(compacted?.session.id).toBe(first.session!.id);
      expect(compacted?.usage).toBeUndefined();

      const second = await new AcpxHarness(options).turn(
        request(cwd, "second [[text:ALPHA]]", {
          session: compacted!.session,
        }),
      );

      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);
      expect(second.session?.compacted).toBe(true);

      const calls = stub.invocations();
      expect(
        calls.filter(
          (args) => args.includes("sessions") && args.includes("new"),
        ),
      ).toHaveLength(1);
      const resumed = calls.filter((args) => args.at(-1)?.startsWith("second"));
      expect(resumed).toHaveLength(1);
      expect(resumed[0]![resumed[0]!.indexOf("-s") + 1]).toBe(
        first.session!.id,
      );
    } finally {
      stub.cleanup();
    }
  });

  it("runs /compact on the raw route's named session after the prompt verb", async () => {
    const stub = createAcpxStub();
    const acpx: AcpxConfig = {
      agent: "opencode acp",
      raw: true,
      compact: true,
      effort: {
        configId: "effort",
      },
      usage: { cache: true },
    };
    const harness = new AcpxHarness({
      id: "opencode",
      binary: stub.binary,
      acpx,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));
      const compacted = await harness.compact(first.session!);

      expect(compacted.session.compacted).toBe(true);
      expect(compacted.session.id).toBe(first.session!.id);

      const invocation = stub
        .invocations()
        .find((args) => args.at(-1) === "/compact")!;
      expect(invocation).not.toContain("--model");
      expect(invocation.slice(invocation.indexOf("prompt"))).toEqual([
        "prompt",
        "-s",
        first.session!.id,
        "/compact",
      ]);
    } finally {
      stub.cleanup();
    }
  });

  it("treats pi's Nothing to compact as a usable session, not a failure", async () => {
    const stub = createAcpxStub({ compact: "nothing" });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));

      const command = await runAcpxCommand(
        runtimeFor(stub, PI_ACPX),
        PI_ACPX,
        first.session!,
        "/compact",
      );
      expect(command.summary.errors).toHaveLength(1);
      expect(command.summary.errors[0]?.code).toBe(-32603);
      expect(command.summary.errors[0]?.data?.details).toContain(
        "Nothing to compact",
      );

      const kept = await compactSession(
        compactRuntime(harness),
        first.session!,
      );
      expect(kept?.session).toEqual(first.session!);

      const second = await harness.turn(
        request(cwd, "second [[text:ALPHA]]", { session: kept!.session }),
      );
      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text).toBe("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);
    } finally {
      stub.cleanup();
    }
  });

  it("contains a failed compaction and keeps the session resumable", async () => {
    const stub = createAcpxStub({ compact: "fail" });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(request(cwd, "first"));

      // The kernel's compaction seam contains the adapter failure...
      expect(
        await compactSession(compactRuntime(harness), first.session!),
      ).toBeUndefined();
      // ...and the original session is still resumable.
      const second = await harness.turn(
        request(cwd, "second [[text:ALPHA]]", { session: first.session }),
      );
      expect(second.stop).toEqual({ kind: "done" });
      expect(second.session?.id).toBe(first.session!.id);
    } finally {
      stub.cleanup();
    }
  });

  it("never sends /compact to an agent without declared support", async () => {
    const stub = createAcpxStub();
    const harness = new AcpxHarness({
      id: "agy",
      binary: stub.binary,
      acpx: AGY_ACPX,
    });
    try {
      const cwd = path.dirname(stub.binary);
      const first = await harness.turn(
        request(cwd, "first", { model: { id: "gemini-3.8-flash" } }),
      );

      expect(await harness.caps({ id: "gemini-3.8-flash" })).toMatchObject({
        compact: "none",
      });
      await expect(harness.compact(first.session!)).rejects.toThrow(
        /not configured for compaction/,
      );
      expect(
        stub.invocations().filter((args) => args.at(-1) === "/compact"),
      ).toEqual([]);
    } finally {
      stub.cleanup();
    }
  });

  it("keeps a long turn's cache hot through its last model event and skips once idle", async () => {
    const stub = createAcpxStub({ promptDelayMs: 100 });
    const harness = new AcpxHarness({
      id: "pi",
      binary: stub.binary,
      acpx: PI_ACPX,
    });
    const clock = installFakeClock(Date.parse("2026-11-16T12:00:00.000Z"));
    try {
      const cwd = path.dirname(stub.binary);
      const turnStartedAt = Date.now();
      const pending = harness.turn(request(cwd, "long turn"));
      await waitForPrompt(stub, "long turn");
      clock.advance(10 * 60_000);
      const first = await pending;

      expect(first.stop).toEqual({ kind: "done" });
      expect(
        Date.parse(first.session!.lastRequestStartedAt) - turnStartedAt,
      ).toBe(10 * 60_000);
      expect(sessionCacheHot(first.session!, new Date())).toBe(true);

      const compacted = await compactSession(
        compactRuntime(harness),
        first.session!,
      );
      expect(compacted?.session.compacted).toBe(true);
      const compacts = () =>
        stub.invocations().filter((args) => args.at(-1) === "/compact");
      expect(compacts()).toHaveLength(1);

      clock.advance(10 * 60_000);
      expect(sessionCacheHot(first.session!, new Date())).toBe(false);
      expect(
        await compactSession(compactRuntime(harness), first.session!),
      ).toBeUndefined();
      expect(compacts()).toHaveLength(1);
    } finally {
      clock.restore();
      stub.cleanup();
    }
  });
});
