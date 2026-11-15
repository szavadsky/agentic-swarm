import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { derive } from "../../src/kernel/derive.js";
import { runGoal } from "../../src/kernel/launch.js";
import { runPm } from "../../src/kernel/pm.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { parseTaskFile } from "../../src/kernel/tasks.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  simpleTask,
  writeTask as writeGoalTask,
  writePlan,
} from "./e2e-helpers.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

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
    limits: {
      itemTurns: 8,
      flows: {},
      iterations: 1,
      concurrency: 1,
      perHarness: {},
    },
  };
}

async function setup(): Promise<{
  root: string;
  runtime: KernelRuntime;
  fake: FakeHarness;
  planPath: string;
}> {
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
    base.runtime.configs.run.aliases[alias] = {
      harness: "fake",
      model: `fake-${alias}`,
    };
    base.runtime.configs.run.aliases[from]!.escalateTo = alias;
    from = alias;
  }
  return base;
}

function writeInvalidTask(runtime: KernelRuntime): void {
  fs.writeFileSync(
    path.join(runtime.store.tasksDir, "b.md"),
    simpleTask("b", "b.txt", { deps: ["missing"] }),
    "utf8",
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
          "utf8",
        );
        ctx.writeOutcome({
          status: "done",
          summary: "filed b",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "c.md"),
          simpleTask("c", "c.txt", { deps: ["c"] }),
          "utf8",
        );
        ctx.writeOutcome({
          status: "done",
          summary: "filed c",
          concerns: [],
          forward: [],
        });
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
      expect(fake.calls[1]!.prompt).toContain(
        'depends on missing task "missing"',
      );
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.step === "pm-validate" && r.ok === false),
      ).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores a merged task and a finished spike the PM touched and reports both", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const alpha = simpleTask("alpha", "alpha.txt");
      const probe = simpleTask("probe", "finding.md", {
        kind: "spike",
        flow: "spike",
      });
      await runtime.store.writeTask(parseTaskFile(alpha, "alpha"));
      await runtime.store.writeTask(parseTaskFile(probe, "probe"));
      const before = new Map(
        ["alpha", "probe"].map((slug) => [
          slug,
          fs.readFileSync(
            path.join(runtime.store.tasksDir, `${slug}.md`),
            "utf8",
          ),
        ]),
      );
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "alpha",
          step: "merge",
          round: 1,
          actor: "script",
        },
        { ok: true },
      );
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "probe",
          step: "finish",
          round: 1,
          actor: "script",
        },
        { ok: true },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.probe!.status).toBe("finished");

      fake.script((req, ctx) => {
        for (const slug of ["alpha", "probe"]) {
          fs.appendFileSync(
            path.join(runtime.store.tasksDir, `${slug}.md`),
            "\nPM edit.\n",
            "utf8",
          );
        }
        ctx.writeOutcome({
          status: "done",
          summary: "edited frozen work",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain(
          'frozen task "alpha" was edited; restored',
        );
        expect(req.prompt).toContain(
          'frozen task "probe" was edited; restored',
        );
        for (const slug of ["alpha", "probe"]) {
          expect(
            fs.readFileSync(
              path.join(runtime.store.tasksDir, `${slug}.md`),
              "utf8",
            ),
          ).toBe(before.get(slug)!);
        }
        ctx.writeOutcome({
          status: "done",
          summary: "acknowledged",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state,
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
      for (const slug of ["alpha", "probe"]) {
        expect(
          fs.readFileSync(
            path.join(runtime.store.tasksDir, `${slug}.md`),
            "utf8",
          ),
        ).toBe(before.get(slug)!);
      }
      const records = await runtime.store.listRecords();
      const reconcile = records.find((r) => r.step === "pm-reconcile");
      expect(reconcile?.ok).toBe(false);
      expect(reconcile?.cause).toContain('frozen task "alpha"');
      expect(reconcile?.cause).toContain('frozen task "probe"');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks merged and finished tasks frozen and read-only while pending tasks stay editable", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fs.writeFileSync(
        planPath,
        "# Plan\n\n## alpha\nCreate alpha.\n\n## probe\nProbe.\n\n## work\nWork.\n\n## later\nLater.\n",
        "utf8",
      );
      for (const text of [
        simpleTask("alpha", "alpha.txt"),
        simpleTask("probe", "finding.md", { kind: "spike", flow: "spike" }),
        simpleTask("work", "work.txt"),
        simpleTask("later", "later.txt", { deps: ["work"] }),
      ]) {
        await runtime.store.writeTask(
          parseTaskFile(text, /^slug:\s*(\S+)/m.exec(text)![1]!),
        );
      }
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "alpha",
          step: "merge",
          round: 1,
          actor: "script",
        },
        { ok: true },
      );
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "probe",
          step: "finish",
          round: 1,
          actor: "script",
        },
        { ok: true },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.probe!.status).toBe("finished");
      expect(state.tasks.later!.status).toBe("pending");
      const frozenBefore = new Map(
        ["alpha", "probe"].map((slug) => [
          slug,
          fs.readFileSync(
            path.join(runtime.store.tasksDir, `${slug}.md`),
            "utf8",
          ),
        ]),
      );

      fake.script((req, ctx) => {
        const line = (slug: string) =>
          req.prompt
            .split("\n")
            .find((candidate) => candidate.includes(`- ${slug} |`)) ?? "";
        expect(line("alpha")).toContain("| frozen (read-only)");
        expect(line("probe")).toContain("| frozen (read-only)");
        expect(line("later")).not.toContain("frozen");
        fs.appendFileSync(
          path.join(runtime.store.tasksDir, "later.md"),
          "\nPM edit.\n",
          "utf8",
        );
        ctx.writeOutcome({
          status: "done",
          summary: "edited the pending task",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state,
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
      for (const [slug, text] of frozenBefore) {
        expect(
          fs.readFileSync(
            path.join(runtime.store.tasksDir, `${slug}.md`),
            "utf8",
          ),
        ).toBe(text);
      }
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "later.md"), "utf8"),
      ).toContain("PM edit.");
      const records = await runtime.store.listRecords();
      expect(
        records.filter((record) => record.step === "pm-reconcile"),
      ).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores a failed rung's task writes from the pre-PM snapshot", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      await runtime.store.writeTask(
        parseTaskFile(simpleTask("alpha", "alpha.txt"), "alpha"),
      );
      fs.writeFileSync(planPath, "# Plan\n\n## alpha\nCreate alpha.\n", "utf8");
      const before = fs.readFileSync(
        path.join(runtime.store.tasksDir, "alpha.md"),
        "utf8",
      );

      fake.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "alpha.md"),
          "---\nslug: alpha\n---\nPM rewrite.\n",
          "utf8",
        );
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "b.md"),
          "no frontmatter\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "rewrote the plan's task" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(
          fs.readFileSync(
            path.join(runtime.store.tasksDir, "alpha.md"),
            "utf8",
          ),
        ).toBe(before);
        expect(fs.existsSync(path.join(runtime.store.tasksDir, "b.md"))).toBe(
          false,
        );
        expect(req.prompt).toContain('task "b" has no --- frontmatter ---');
        ctx.writeOutcome(outcome({ summary: "the snapshot is intact" }));
        return fakeTurnResult(req);
      });

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      const result = await runPm(runtime, {
        iteration: 1,
        state,
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
      ).toBe(before);
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "b.md"))).toBe(
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("parks a dropped task that has commits and cancels one without, matching plan paths to slugs", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fs.writeFileSync(
        planPath,
        // alpha is named only by its file path, with a sentence dot after it;
        // beta only by its bare slug. Each alternative must stand alone.
        "# Plan\n\nKeep tasks/alpha.md.\n\n## beta\nUse beta.\n\n## work\nWork.\n",
        "utf8",
      );
      for (const text of [
        simpleTask("alpha", "alpha.txt"),
        simpleTask("beta", "beta.txt"),
        simpleTask("work", "work.txt"),
        simpleTask("ghost", "ghost.txt", { deps: ["work"] }),
        simpleTask("stuck", "stuck.txt", { deps: ["work"] }),
      ]) {
        await runtime.store.writeTask(
          parseTaskFile(text, /^slug:\s*(\S+)/m.exec(text)![1]!),
        );
      }
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "ghost",
          step: "implement",
          round: 1,
          actor: "agent",
        },
        {
          ok: true,
          commit: "c0ffee",
          tree: "t0",
          outcome: {
            status: "done",
            summary: "committed before the plan changed",
            concerns: [],
            forward: [],
          },
        },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      expect(state.tasks.ghost!.status).toBe("pending");
      expect(state.tasks.ghost!.commit).toBe("c0ffee");
      expect(state.tasks.stuck!.status).toBe("pending");

      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "kept the plan" }));
        return fakeTurnResult(req);
      });
      const result = await runPm(runtime, {
        iteration: 2,
        state,
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");

      const after = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      expect(after.tasks.alpha!.status).not.toBe("cancelled");
      expect(after.tasks.beta!.status).not.toBe("cancelled");
      expect(after.tasks.ghost!.status).toBe("parked");
      expect(after.tasks.ghost!.cause).toBe("dropped-with-commits");
      expect(after.tasks.stuck!.status).toBe("cancelled");
      expect(after.tasks.stuck!.cause).toContain("removed from the plan");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores a plan the PM edited and rejects the turn", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const plan = fs.readFileSync(planPath, "utf8");
      fake.script((req, ctx) => {
        fs.appendFileSync(
          planPath,
          "\n## smuggled\nPM-authored direction.\n",
          "utf8",
        );
        ctx.writeOutcome({
          status: "done",
          summary: "edited the plan",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain(
          "plan.md changed during the PM turn; restored",
        );
        expect(fs.readFileSync(planPath, "utf8")).toBe(plan);
        ctx.writeOutcome({
          status: "done",
          summary: "acknowledged",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });

      await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
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
        fs.appendFileSync(goal.planPath, "\n## architect edit\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(goal.tasksDir, "b.md"),
          simpleTask("b", "b.txt", { deps: ["ghost"] }),
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "filed an invalid task" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain('depends on missing task "ghost"');
        fs.writeFileSync(
          path.join(goal.tasksDir, "c.md"),
          simpleTask("c", "c.txt", { deps: ["c"] }),
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "filed another invalid task" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness)).toBe(3);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("PM ladder exhausted");
      const records = await createFolderStore(goal.goalDir).listRecords();
      expect(records.filter((r) => r.step === "architect")).toHaveLength(1);
      expect(
        records.some((r) => r.step === "pm-validate" && r.ok === false),
      ).toBe(true);
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
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(result.rungs).toHaveLength(1);
      expect(result.rungs[0]).toMatchObject({
        round: 1,
        alias: "pm",
        model: "fake-pm",
      });
      expect(result.rungs[0]!.failure).toContain(
        'depends on missing task "missing"',
      );

      const pm = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      );
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
        ctx.writeOutcome(
          outcome({ status: "failed", summary: "plan underivable" }),
        );
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        expect(req.prompt).toContain("status failed: plan underivable");
        expect(req.prompt).toContain("Restated PM contract");
        ctx.writeOutcome(
          outcome({ status: "blocked", summary: "Which task owns the API?" }),
        );
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        expect(req.model.id).toBe("fake-escalation");
        expect(req.prompt).toContain("broader mandate");
        expect(req.prompt).toContain(
          "status blocked: Which task owns the API?",
        );
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "alpha.md"),
          simpleTask("alpha", "alpha.txt"),
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "filed alpha after the base tier failed" }),
        );
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(fake.calls).toHaveLength(3);
      expect(result.rungs.map((rung) => [rung.round, rung.alias])).toEqual([
        [1, "pm"],
        [2, "pm"],
      ]);
      expect(result.rungs[0]!.failure).toContain(
        "status failed: plan underivable",
      );
      expect(result.rungs[1]!.failure).toContain(
        "status blocked: Which task owns the API?",
      );

      const pm = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      );
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
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "filed alpha on the escalation tier" }),
        );
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(fake.calls[2]!.model.id).toBe("fake-escalation");

      const pm = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      );
      expect(
        pm.map((record) => [record.round, record.alias, record.model?.id]),
      ).toEqual([
        [1, "pm", "fake-pm"],
        [2, "pm", "fake-pm"],
        [3, "escalation", "fake-escalation"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stops on an escalated blocked answer and runs no further rung", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup([
      "escalation",
      "deeper",
    ]);
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
        ctx.writeOutcome(
          outcome({ status: "blocked", summary: "Which task owns the API?" }),
        );
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("asked");
      if (result.status === "asked")
        expect(result.outcome.summary).toBe("Which task owns the API?");
      expect(result.rungs.map((rung) => rung.round)).toEqual([1, 2, 3]);
      expect(fake.calls).toHaveLength(3);
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "b.md"))).toBe(
        false,
      );

      const pm = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      );
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
        fs.appendFileSync(goal.planPath, "\n## architect edit\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      for (let rung = 1; rung <= 4; rung++) {
        harness.script((req, ctx) => {
          fs.writeFileSync(
            path.join(goal.tasksDir, "b.md"),
            simpleTask("b", "b.txt", { deps: ["ghost"] }),
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: `failure ${rung}` }));
          return fakeTurnResult(req);
        });
      }

      expect(await launch(goal.repo, harness)).toBe(3);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("boundary: PM ladder exhausted");
      expect(summary).toContain("rung 1 pm (fake-pm)");
      expect(summary).toContain("rung 2 pm (fake-pm)");
      expect(summary).toContain("rung 3 escalation (fake-escalated)");
      expect(summary).toContain("rung 4 escalation (fake-escalated)");
      expect(summary).toContain('depends on missing task "ghost"');

      const pm = (await createFolderStore(goal.goalDir).listRecords()).filter(
        (record) => record.step === "pm",
      );
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
        fs.appendFileSync(goal.planPath, "\n## architect edit\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      for (const summary of ["first failure", "second failure"]) {
        harness.script((req, ctx) => {
          fs.writeFileSync(
            path.join(goal.tasksDir, "b.md"),
            simpleTask("b", "b.txt", { deps: ["ghost"] }),
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary }));
          return fakeTurnResult(req);
        });
      }
      harness.script((req, ctx) => {
        expect(req.model.id).toBe("fake-escalated");
        ctx.writeOutcome(
          outcome({ status: "blocked", summary: "Which task owns the API?" }),
        );
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness)).toBe(3);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain(
        "boundary: PM escalated and asked: Which task owns the API?",
      );
      expect(summary).not.toContain("fake-deeper");
      expect(fs.existsSync(path.join(goal.tasksDir, "b.md"))).toBe(false);

      const pm = (await createFolderStore(goal.goalDir).listRecords()).filter(
        (record) => record.step === "pm",
      );
      expect(pm.map((record) => record.round)).toEqual([1, 2, 3]);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("stops the ladder on an infrastructure stop and runs no further rung", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup(["escalation"]);
    try {
      fake.script((req) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "b.md"),
          simpleTask("b", "b.txt"),
          "utf8",
        );
        return fakeTurnResult(req, {
          stop: {
            kind: "infra",
            cause: "quota",
            details: "quota exceeded for fake-pm",
          },
        });
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("infra");
      if (result.status === "infra") {
        expect(result.stop).toEqual({
          kind: "infra",
          cause: "quota",
          details: "quota exceeded for fake-pm",
        });
      }
      expect(result.rungs).toHaveLength(1);
      expect(result.rungs[0]).toMatchObject({
        round: 1,
        alias: "pm",
        model: "fake-pm",
      });
      expect(fake.calls).toHaveLength(1);
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "b.md"))).toBe(
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("climbs after a refusal that delivered no outcome", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup(["escalation"]);
    try {
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "refusal", details: "policy" } }),
      );
      fake.script((req, ctx) => {
        expect(req.model.id).toBe("fake-pm");
        expect(req.prompt).toContain("no outcome (refusal)");
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "alpha.md"),
          simpleTask("alpha", "alpha.txt"),
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "filed alpha after the refusal" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(fake.calls).toHaveLength(2);
      expect(result.rungs).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks a cancelled task read-only in the PM prompt", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fs.writeFileSync(
        planPath,
        "# Plan\n\n## alpha\nCreate alpha.\n\n## spent\nCreate spent.\n",
        "utf8",
      );
      for (const text of [
        simpleTask("alpha", "alpha.txt"),
        simpleTask("spent", "spent.txt"),
      ]) {
        await runtime.store.writeTask(
          parseTaskFile(text, /^slug:\s*(\S+)/m.exec(text)![1]!),
        );
      }
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "spent",
          step: "cancel",
          round: 1,
          actor: "script",
        },
        { ok: true, cause: "removed from the plan at iteration 1" },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      expect(state.tasks.spent!.status).toBe("cancelled");

      fake.script((req, ctx) => {
        const line = (slug: string) =>
          req.prompt
            .split("\n")
            .find((candidate) => candidate.includes(`- ${slug} |`)) ?? "";
        expect(line("spent")).toContain("read-only (spent)");
        expect(line("alpha")).not.toContain("read-only");
        ctx.writeOutcome(outcome({ summary: "left the spent slug alone" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state,
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("done");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ends the boundary with the infra cause and details", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n## alpha\n",
        "utf8",
      );
      harness.script((req, ctx) => {
        fs.appendFileSync(
          path.join(runtime.store.goalDir, "plan.md"),
          "\n## architect edit\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: {
            kind: "infra",
            cause: "quota",
            details: "quota exceeded for fake-pm",
          },
        }),
      );

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("blocked");
      expect(boundary.stop).toEqual({
        cause: "quota",
        details: "quota exceeded for fake-pm",
      });
      expect(boundary.cause).toBe(
        "PM ladder stopped on infrastructure at rung 1 pm (fake-pm): quota: quota exceeded for fake-pm",
      );
      expect(harness.calls).toHaveLength(2);
      const pm = (await runtime.store.listRecords()).filter(
        (record) => record.step === "pm",
      );
      expect(pm).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("ends the launch as infra when the first PM rung stops on quota", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(
          goal.goalDir,
          "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req) => {
        writeGoalTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
        return fakeTurnResult(req, {
          stop: {
            kind: "infra",
            cause: "quota",
            details: "quota exceeded for fake-pm",
          },
        });
      });

      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 2,
        harnesses: { fake: harness },
      });

      expect(result.stop).toBe("infra");
      expect(result.cause).toContain("quota");
      expect(result.cause).toContain("quota exceeded for fake-pm");
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).toContain("quota exceeded for fake-pm");
      // Architect and PM only: the restored pre-PM task never reached dispatch.
      expect(harness.calls).toHaveLength(2);
      expect(fs.existsSync(path.join(goal.tasksDir, "alpha.md"))).toBe(false);
      expect(
        fs.existsSync(path.join(goal.goalDir, "iterations/2/summary.md")),
      ).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("fails every rung naming task files when PM turns deliver no outcome", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      for (let i = 0; i < 4; i++) {
        fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      }

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        planPath,
        cwd: root,
      });
      expect(result.status).toBe("exhausted");
      expect(result.rungs).toHaveLength(2);
      expect(fake.calls).toHaveLength(4);
      expect(fake.calls[1]!.prompt).toContain(
        "You are the pm. Your turn did not deliver its task files.",
      );
      expect(result.rungs[0]!.failure).toContain(
        "missing deliverable: task files",
      );
      expect(result.rungs[1]!.failure).toContain(
        "missing deliverable: task files",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
