import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { Repo } from "../../src/core/git/repo.js";
import { derive } from "../../src/kernel/derive.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { runPm } from "../../src/kernel/pm.js";
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

/** `chain` names the aliases after `pm`; each gets `fake-<name>` as its model. */
async function ladderSetup(chain: string[]) {
  const base = await setup();
  let from = "pm";
  for (const alias of chain) {
    base.runtime.configs.run.aliases[alias] = { harness: "fake", model: `fake-${alias}` };
    base.runtime.configs.run.aliases[from]!.escalateTo = alias;
    from = alias;
  }
  return base;
}

function writeInvalidTask(runtime: KernelRuntime): void {
  fs.writeFileSync(
    path.join(runtime.store.tasksDir, "b.md"),
    simpleTask("b", "b.txt", { deps: ["missing"] }),
    "utf8"
  );
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

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("exhausted");
      expect(result.rungs).toHaveLength(2);
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
      expect(result.status).toBe("done");
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
      expect(summary).toContain("PM ladder exhausted");
      const records = await createFolderStore(goal.goalDir).listRecords();
      expect(records.filter((r) => r.step === "architect")).toHaveLength(1);
      expect(records.some((r) => r.step === "pm-validate" && r.ok === false)).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("retries once de novo on the same alias with the findings and the restated contract", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        writeInvalidTask(runtime);
        ctx.writeOutcome(outcome({ summary: "filed an invalid task" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        expect(req.prompt).toContain('depends on missing task "missing"');
        expect(req.prompt).toContain("Restated PM contract");
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "alpha.md"),
          simpleTask("alpha", "alpha.txt"),
          "utf8"
        );
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, { iteration: 1, state: derive([], []), planPath, cwd: root });
      expect(result.status).toBe("done");
      expect(result.rungs).toHaveLength(1);
      expect(result.rungs[0]).toMatchObject({ round: 1, alias: "pm", model: "fake-pm" });
      expect(result.rungs[0]!.failure).toContain('depends on missing task "missing"');

      const pm = (await runtime.store.listRecords()).filter((record) => record.step === "pm");
      expect(pm.map((record) => [record.round, record.alias])).toEqual([
        [1, "pm"],
        [2, "pm"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("climbs from base-tier failed and blocked answers with their reasons as findings", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup(["escalation"]);
    try {
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        ctx.writeOutcome(outcome({ status: "failed", summary: "plan underivable" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        expect(req.prompt).toContain("status failed: plan underivable");
        expect(req.prompt).toContain("Restated PM contract");
        ctx.writeOutcome(outcome({ status: "blocked", summary: "Which task owns the API?" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        expect(req.model.id).toBe("fake-escalation");
        expect(req.prompt).toContain("broader mandate");
        expect(req.prompt).toContain("status blocked: Which task owns the API?");
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "alpha.md"),
          simpleTask("alpha", "alpha.txt"),
          "utf8"
        );
        ctx.writeOutcome(outcome({ summary: "filed alpha after the base tier failed" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, { iteration: 1, state: derive([], []), planPath, cwd: root });
      expect(result.status).toBe("done");
      expect(fake.calls).toHaveLength(3);
      expect(result.rungs.map((rung) => [rung.round, rung.alias])).toEqual([
        [1, "pm"],
        [2, "pm"],
      ]);
      expect(result.rungs[0]!.failure).toContain("status failed: plan underivable");
      expect(result.rungs[1]!.failure).toContain("status blocked: Which task owns the API?");

      const pm = (await runtime.store.listRecords()).filter((record) => record.step === "pm");
      expect(pm.map((record) => [record.round, record.alias])).toEqual([
        [1, "pm"],
        [2, "pm"],
        [3, "escalation"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("climbs to the escalateTo alias with a broader mandate after two failures", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup(["escalation"]);
    try {
      fake.script((req, ctx) => {
        writeInvalidTask(runtime);
        ctx.writeOutcome(outcome({ summary: "first failure" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        writeInvalidTask(runtime);
        ctx.writeOutcome(outcome({ summary: "second failure" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        expect(req.model.id).toBe("fake-escalation");
        expect(req.prompt).toContain("broader mandate");
        expect(req.prompt).toContain("Restated PM contract");
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "alpha.md"),
          simpleTask("alpha", "alpha.txt"),
          "utf8"
        );
        ctx.writeOutcome(outcome({ summary: "filed alpha on the escalation tier" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, { iteration: 1, state: derive([], []), planPath, cwd: root });
      expect(result.status).toBe("done");
      expect(fake.calls[2]!.model.id).toBe("fake-escalation");

      const pm = (await runtime.store.listRecords()).filter((record) => record.step === "pm");
      expect(pm.map((record) => [record.round, record.alias, record.model?.id])).toEqual([
        [1, "pm", "fake-pm"],
        [2, "pm", "fake-pm"],
        [3, "escalation", "fake-escalation"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stops on an escalated blocked answer and runs no further rung", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup(["escalation", "deeper"]);
    try {
      for (const summary of ["first failure", "second failure"]) {
        fake.script((req, ctx) => {
          writeInvalidTask(runtime);
          ctx.writeOutcome(outcome({ summary }));
          return fakeTurnResult(req);
        });
      }
      fake.script((req, ctx) => {
        expect(req.model.id).toBe("fake-escalation");
        ctx.writeOutcome(outcome({ status: "blocked", summary: "Which task owns the API?" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, { iteration: 1, state: derive([], []), planPath, cwd: root });
      expect(result.status).toBe("asked");
      if (result.status === "asked") expect(result.outcome.summary).toBe("Which task owns the API?");
      expect(result.rungs.map((rung) => rung.round)).toEqual([1, 2, 3]);
      expect(fake.calls).toHaveLength(3);
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "b.md"))).toBe(false);

      const pm = (await runtime.store.listRecords()).filter((record) => record.step === "pm");
      expect(pm.map((record) => record.round)).toEqual([1, 2, 3]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks the iteration with every rung as alias, model and failure", async () => {
    const goal = makeGoal({
      runYaml: [
        "aliases:",
        "  architect: { harness: fake, model: fake-architect }",
        "  pm: { harness: fake, model: fake-pm, escalateTo: escalation }",
        "  escalation: { harness: fake, model: fake-escalated }",
        "  implementer: { harness: fake, model: fake-impl }",
        "  reviewer: { harness: fake, model: fake-review }",
        "limits: { iterations: 1, concurrency: 1 }",
        "",
      ].join("\n"),
    });
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      for (let rung = 1; rung <= 4; rung++) {
        harness.script((req, ctx) => {
          fs.writeFileSync(
            path.join(goal.tasksDir, "b.md"),
            simpleTask("b", "b.txt", { deps: ["ghost"] }),
            "utf8"
          );
          ctx.writeOutcome(outcome({ summary: `failure ${rung}` }));
          return fakeTurnResult(req);
        });
      }

      expect(await launch(goal.repo, harness)).toBe(3);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("boundary: PM ladder exhausted");
      expect(summary).toContain("rung 1 pm (fake-pm)");
      expect(summary).toContain("rung 2 pm (fake-pm)");
      expect(summary).toContain("rung 3 escalation (fake-escalated)");
      expect(summary).toContain("rung 4 escalation (fake-escalated)");
      expect(summary).toContain('depends on missing task "ghost"');

      const pm = (await createFolderStore(goal.goalDir).listRecords()).filter((record) => record.step === "pm");
      expect(pm.map((record) => [record.round, record.alias])).toEqual([
        [1, "pm"],
        [2, "pm"],
        [3, "escalation"],
        [4, "escalation"],
      ]);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("blocks with the escalated question and no further rung in the summary", async () => {
    const goal = makeGoal({
      runYaml: [
        "aliases:",
        "  architect: { harness: fake, model: fake-architect }",
        "  pm: { harness: fake, model: fake-pm, escalateTo: escalation }",
        "  escalation: { harness: fake, model: fake-escalated, escalateTo: deeper }",
        "  deeper: { harness: fake, model: fake-deeper }",
        "  implementer: { harness: fake, model: fake-impl }",
        "  reviewer: { harness: fake, model: fake-review }",
        "limits: { iterations: 1, concurrency: 1 }",
        "",
      ].join("\n"),
    });
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "continue" }));
        return fakeTurnResult(req);
      });
      for (const summary of ["first failure", "second failure"]) {
        harness.script((req, ctx) => {
          fs.writeFileSync(
            path.join(goal.tasksDir, "b.md"),
            simpleTask("b", "b.txt", { deps: ["ghost"] }),
            "utf8"
          );
          ctx.writeOutcome(outcome({ summary }));
          return fakeTurnResult(req);
        });
      }
      harness.script((req, ctx) => {
        expect(req.model.id).toBe("fake-escalated");
        ctx.writeOutcome(outcome({ status: "blocked", summary: "Which task owns the API?" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness)).toBe(3);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
      expect(summary).toContain("boundary: PM escalated and asked: Which task owns the API?");
      expect(summary).not.toContain("fake-deeper");
      expect(fs.existsSync(path.join(goal.tasksDir, "b.md"))).toBe(false);

      const pm = (await createFolderStore(goal.goalDir).listRecords()).filter((record) => record.step === "pm");
      expect(pm.map((record) => record.round)).toEqual([1, 2, 3]);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});