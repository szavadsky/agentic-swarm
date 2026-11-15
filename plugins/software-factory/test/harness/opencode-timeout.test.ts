import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpencodeHarness } from "../../src/harness/opencode/harness.js";

const FAKE_OPENCODE = `#!/usr/bin/env bun
const args = process.argv.slice(2);
if (args[0] === "session") process.exit(1);
process.stdout.write(JSON.stringify({ type: "step_start", sessionID: "ses_fake", part: {} }) + "\\n");
process.stdout.write(JSON.stringify({
  type: "step_finish",
  sessionID: "ses_fake",
  part: { reason: "stop", cost: 0, tokens: { input: 7, output: 3, reasoning: 1, cache: { read: 2, write: 0 } } },
}) + "\\n");
setInterval(() => {}, 1000);
`;

function fakeHarness(): { harness: OpencodeHarness; cleanup: () => void } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-fake-"));
  const binary = path.join(tmp, "fake-opencode.js");
  fs.writeFileSync(binary, FAKE_OPENCODE, { mode: 0o755 });
  const harness = new OpencodeHarness({
    binary,
    sessionDir: path.join(tmp, "sessions"),
  });
  return {
    harness,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

describe("OpencodeHarness fake process", () => {
  it("idle timeout kills the run and returns partial usage", async () => {
    const { harness, cleanup } = fakeHarness();
    try {
      const result = await harness.turn({
        model: { id: "opencode/longcat-2.5-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 150, wallMs: 10_000 },
      });
      expect(result.stop).toEqual({ kind: "infra", cause: "timeout" });
      expect(result.usage).toEqual({
        in: 7,
        cacheRead: 2,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        out: 3,
        reasoningOut: 1,
        costUsd: 0,
      });
      expect(result.session?.id).toBe("ses_fake");
      expect(result.attempts).toHaveLength(1);
    } finally {
      cleanup();
    }
  }, 20_000);

  it("wall timeout works when idle detection is disabled", async () => {
    const { harness, cleanup } = fakeHarness();
    try {
      const result = await harness.turn({
        model: { id: "opencode/longcat-2.5-free" },
        cwd: os.tmpdir(),
        prompt: "hang",
        timeouts: { idleMs: 0, wallMs: 150 },
      });
      expect(result.stop).toEqual({ kind: "infra", cause: "timeout" });
      expect(result.usage.in).toBe(7);
    } finally {
      cleanup();
    }
  }, 20_000);
});
