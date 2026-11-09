import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { runInit } from "../../src/cli/init.js";
import { runStatus } from "../../src/cli/status.js";
import { writeQuestion } from "../../src/core/steer.js";
import { writeYamlAtomic } from "../../src/core/records/io.js";

/**
 * `factory status` §18 surfacing: concern counts plus a split between blocking
 * operator questions (need a decision) and digest-only remarkable items
 * (recorded for awareness, never waiting).
 */
const PLUGIN_ROOT = path.resolve(import.meta.dir, "../..");
const ORCH = ".factory/tasks";

async function captureOutput(
  fn: () => Promise<number>
): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const code = await fn();
    return { code, output: lines.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("factory status concern surfacing (§18)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  async function initTask(task: string): Promise<string> {
    await runInit({ repoRoot: tmpRepo.dir, pluginRoot: PLUGIN_ROOT, silent: true });
    const taskDir = path.join(tmpRepo.dir, ORCH, task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
    return taskDir;
  }

  function writeConcern(taskDir: string, id: string, status: string): void {
    const concernDir = path.join(taskDir, "concerns");
    fs.mkdirSync(concernDir, { recursive: true });
    writeYamlAtomic(path.join(concernDir, `${id}.yaml`), {
      id,
      kind: "risk",
      summary: `Concern ${id}`,
      detail: "concern detail",
      severity: "medium",
      status,
      source: { record: "001-develop-a1", agent: "developer", item: "item-1" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }

  it("prints concern counts and separates blocking from digest questions", async () => {
    const task = "status-concerns";
    const taskDir = await initTask(task);

    writeConcern(taskDir, "c-open-1", "open");
    writeConcern(taskDir, "c-open-2", "open");
    writeConcern(taskDir, "c-dismissed", "dismissed");
    writeConcern(taskDir, "c-routed", "routed");
    writeConcern(taskDir, "c-resolved", "resolved");

    await writeQuestion(tmpRepo.dir, taskDir, {
      id: "q-stop",
      ref: "item-1",
      disposition: "human-stop",
      question: "Stop before writing anything else",
      blocks: ["item-1", "task"],
    });
    await writeQuestion(tmpRepo.dir, taskDir, {
      id: "q-awareness",
      ref: "item-1",
      disposition: "human-awareness",
      question: "Notable tradeoff recorded for the operator",
      blocks: [],
    });
    await writeQuestion(tmpRepo.dir, taskDir, {
      id: "q-empty-blocks",
      ref: "item-1",
      disposition: "human-async",
      question: "Optional note with no blocking impact",
      blocks: [],
    });

    const { code, output } = await captureOutput(() =>
      runStatus({ repoRoot: tmpRepo.dir, task })
    );

    expect(code).toBe(0);
    expect(output).toMatch(
      /Concerns?[^\n]*open[^\n]*2[^\n]*dismissed[^\n]*1[^\n]*routed[^\n]*1[^\n]*resolved[^\n]*1/i
    );

    const blockingAt = output.search(/\bBlocking\b/i);
    const digestAt = output.search(/\bDigest\b/i);
    expect(blockingAt).toBeGreaterThanOrEqual(0);
    expect(digestAt).toBeGreaterThan(blockingAt);

    const blockingSection = output.slice(blockingAt, digestAt);
    const digestSection = output.slice(digestAt);
    expect(blockingSection).toContain("q-stop");
    expect(blockingSection).not.toContain("q-awareness");
    expect(blockingSection).not.toContain("q-empty-blocks");
    expect(digestSection).toContain("q-awareness");
    expect(digestSection).toContain("q-empty-blocks");
    expect(digestSection).not.toContain("q-stop");
  });

  it("prints zero counts when the task has no concerns yet", async () => {
    const task = "status-no-concerns";
    await initTask(task);

    const { code, output } = await captureOutput(() =>
      runStatus({ repoRoot: tmpRepo.dir, task })
    );

    expect(code).toBe(0);
    expect(output).toMatch(
      /Concerns?[^\n]*open[^\n]*0[^\n]*dismissed[^\n]*0[^\n]*routed[^\n]*0[^\n]*resolved[^\n]*0/i
    );
  });
});
