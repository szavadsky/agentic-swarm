import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpencodeHarness } from "../../src/harness/opencode/harness.js";
import type { SessionRef } from "../../src/harness/types.js";

type Probe = "missing" | "unavailable";

/** Session probe answer; the run itself succeeds de novo unless `failRun` is set. */
function fakeScript(probe: Probe, logPath: string, failRun: boolean): string {
  return `#!/usr/bin/env bun
const fs = require("node:fs");
const args = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
fs.appendFileSync(logPath, JSON.stringify(args) + "\\n");
if (args[0] === "api" && args[1] === "GET") {
  if (${JSON.stringify(probe)} === "missing") {
    process.stderr.write("Error: session ses_old not found (404)\\n");
  } else {
    process.stderr.write("session api unavailable\\n");
  }
  process.exit(1);
}
if (args[0] === "session" && args[1] === "export") process.exit(1);
if (${failRun}) {
  process.stderr.write("provider exploded\\n");
  process.exit(1);
}
const at = args.indexOf("-s");
const sessionId = at >= 0 ? args[at + 1] : "ses_new";
const write = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
write({ type: "step_start", sessionID: sessionId, part: {} });
write({ type: "text", sessionID: sessionId, part: { messageID: "m1", text: "PONG" } });
write({
  type: "step_finish",
  sessionID: sessionId,
  part: { reason: "stop", cost: 0, tokens: { input: 7, output: 3, reasoning: 1, cache: { read: 2, write: 0 } } },
});
`;
}

function fakeHarness(probe: Probe, failRun = false): {
  harness: OpencodeHarness;
  cwd: string;
  invocations: () => string[][];
  cleanup: () => void;
} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-resume-"));
  const logPath = path.join(tmp, "invocations.ndjson");
  const binary = path.join(tmp, "fake-opencode.js");
  fs.writeFileSync(binary, fakeScript(probe, logPath, failRun), { mode: 0o755 });
  const harness = new OpencodeHarness({
    binary,
    sessionDir: path.join(tmp, "sessions"),
  });
  return {
    harness,
    cwd: tmp,
    invocations: () =>
      fs
        .readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

const MODEL = { id: "opencode-go/deepseek-v4.1-flash" };
const TIMEOUTS = { idleMs: 5_000, wallMs: 10_000 };

function sessionRef(cwd: string): SessionRef {
  return {
    harness: "opencode",
    id: "ses_old",
    cwd,
    model: MODEL,
    lastRequestStartedAt: "2026-11-13T00:00:00.000Z",
    retentionTier: "short",
    compacted: false,
  };
}

describe("OpencodeHarness resume fallback", () => {
  it("records a lost resume and starts de novo with the same task input", async () => {
    const { harness, cwd, invocations, cleanup } = fakeHarness("missing");
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "second",
        session: sessionRef(cwd),
        timeouts: TIMEOUTS,
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.text).toBe("PONG");
      expect(result.session?.id).toBe("ses_new");
      // The failed resume is an error record, then the fresh call.
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts?.[0]).toEqual({
        model: MODEL,
        stop: {
          kind: "infra",
          cause: "crash",
          details: expect.stringMatching(/session ses_old not found/),
        },
        usage: expect.objectContaining({ in: 0, out: 0 }),
      });
      expect(result.attempts?.[1]?.stop).toEqual({ kind: "done" });

      const calls = invocations();
      expect(calls[0]).toEqual(["api", "GET", "/api/session/ses_old"]);
      const run = calls[1]!;
      expect(run).not.toContain("-s");
      expect(run.at(-1)).toBe("second");
    } finally {
      cleanup();
    }
  }, 20_000);

  it("keeps the session when the probe fails for a reason other than a missing record", async () => {
    const { harness, cwd, invocations, cleanup } = fakeHarness("unavailable");
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "second",
        session: sessionRef(cwd),
        timeouts: TIMEOUTS,
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.session?.id).toBe("ses_old");
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts?.[0]?.stop).toEqual({ kind: "done" });

      const run = invocations()[1]!;
      expect(run[run.indexOf("-s") + 1]).toBe("ses_old");
      expect(run.at(-1)).toBe("second");
    } finally {
      cleanup();
    }
  }, 20_000);

  it("does not hand the dead ref back when the de-novo start also fails", async () => {
    const { harness, cwd, cleanup } = fakeHarness("missing", true);
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "second",
        session: sessionRef(cwd),
        timeouts: TIMEOUTS,
      });

      expect(result.stop).toMatchObject({
        kind: "infra",
        cause: "crash",
        details: "provider exploded",
      });
      expect(result.session).toBeUndefined();
      expect(result.attempts?.map((attempt) => attempt.stop.kind)).toEqual([
        "infra",
        "infra",
      ]);
    } finally {
      cleanup();
    }
  }, 20_000);

  it("does not probe when the turn has no session to resume", async () => {
    const { harness, cwd, invocations, cleanup } = fakeHarness("missing");
    try {
      const result = await harness.turn({
        model: MODEL,
        cwd,
        prompt: "first",
        timeouts: TIMEOUTS,
      });

      expect(result.stop).toEqual({ kind: "done" });
      expect(result.session?.id).toBe("ses_new");
      expect(result.attempts).toHaveLength(1);
      // Only the run and its export: no session probe without a session.
      const calls = invocations();
      expect(calls).toHaveLength(2);
      expect(calls[0]![0]).toBe("run");
      expect(calls.some((args) => args[0] === "api")).toBe(false);
    } finally {
      cleanup();
    }
  }, 20_000);
});
