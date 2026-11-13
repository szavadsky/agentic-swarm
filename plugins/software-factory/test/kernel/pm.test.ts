import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { Repo } from "../../src/core/git/repo.js";
import { derive } from "../../src/kernel/derive.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { PmValidationError, runPm } from "../../src/kernel/pm.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { parseTaskFile } from "../../src/kernel/tasks.js";
import { cleanup, launch, makeGoal, outcome, simpleTask, writePlan } from "./e2e-helpers.js";
import type { KernelRuntime, ProcessConfig, RepoConfig, RunConfig } from "../../src/kernel/types.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const process: ProcessConfig = {
    flows: {},
    roles: { pm: { prompt: "pm" } },
    itemTurns: 8,
  };
  const repo: RepoConfig = {
    baseBranch: "main",
    artifactRoot: ".factory/artifacts",
    setup: [],
    gates: [],
  };
  const run: RunConfig = {
    aliases: { pm: { harness: "fake", model: "fake-pm" } },
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

async function setup(): Promise<{ root: string; runtime: KernelRuntime; fake: FakeHarness; planPath: string }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pm-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(planPath, "# Plan\n\n## alpha\nCreate alpha.\n", "utf8");
  return { root, runtime, fake, planPath };
}

describe("PM turn reconciliation", () => {
  it("ends the iteration after a second validation failure", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fake.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "b.md"),
          simpleTask("b", "b.txt", { deps: ["missing"] }),
          "utf8"
        );
        ctx.writeOutcome({ status: "done", summary: "filed b", concerns: [], forward: [] });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "c.md"),
          simpleTask("c", "c.txt", { deps: ["c"] }),
          "utf8"
        );
        ctx.writeOutcome({ status: "done", summary: "filed c", concerns: [], forward: [] });
        return fakeTurnResult(req);
      });

      await expect(
        runPm(runtime, { iteration: 1, state: derive([], []), planPath, cwd: root })
      ).rejects.toThrow(PmValidationError);
      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[1]!.prompt).toContain('depends on missing task "missing"');
      const records = await runtime.store.listRecords();
      expect(records.some((r) => r.step === "pm-validate" && r.ok === false)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores a merged task the PM touched and reports it", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const alpha = simpleTask("alpha", "alpha.txt");
      await runtime.store.writeTask(parseTaskFile(alpha, "alpha"));
      const alphaOnDisk = fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8");
      await runtime.store.appendRecord(
        { iteration: 1, slug: "alpha", step: "merge", round: 1, actor: "script" },
        { ok: true }
      );
      const state = derive(await runtime.store.listTasks(), await runtime.store.listRecords());
      expect(state.tasks.alpha!.status).toBe("merged");

      fake.script((req, ctx) => {
        fs.appendFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "\nPM edit.\n", "utf8");
        ctx.writeOutcome({ status: "done", summary: "filed", concerns: [], forward: [] });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain('frozen task "alpha" was edited; restored');
        expect(fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8")).toBe(alphaOnDisk);
        ctx.writeOutcome({ status: "done", summary: "acknowledged", concerns: [], forward: [] });
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, { iteration: 1, state, planPath, cwd: root });
      expect(result?.status).toBe("done");
      expect(fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8")).toBe(alphaOnDisk);
      const records = await runtime.store.listRecords();
      const reconcile = records.find((r) => r.step === "pm-reconcile");
      expect(reconcile?.ok).toBe(false);
      expect(reconcile?.cause).toContain("frozen task");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores a plan the PM edited and rejects the turn", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const plan = fs.readFileSync(planPath, "utf8");
      fake.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## smuggled\nPM-authored direction.\n", "utf8");
        ctx.writeOutcome({ status: "done", summary: "edited the plan", concerns: [], forward: [] });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain("plan.md changed during the PM turn; restored");
        expect(fs.readFileSync(planPath, "utf8")).toBe(plan);
        ctx.writeOutcome({ status: "done", summary: "acknowledged", concerns: [], forward: [] });
        return fakeTurnResult(req);
      });

      await runPm(runtime, { iteration: 1, state: derive([], []), planPath, cwd: root });
      expect(fs.readFileSync(planPath, "utf8")).toBe(plan);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ends the iteration blocked when the PM fails validation twice", async () => {
    const goal = makeGoal();
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(goal.tasksDir, "b.md"),
          simpleTask("b", "b.txt", { deps: ["ghost"] }),
          "utf8"
        );
        ctx.writeOutcome(outcome({ summary: "filed an invalid task" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain('depends on missing task "ghost"');
        fs.writeFileSync(path.join(goal.tasksDir, "c.md"), simpleTask("c", "c.txt", { deps: ["c"] }), "utf8");
        ctx.writeOutcome(outcome({ summary: "filed another invalid task" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness)).toBe(3);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("PM validation failed twice");
      const records = await createFolderStore(goal.goalDir).listRecords();
      expect(records.filter((r) => r.step === "architect")).toHaveLength(1);
      expect(records.some((r) => r.step === "pm-validate" && r.ok === false)).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});