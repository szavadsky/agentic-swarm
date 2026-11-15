import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpencodeHarness } from "../../../src/harness/opencode/harness.js";

const live = process.env.FACTORY_LIVE === "1" ? describe : describe.skip;
const MODEL = { id: "opencode/longcat-2.5-free" };
// Same zero-cost tier, second provider route: free-limit 429s are intermittent (LOG D8).
const FALLBACK = { id: "opencode/beam-free" };
const TIMEOUTS = { idleMs: 180_000, wallMs: 300_000 };

live("opencode harness live smoke", () => {
  it("two-turn resume, outcome outside cwd, exported transcript, compact", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oc-live-"));
    const cwd = path.join(root, "work");
    const outbox = path.join(root, "outbox");
    fs.mkdirSync(cwd);
    fs.mkdirSync(outbox);
    const outcomePath = path.join(outbox, "outcome.txt");
    const harness = new OpencodeHarness({
      sessionDir: path.join(root, "sessions"),
      retry: { retries: 2, baseDelayMs: 5_000, maxDelayMs: 15_000 },
    });

    const started = Date.now();
    try {
      const caps = await harness.caps(MODEL);
      expect(Array.isArray(caps.effort)).toBe(true);
      expect(caps.compact).toBe("server");
      expect(caps.usage).toEqual({ cache: true, cost: true });

      const first = await harness.turn({
        model: MODEL,
        fallbacks: [FALLBACK],
        cwd,
        prompt: `Remember the secret word ALPHA. Write the exact text DONE into the file ${outcomePath} and reply with exactly: ONE`,
        timeouts: TIMEOUTS,
      });
      expect(first.stop).toEqual({ kind: "done" });
      expect(first.text.trim()).toContain("ONE");
      expect(fs.readFileSync(outcomePath, "utf8").trim()).toBe("DONE");
      expect(first.session?.id).toBeTruthy();
      expect(first.usage.in).toBeGreaterThan(0);
      expect(first.transcript && fs.existsSync(first.transcript)).toBe(true);
      const exported = JSON.parse(fs.readFileSync(first.transcript!, "utf8"));
      expect(exported.info.id).toBe(first.session!.id);

      const second = await harness.turn({
        model: MODEL,
        fallbacks: [FALLBACK],
        cwd,
        prompt: "What was the secret word? Reply with the word only.",
        session: first.session,
        timeouts: TIMEOUTS,
      });
      expect(second.stop).toEqual({ kind: "done" });
      expect(second.text.trim()).toContain("ALPHA");
      expect(second.session?.id).toBe(first.session!.id);

      const compacted = await harness.compact(second.session!);
      expect(compacted.session.compacted).toBe(true);
      console.log(
        "opencode live",
        JSON.stringify({
          wallMs: Date.now() - started,
          caps: caps.effort,
          turn1: {
            model: first.model,
            usage: first.usage,
            attempts: first.attempts?.length,
          },
          turn2: { model: second.model, usage: second.usage },
          transcript: first.transcript,
        }),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 600_000);
});
