import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { Repo } from "../../src/core/git/repo.js";
import { writeLaunchDigest } from "../../src/kernel/digest.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import type { KernelRuntime, ProcessConfig, RepoConfig, RunConfig } from "../../src/kernel/types.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const process: ProcessConfig = {
    flows: {},
    roles: { digest: { prompt: "digest" } },
    itemTurns: 8,
  };
  const repo: RepoConfig = {
    baseBranch: "main",
    artifactRoot: ".factory/artifacts",
    setup: [],
    gates: [],
  };
  const run: RunConfig = {
    aliases: { digest: { harness: "fake", model: "fake-digest" } },
    limits: { concurrency: 1, perHarness: {}, iterations: 1 },
    sessions: { dir: "", keepRuns: 1 },
  };
  return {
    paths: {
      repoRoot: root,
      goalDir: path.join(root, "goal"),
      goalCheckout: root,
      integrationBranch: "factory/g",
      worktreeRoot: root,
      sessionsDir: path.join(root, "sessions"),
    },
    configs: { repo, process, run },
    repo: new Repo({ mainRoot: root, worktreeRoot: root }),
    store: createFolderStore(path.join(root, "goal")),
    harnesses: new Map([["fake", fake]]),
    prompts: loadPrompts(process, root),
    limits: { itemTurns: 8, flows: {}, iterations: 1, concurrency: 1, perHarness: {} },
  };
}

describe("launch digest", () => {
  it("writes the script facts, then a scout adds loops from transcripts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-digest-"));
    const fake = new FakeHarness({ id: "fake" });
    const runtime = runtimeFor(fake, root);
    try {
      await runtime.store.ensureLayout();
      await runtime.store.appendRecord(
        { iteration: 1, step: "architect", round: 1, actor: "agent", alias: "architect", model: { id: "fake-architect" } },
        {
          usage: { in: 100, cacheRead: 40, cacheWrite5m: 0, cacheWrite1h: 0, out: 20, reasoningOut: 5, costUsd: 0.5 },
          transcript: "/sessions/demo/launch-1/architect.jsonl",
        }
      );
      await runtime.store.appendRecord(
        { iteration: 1, slug: "a", step: "implement", round: 1, actor: "agent", alias: "implementer", model: { id: "fake-impl" } },
        { usage: { in: 10, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, out: 5, reasoningOut: 0 } }
      );
      const records = await runtime.store.listRecords();

      fake.script((req, ctx) => {
        expect(req.prompt).toContain(`transcripts: \`${path.join(root, "sessions")}\``);
        fs.appendFileSync(
          path.join(runtime.store.goalDir, "iterations/2/digest.md"),
          "\n## Loops\n- a implement repeated 2 rounds\n",
          "utf8"
        );
        ctx.writeOutcome({ status: "done", summary: "digest complete", concerns: [], forward: [] });
        return fakeTurnResult(req);
      });

      const result = await writeLaunchDigest(runtime, 2, records);
      expect(result).toBe("iterations/2/digest.md");
      const digest = fs.readFileSync(path.join(runtime.store.goalDir, result!), "utf8");
      expect(digest).toContain("| architect | architect | 1 | 100 | 40 | 20 | $0.5000 |");
      expect(digest).toContain("| implementer | implementer | 1 | 10 | 0 | 5 | n/a |");
      expect(digest).toContain("## Transcripts");
      expect(digest).toContain("/sessions/demo/launch-1/architect.jsonl");
      expect(digest).toContain("## Loops");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does nothing when there is no previous launch", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-digest-"));
    const runtime = runtimeFor(new FakeHarness({ id: "fake" }), root);
    try {
      await runtime.store.ensureLayout();
      expect(await writeLaunchDigest(runtime, 1, [])).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});