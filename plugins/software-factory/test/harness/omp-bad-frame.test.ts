import { describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../src/harness/omp/harness.js";

const FAKE_OMP = `#!/usr/bin/env bun
const readline = require("node:readline");
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\\n");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  if (frame.type === "prompt") {
    const bad = frame.message === "no-type"
      ? '{"hello":"world"}'
      : '{"type":"message_end","message":';
    process.stdout.write(bad + "\\n");
    return;
  }
  if (frame.type === "abort") process.exit(0);
  process.stdout.write(JSON.stringify({
    id: frame.id, type: "response", command: frame.type, success: true,
    data: { tokens: { input: 0, output: 0 }, cost: 0 },
  }) + "\\n");
});
rl.on("close", () => process.exit(0));
setInterval(() => {}, 1000);
`;

/** One turn against a fake that answers the baseline stats and then emits a bad line. */
async function badFrameTurn(prompt: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omp-bad-frame-"));
  const binary = path.join(tmp, "fake-omp.js");
  fs.writeFileSync(binary, FAKE_OMP, { mode: 0o755 });
  const harness = new OmpHarness({
    retention: "short",
    binary,
    sessionDir: path.join(tmp, "sessions"),
    readyTimeoutMs: 5_000,
  });
  const logged: string[] = [];
  const spy = spyOn(console, "error").mockImplementation(
    (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    },
  );
  // A turn that waits for its idle bound instead of the fault is aborted here,
  // so a regression reports the wrong stop instead of hanging the suite.
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), 5_000);
  try {
    const result = await harness.turn({
      model: { id: "fake-host/test" },
      cwd: os.tmpdir(),
      prompt,
      timeouts: { idleMs: 60_000, wallMs: 60_000 },
      signal: controller.signal,
    });
    return { result, logged };
  } finally {
    clearTimeout(abort);
    spy.mockRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe("omp malformed RPC lines", () => {
  it("logs a truncated frame and ends the turn as a protocol fault", async () => {
    const { result, logged } = await badFrameTurn("truncated");
    expect(result.stop).toEqual({
      kind: "infra",
      cause: "protocol",
      details: expect.stringContaining("message_end"),
    });
    expect(result.attempts).toHaveLength(1);
    expect(
      logged.some(
        (line) =>
          line.includes("protocol fault") && line.includes("message_end"),
      ),
    ).toBe(true);
  }, 20_000);

  it("rejects a JSON line that is not an RPC frame", async () => {
    const { result, logged } = await badFrameTurn("no-type");
    expect(result.stop).toEqual({
      kind: "infra",
      cause: "protocol",
      details: expect.stringContaining("frame has no type"),
    });
    expect(logged.some((line) => line.includes("frame has no type"))).toBe(
      true,
    );
  }, 20_000);
});
