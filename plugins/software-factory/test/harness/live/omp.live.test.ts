import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OmpHarness } from "../../../src/harness/omp/harness.js";

const live = process.env.FACTORY_LIVE === "1" ? describe : describe.skip;
const PARENT = { id: "opencode-go/beam-free" };
const SUBAGENT = "opencode-go/longcat-2.5-free";
const TIMEOUTS = { idleMs: 120_000, wallMs: 240_000 };

function jsonlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsonlFiles(full));
    else if (entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

live("omp harness live smoke", () => {
  it("two-turn resume, outcome outside cwd, compact, pinned subagent", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-live-"));
    const cwd = path.join(root, "work");
    const outbox = path.join(root, "outbox");
    fs.mkdirSync(cwd);
    fs.mkdirSync(outbox);
    const outcomePath = path.join(outbox, "outcome.txt");
    const harness = new OmpHarness({
      sessionDir: path.join(root, "sessions"),
      subagentModel: SUBAGENT,
      options: {
        compaction: {
          experimentalContextManagement: false,
          keepRecentTokens: 1,
          reserveTokens: 1,
          methodOrder: ["soft"],
        },
      },
    });

    const started = Date.now();
    try {
      const caps = await harness.caps(PARENT);
      expect(caps.effort).toContain("low");
      expect(caps.compact).toBe("server");
      expect(caps.usage).toEqual({ cache: true, cost: true });

      const first = await harness.turn({
        model: PARENT,
        cwd,
        prompt: `Remember the secret word ALPHA. Write the exact text DONE into the file ${outcomePath} and reply with exactly: ONE`,
        timeouts: TIMEOUTS,
      });
      expect(first.stop).toEqual({ kind: "done" });
      expect(first.text.trim()).toContain("ONE");
      expect(fs.readFileSync(outcomePath, "utf8").trim()).toBe("DONE");
      expect(first.session?.id).toBeTruthy();
      expect(first.model.id).toBe(PARENT.id);
      expect(first.usage.in).toBeGreaterThan(0);
      expect(first.transcript && fs.existsSync(first.transcript)).toBe(true);

      const second = await harness.turn({
        model: PARENT,
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

      const spawned = await harness.turn({
        model: PARENT,
        cwd,
        prompt:
          'Use the task tool to spawn one subagent with agent "scout" and this task: "Reply with exactly SUBAGENT_OK and nothing else." Then reply with the subagent\'s exact answer. Do not use bash.',
        session: second.session,
        timeouts: TIMEOUTS,
      });
      expect(spawned.stop).toEqual({ kind: "done" });
      expect(spawned.text).toContain("SUBAGENT_OK");

      const sessionsDir = path.join(root, "sessions", "omp", "sessions");
      const changes = jsonlFiles(sessionsDir)
        .flatMap((file) =>
          fs
            .readFileSync(file, "utf8")
            .split("\n")
            .filter((line) => line.includes('"type":"model_change"'))
            .map((line) => JSON.parse(line)),
        )
        .filter((entry) => String(entry.role ?? "").startsWith("subagent:"));
      expect(changes.length).toBeGreaterThan(0);
      expect(
        changes.some((entry) =>
          String(entry.model).includes("longcat-2.5-free"),
        ),
      ).toBe(true);
      console.log(
        "omp live",
        JSON.stringify({
          wallMs: Date.now() - started,
          caps: caps.effort,
          turn1: {
            model: first.model,
            usage: first.usage,
            transcript: first.transcript,
          },
          turn2: { model: second.model, usage: second.usage },
          subagentTurn: {
            usage: spawned.usage,
            childModels: changes.map((c) => c.model),
          },
        }),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 600_000);
});
