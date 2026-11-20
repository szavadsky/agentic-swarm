// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { runGoal } from "../../src/kernel/launch.js";
import { runPm, runStallPm } from "../../src/kernel/pm.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  simpleTask,
  writeTask as writeGoalTask,
  writePlan,
} from "./e2e-helpers.js";
import { cause, causeText } from "./helpers.js";
import { withKernelRoleFallbacks, workCalls } from "./fake-defaults.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const process: ProcessConfig = {
    taskTypes: {},
    flows: {},
    boundary: TEST_BOUNDARY,
    architecture: TEST_ARCHITECTURE,
    reminders: 1,
  };
  const repo: RepoConfig = {
    baseBranch: "main",
    artifactRoot: ".factory/artifacts",
    setup: [],
    gates: [],
  };
  const run: RunConfig = {
    aliases: { pm: { harness: "fake", model: "fake-pm" } },
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      iterations: 1,
      planCheckRounds: 2,
    },
    sessions: { dir: "", keepRuns: 1, retention: "short" },
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
    store: createFolderStore(path.join(root, "goal"), undefined, {}),
    harnesses: new Map([["fake", fake]]),
    prompts: loadPrompts(process, root, {}),
    limits: {
      flows: {},
      iterations: 1,
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      planCheckRounds: 2,
    },
    exhaustedPools: new Map(),
    // Hermetic prices: the test-local cache, never the network.
    priceSource: {
      cachePath: path.join(root, "price-cache.json"),
      fetchModels: async () => {
        throw new Error("price fetch disabled in tests");
      },
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
  const fake = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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
      expect(causeText(reconcile?.cause)).toContain('frozen task "alpha"');
      expect(causeText(reconcile?.cause)).toContain('frozen task "probe"');
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

  it("keeps a dropped task open and cancels only the slug the plan names cancelled", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fs.writeFileSync(
        planPath,
        [
          "# Plan",
          "",
          "Keep tasks/alpha.md.",
          "",
          "## beta",
          "Use beta.",
          "",
          "## work",
          "Work.",
          "",
          "cancelled: stuck — superseded by work",
          "cancelled: old — merged history cannot be rewritten",
          // No em dash and no reason: prose, not a decision.
          "cancelled: typo",
          "",
        ].join("\n"),
        "utf8",
      );
      for (const text of [
        simpleTask("alpha", "alpha.txt"),
        simpleTask("beta", "beta.txt"),
        simpleTask("work", "work.txt"),
        simpleTask("ghost", "ghost.txt", { deps: ["work"] }),
        simpleTask("stuck", "stuck.txt", { deps: ["work"] }),
        simpleTask("typo", "typo.txt"),
        simpleTask("old", "old.txt"),
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
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "old",
          step: "merge",
          round: 1,
          actor: "script",
        },
        { ok: true, commit: "abc1234" },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      expect(state.tasks.ghost!.status).toBe("pending");
      expect(state.tasks.stuck!.status).toBe("pending");
      expect(state.tasks.old!.status).toBe("merged");

      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "kept the plan" }));
        return fakeTurnResult(req);
      });
      const result = await runPm(runtime, {
        iteration: 2,
        state,
        cwd: root,
      });
      expect(result.status).toBe("done");

      const after = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      // The dropped bullet says nothing: ghost stays open with its commit.
      expect(after.tasks.ghost!.status).toBe("pending");
      expect(after.tasks.ghost!.commit).toBe("c0ffee");
      // Only the explicit line cancels, and its reason is the cause.
      expect(after.tasks.stuck!.status).toBe("cancelled");
      expect(after.tasks.stuck!.cause).toEqual(cause("superseded by work"));
      // A frozen slug is history; a line missing the em dash is prose.
      expect(after.tasks.old!.status).toBe("merged");
      expect(after.tasks.typo!.status).not.toBe("cancelled");
      for (const slug of ["alpha", "beta", "work"]) {
        expect(after.tasks[slug]!.status).not.toBe("cancelled");
      }
      const cancels = (await runtime.store.listRecords()).filter(
        (record) => record.step === "cancel",
      );
      expect(cancels.map((record) => record.slug)).toEqual(["stuck"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores an open task file the PM deletes and rejects the turn", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const alpha = simpleTask("alpha", "alpha.txt");
      await runtime.store.writeTask(
        parseTaskFile(alpha, /^slug:\s*(\S+)/m.exec(alpha)![1]!),
      );
      const before = fs.readFileSync(
        path.join(runtime.store.tasksDir, "alpha.md"),
        "utf8",
      );
      fake.script((req, ctx) => {
        fs.rmSync(path.join(runtime.store.tasksDir, "alpha.md"));
        ctx.writeOutcome(outcome({ summary: "dropped alpha by deleting it" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain(
          'task "alpha" was deleted; restored: a task leaves only through the plan\'s cancelled line or a PM decision',
        );
        expect(
          fs.readFileSync(
            path.join(runtime.store.tasksDir, "alpha.md"),
            "utf8",
          ),
        ).toBe(before);
        ctx.writeOutcome(outcome({ summary: "left alpha open" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive(
          await runtime.store.listTasks(),
          await runtime.store.listRecords(),
        ),
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(fake.calls).toHaveLength(2);
      const after = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );
      expect(after.tasks.alpha!.status).not.toBe("cancelled");
      expect(
        (await runtime.store.listRecords()).some(
          (record) => record.step === "cancel",
        ),
      ).toBe(false);
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
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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

      await expectLaunch(3, goal.repo, harness);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("PM ladder exhausted");
      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
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
        "  digest: { harness: fake, model: fake-digest }",
        "  implementer: { harness: fake, model: fake-impl }",
        "  implementer-b: { harness: fake, model: fake-impl-b }",
        "  researcher: { harness: fake, model: fake-research }",
        "  reviewer: { harness: fake, model: fake-review }",
        "  steward: { harness: fake, model: fake-steward }",
        "  plan-checker: { harness: fake, model: fake-check }",
        "  plan-reviewer: { harness: fake, model: fake-plan-review }",
        "  pack-preparer: { harness: fake, model: fake-pack-prep }",
        "limits: { iterations: 1, concurrency: { overall: 1, perSubscription: {}, perModel: {} } }",
        "",
      ].join("\n"),
    });
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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

      await expectLaunch(3, goal.repo, harness);
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

      const pm = (
        await createFolderStore(goal.goalDir, undefined, {}).listRecords()
      ).filter((record) => record.step === "pm");
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
        "  digest: { harness: fake, model: fake-digest }",
        "  implementer: { harness: fake, model: fake-impl }",
        "  implementer-b: { harness: fake, model: fake-impl-b }",
        "  researcher: { harness: fake, model: fake-research }",
        "  reviewer: { harness: fake, model: fake-review }",
        "  steward: { harness: fake, model: fake-steward }",
        "  plan-checker: { harness: fake, model: fake-check }",
        "  plan-reviewer: { harness: fake, model: fake-plan-review }",
        "  pack-preparer: { harness: fake, model: fake-pack-prep }",
        "limits: { iterations: 1, concurrency: { overall: 1, perSubscription: {}, perModel: {} } }",
        "",
      ].join("\n"),
    });
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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

      await expectLaunch(3, goal.repo, harness);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain(
        "boundary: PM escalated and asked: Which task owns the API?",
      );
      expect(summary).not.toContain("fake-deeper");
      expect(fs.existsSync(path.join(goal.tasksDir, "b.md"))).toBe(false);

      const pm = (
        await createFolderStore(goal.goalDir, undefined, {}).listRecords()
      ).filter((record) => record.step === "pm");
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
        { ok: true, cause: cause("superseded by the new plan") },
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
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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
      expect(workCalls(harness)).toHaveLength(2);
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
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
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
        priceSource: testPriceSource(goal.repo.dir),
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
      expect(workCalls(harness)).toHaveLength(2);
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
      // Two rungs, each an attempt plus the default one reminder.
      for (let i = 0; i < 4; i++) {
        fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      }

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
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

/** The graph finding a task file raises when it names a dep nothing declares. */
const baselineFinding = (slug: string, dep: string): string =>
  `task "${slug}" depends on missing task "${dep}"`;

function writeTaskText(runtime: KernelRuntime, text: string): void {
  fs.writeFileSync(
    path.join(runtime.store.tasksDir, `${/^slug:\s*(\S+)/m.exec(text)![1]}.md`),
    text,
    "utf8",
  );
}

describe("PM ladder baseline", () => {
  it("charges one turn for a pre-existing finding and keeps the turn's writes", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fs.writeFileSync(
        planPath,
        "# Plan\n\n## alpha\nCreate alpha.\n\ncancelled: spent — folded into alpha\n",
        "utf8",
      );
      writeTaskText(runtime, simpleTask("b", "b.txt", { deps: ["missing"] }));
      writeTaskText(runtime, simpleTask("spent", "spent.txt"));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );

      fake.script((req, ctx) => {
        writeTaskText(runtime, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha; b is history" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state,
        cwd: root,
      });
      expect(result.status).toBe("architect");
      if (result.status === "architect")
        expect(result.findings).toEqual([baselineFinding("b", "missing")]);
      expect(fake.calls).toHaveLength(1);
      // The usable write stands and the plan's cancellation still runs.
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "alpha.md"))).toBe(
        true,
      );
      const records = await runtime.store.listRecords();
      expect(
        records.some(
          (record) => record.slug === "spent" && record.step === "cancel",
        ),
      ).toBe(true);
      expect(records.some((record) => record.step === "pm-validate")).toBe(
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("escalates on a finding the turn introduced", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup(["escalation"]);
    try {
      writeTaskText(runtime, simpleTask("b", "b.txt", { deps: ["missing"] }));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );

      for (const summary of ["introduced a cycle", "introduced it again"]) {
        fake.script((req, ctx) => {
          writeTaskText(runtime, simpleTask("c", "c.txt", { deps: ["c"] }));
          ctx.writeOutcome(outcome({ summary }));
          return fakeTurnResult(req);
        });
      }
      fake.script((req, ctx) => {
        expect(req.model.id).toBe("fake-escalation");
        writeTaskText(runtime, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state,
        cwd: root,
      });
      expect(fake.calls.map((call) => call.model.id)).toEqual([
        "fake-pm",
        "fake-pm",
        "fake-escalation",
      ]);
      expect(result.status).toBe("architect");
      if (result.status === "architect")
        expect(result.findings).toEqual([baselineFinding("b", "missing")]);
      // The introduced finding failed the rung; the pre-existing one did not.
      expect(result.rungs[0]!.failure).toContain('task "c" depends on itself');
      expect(result.rungs[0]!.failure).not.toContain(
        baselineFinding("b", "missing"),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes only the baseline findings a clean rung left standing", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      writeTaskText(runtime, simpleTask("b", "b.txt", { deps: ["gone-one"] }));
      writeTaskText(runtime, simpleTask("z", "z.txt", { deps: ["gone-two"] }));
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
      );

      fake.script((req, ctx) => {
        // Fix one baseline finding; the other is not derivable from the plan.
        writeTaskText(runtime, simpleTask("b", "b.txt"));
        ctx.writeOutcome(outcome({ summary: "fixed b, z remains" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state,
        cwd: root,
      });
      expect(result.status).toBe("architect");
      if (result.status === "architect")
        expect(result.findings).toEqual([baselineFinding("z", "gone-two")]);
      expect(fake.calls).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes the findings to the architect instead of blocking the goal", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n## alpha\nCreate alpha.txt.\n",
        "utf8",
      );
      writeTaskText(runtime, simpleTask("b", "b.txt", { deps: ["missing"] }));
      // Merged: the finding is history and no open work summons the checker.
      await runtime.store.appendRecord(
        { iteration: 1, slug: "b", step: "merge", round: 1, actor: "script" },
        { ok: true },
      );
      harness.script((req, ctx) => {
        fs.appendFileSync(
          path.join(runtime.store.goalDir, "plan.md"),
          "\n## alpha note\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeTaskText(runtime, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect(boundary.cause).toBe(
        `PM ladder routed to the architect: ${baselineFinding("b", "missing")}`,
      );
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "alpha.md"))).toBe(
        true,
      );
      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("ends the launch in progress, not blocked-by-user, when the route reaches it", async () => {
    const goal = makeGoal();
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      writeGoalTask(
        goal.goalDir,
        simpleTask("b", "b.txt", { deps: ["missing"] }),
      );
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no task to file for b" }));
        return fakeTurnResult(req);
      });

      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
        priceSource: testPriceSource(goal.repo.dir),
      });
      expect(result.stop).toBe("iteration-limit");
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: in-progress");
      expect(summary).not.toContain("blocked-by-user");
      expect(summary).toContain(
        `PM ladder routed to the architect: ${baselineFinding("b", "missing")}`,
      );
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

describe("stall PM — zero-merge stall in the running iteration", () => {
  const ALPHA_BODY = "Write alpha.txt.\nDone when: alpha.txt holds alpha.";

  function stallSetup() {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    return { repo, goal, harness };
  }

  function pmCalls(harness: FakeHarness): number {
    return harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm")
      .length;
  }

  it("runs one stall turn on exhaustion with 0 merges and a park; the continuation merges in the same iteration", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck on the API" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      let stallPrompt = "";
      harness.script(
        (req, ctx) => {
          stallPrompt = req.prompt;
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, "alpha-2.md"),
            renderTaskFile(
              task("alpha-2", {
                scope: ["alpha.txt"],
                base: "alpha",
                source: "stall: 1",
                body: `Retry with the records.\nDone when: alpha.txt holds alpha.`,
                turnMinutes: 45,
                repairTurns: 2,
              }),
            ),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "continue alpha",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "replace",
                  reason: "retry with the records",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "alpha-2 implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha-2", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "alpha-2 approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha-2", step: "review" }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks["alpha-2"]!.status).toBe("merged");
      // The continuation ran in the same iteration, not at the next boundary.
      for (const record of records.filter((r) => r.slug === "alpha-2")) {
        expect(record.iteration).toBe(1);
      }
      expect(pmCalls(harness)).toBe(1);
      const routes = records.filter((r) => r.step === "stall-routes");
      expect(routes).toHaveLength(1);
      expect(routes[0]!.outcome?.stallRoutes).toEqual([
        { slug: "alpha", action: "replace", reason: "retry with the records" },
      ]);
      // The stall turn saw the park's cause, record paths, kept branch and spent turns.
      expect(stallPrompt).toContain("alpha stuck on the API");
      expect(stallPrompt).toContain("records/");
      expect(stallPrompt).toContain("alpha-implement");
      expect(stallPrompt).toContain("factory-task/demo/alpha");
      expect(stallPrompt).toContain("turns: 1 spent");
      const continuation = parseTaskFile(
        fs.readFileSync(
          path.join(runtime.store.tasksDir, "alpha-2.md"),
          "utf8",
        ),
        "alpha-2",
      );
      expect(continuation.base).toBe("alpha");
      expect(continuation.source).toBe("stall: 1");
      expect(continuation.turnMinutes).toBe(45);
      expect(continuation.repairTurns).toBe(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("ends at the boundary with recorded reasons when the stall turn leaves every slug parked", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck on the API" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      scriptStallLeave(
        harness,
        ["alpha"],
        "direction is wrong; needs architect",
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(pmCalls(harness)).toBe(1);
      const files = await runtime.store.listDir("tasks");
      expect(files).toEqual(["alpha.md"]);
      const routes = (await runtime.store.listRecords()).filter(
        (r) => r.step === "stall-routes",
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]!.ok).toBe(true);
      expect(routes[0]!.outcome?.stallRoutes).toEqual([
        {
          slug: "alpha",
          action: "leave",
          reason: "direction is wrong; needs architect",
        },
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("runs a second stall when the continuation parks again in the same iteration", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, "alpha-2.md"),
            renderTaskFile(
              task("alpha-2", {
                scope: ["alpha.txt"],
                base: "alpha",
                source: "stall: 1",
                body: `Retry.\nDone when: alpha.txt holds alpha.`,
              }),
            ),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "continue alpha",
              stallRoutes: [
                { slug: "alpha", action: "replace", reason: "retry" },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha-2 stuck too" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha-2", step: "implement" }) },
      );
      let secondBrief = "";
      harness.script(
        (req, ctx) => {
          secondBrief = req.prompt;
          ctx.writeOutcome(
            outcome({
              summary: "leave alpha-2 for the architect",
              stallRoutes: [
                {
                  slug: "alpha-2",
                  action: "leave",
                  reason: "the continuation hit the same blocker",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      // Each park gets one decision: alpha was replaced, and the new park of
      // alpha-2 got its own turn before the boundary.
      expect(pmCalls(harness)).toBe(2);
      const records = await runtime.store.listRecords();
      const routes = records.filter((r) => r.step === "stall-routes");
      expect(routes.map((r) => r.outcome?.stallRoutes)).toEqual([
        [{ slug: "alpha", action: "replace", reason: "retry" }],
        [
          {
            slug: "alpha-2",
            action: "leave",
            reason: "the continuation hit the same blocker",
          },
        ],
      ]);
      expect(secondBrief).toContain("cause: blocked: alpha-2 stuck too");
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks["alpha-2"]!.status).toBe("parked");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("amends a parked task under its slug and resumes it on its kept branch", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "1. alpha.txt needs a test that reads it",
              verdict: "changes",
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "review" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.appendFileSync(path.join(req.cwd!, "alpha.txt"), "more\n", "utf8");
          ctx.writeOutcome(
            outcome({
              summary: "added the test",
              replies: [
                { finding: 1, reply: "added a test that reads alpha.txt" },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "1. alpha.txt still misses the alpha line",
              verdict: "reject",
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "review" }) },
      );
      harness.script(
        (req, ctx) => {
          const file = path.join(runtime.store.tasksDir, "alpha.md");
          const current = parseTaskFile(fs.readFileSync(file, "utf8"), "alpha");
          fs.writeFileSync(
            file,
            renderTaskFile({
              ...current,
              revision: 1,
              body: `Amended brief: keep the alpha line.\nDone when: alpha.txt holds the alpha line and a test reads it.`,
            }),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "amended alpha",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "amend",
                  reason: "the brief never said the alpha line must stay",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        (req, ctx) => {
          // The kept branch is the worktree: revision 0's commit is still here.
          expect(
            fs.readFileSync(path.join(req.cwd!, "alpha.txt"), "utf8"),
          ).toContain("alpha");
          // The review history rides the prompt: the last review's findings.
          expect(req.prompt).toContain("alpha.txt still misses the alpha line");
          fs.appendFileSync(path.join(req.cwd!, "alpha.txt"), "test\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "amended brief implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "alpha approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "review" }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(pmCalls(harness)).toBe(1);
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "stall-routes")).toHaveLength(1);
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("merged");
      // The amend restarts the counts: implement and review return to round 1.
      expect(
        records
          .filter((r) => r.slug === "alpha" && r.step === "implement")
          .sort((a, b) => a.seq - b.seq)
          .map((r) => r.round),
      ).toEqual([1, 2, 1]);
      expect(
        records
          .filter((r) => r.slug === "alpha" && r.step === "review")
          .sort((a, b) => a.seq - b.seq)
          .map((r) => r.round),
      ).toEqual([1, 2, 1]);
      const amended = parseTaskFile(
        fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
        "alpha",
      );
      expect(amended.revision).toBe(1);
      expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout).toContain(
        "test",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("starts an amended task fresh when its park kept no branch", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", {
          scope: ["alpha.txt"],
          flow: "no-such-flow",
          body: ALPHA_BODY,
        }),
      );
      harness.script(
        (req, ctx) => {
          // The park never dispatched a turn, so there is no branch to keep.
          expect(
            repo.git(
              ["rev-parse", "--verify", "refs/heads/factory-task/demo/alpha"],
              {
                allowFail: true,
              },
            ).code,
          ).not.toBe(0);
          const file = path.join(runtime.store.tasksDir, "alpha.md");
          const current = parseTaskFile(fs.readFileSync(file, "utf8"), "alpha");
          fs.writeFileSync(
            file,
            renderTaskFile({
              ...current,
              flow: "just-implement",
              revision: 1,
              body: "Retry on a real flow.\nDone when: alpha.txt holds alpha.",
            }),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "amended alpha",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "amend",
                  reason: "the flow name was never configured",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("merged");
      // One agent turn only: the amendment started the work, nothing preceded it.
      expect(
        records.filter(
          (r) =>
            r.slug === "alpha" && r.actor === "agent" && r.step === "implement",
        ),
      ).toHaveLength(1);
      expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
        "alpha",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("splits a parked park into one task per outcome, each on its kept branch", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha too big" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, "alpha-a.md"),
            renderTaskFile(
              task("alpha-a", {
                scope: ["alpha-a.txt"],
                base: "alpha",
                source: "stall: 1",
                body: `First half.\nDone when: alpha-a.txt holds a.`,
              }),
            ),
            "utf8",
          );
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, "alpha-b.md"),
            renderTaskFile(
              task("alpha-b", {
                scope: ["alpha-b.txt"],
                base: "alpha",
                source: "stall: 1",
                body: `Second half.\nDone when: alpha-b.txt holds b.`,
              }),
            ),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "split alpha",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "split",
                  reason: "two separable outcomes",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      for (const half of ["alpha-a", "alpha-b"]) {
        harness.script(
          (req, ctx) => {
            fs.writeFileSync(
              path.join(req.cwd!, `${half}.txt`),
              `${half}\n`,
              "utf8",
            );
            ctx.writeOutcome(outcome({ summary: `${half} implemented` }));
            return fakeTurnResult(req);
          },
          { when: whenTurn({ slug: half, step: "implement" }) },
        );
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(
              outcome({ summary: `${half} approved`, verdict: "approve" }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ slug: half, step: "review" }) },
        );
      }

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks["alpha-a"]!.status).toBe("merged");
      expect(state.tasks["alpha-b"]!.status).toBe("merged");
      expect(repo.git(["show", "factory/demo:alpha-a.txt"]).stdout).toContain(
        "alpha-a",
      );
      expect(repo.git(["show", "factory/demo:alpha-b.txt"]).stdout).toContain(
        "alpha-b",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("never runs the stall turn on a drained iteration", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
        turns: 1,
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      expect(pmCalls(harness)).toBe(0);
      const records = await runtime.store.listRecords();
      expect(records.some((r) => r.step === "stall-routes")).toBe(false);
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("parked");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("falls back to the boundary when the stall turn never validates", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      // Two rungs, one alias: both omit stallRoutes, so the ladder exhausts.
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(outcome({ summary: "no routes" }));
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(pmCalls(harness)).toBe(2);
      const routes = (await runtime.store.listRecords()).filter(
        (r) => r.step === "stall-routes",
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]!.ok).toBe(false);
      expect(causeText(routes[0]!.cause)).toContain("stallRoutes");
      const files = await runtime.store.listDir("tasks");
      expect(files).toEqual(["alpha.md"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("accepts a fresh task without base when the kept branch conflicts with the head", async () => {
    const { repo, goal, harness } = stallSetup();
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeTask(
        task("alpha", { scope: ["alpha.txt"], body: ALPHA_BODY }),
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ status: "blocked", summary: "alpha stuck" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(
            path.join(runtime.store.tasksDir, "alpha-fresh.md"),
            renderTaskFile(
              task("alpha-fresh", {
                scope: ["alpha.txt"],
                source: "stall: 1",
                body: `Apply the kept diff onto the head.\nDone when: alpha.txt holds alpha.`,
              }),
            ),
            "utf8",
          );
          ctx.writeOutcome(
            outcome({
              summary: "fresh task for alpha",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "replace",
                  reason: "kept branch conflicts; apply the diff fresh",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "alpha-fresh implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha-fresh", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "alpha-fresh approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha-fresh", step: "review" }) },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks["alpha-fresh"]!.status).toBe("merged");
      const fresh = parseTaskFile(
        fs.readFileSync(
          path.join(runtime.store.tasksDir, "alpha-fresh.md"),
          "utf8",
        ),
        "alpha-fresh",
      );
      expect(fresh.base).toBeUndefined();
      expect(fresh.source).toBe("stall: 1");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("stall PM validation", () => {
  async function stallFixture(slugs: string[]) {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    fs.writeFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      "# Plan\n",
      "utf8",
    );
    for (const slug of slugs) {
      await runtime.store.writeTask(
        task(slug, {
          scope: [`${slug}.txt`],
          body: `Do ${slug}.\nDone when: ${slug} works.`,
        }),
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug, round: 1 }),
        { ok: true, cause: cause(`blocked: ${slug} stuck`) },
      );
    }
    const state = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    return { repo, runtime, harness, state };
  }

  it("commits the routes a turn wrote past a finding the graph already had", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      // A pre-existing, underivable graph finding: no stall route can fix it.
      await runtime.store.writeTask(
        task("stuck", { scope: ["stuck.txt"], deps: ["gone"] }),
      );
      scriptStallLeave(harness, ["alpha"]);

      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.left).toEqual(["alpha"]);
      const records = await runtime.store.listRecords();
      expect(
        records.some((record) => record.step === "stall-routes" && record.ok),
      ).toBe(true);
      expect(records.some((record) => record.step === "pm-validate")).toBe(
        false,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("rejects a replace that changes the done-when", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            fs.writeFileSync(
              path.join(runtime.store.tasksDir, "alpha-2.md"),
              renderTaskFile(
                task("alpha-2", {
                  scope: ["alpha.txt"],
                  base: "alpha",
                  source: "stall: 1",
                  body: "New goal.\nDone when: something else works.",
                }),
              ),
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "continue alpha",
                stallRoutes: [
                  { slug: "alpha", action: "replace", reason: "retry" },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["alpha"]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(validations).toHaveLength(2);
      expect(causeText(validations[0]!.cause)).toContain("done-when");
      expect(
        fs.existsSync(path.join(runtime.store.tasksDir, "alpha-2.md")),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("rejects an amend that does not bump the revision", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            fs.appendFileSync(
              path.join(runtime.store.tasksDir, "alpha.md"),
              "\nRetry with more direction.\n",
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "amend alpha",
                stallRoutes: [
                  {
                    slug: "alpha",
                    action: "amend",
                    reason: "retry with direction",
                  },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(causeText(validations[0]!.cause)).toContain('bumps "revision"');
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
      ).not.toContain("Retry with more direction.");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("refuses an amend of a merged task and restores its file", async () => {
    const { repo, runtime, harness } = await stallFixture(["alpha"]);
    try {
      await runtime.store.writeTask(
        task("done", {
          scope: ["done.txt"],
          body: "Done.\nDone when: done works.",
        }),
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "done" }),
        {
          ok: true,
          commit: "abc123",
        },
      );
      const merged = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(merged.tasks.done!.status).toBe("merged");
      const donePath = path.join(runtime.store.tasksDir, "done.md");
      const before = fs.readFileSync(donePath, "utf8");
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            const current = parseTaskFile(
              fs.readFileSync(donePath, "utf8"),
              "done",
            );
            fs.writeFileSync(
              donePath,
              renderTaskFile({
                ...current,
                revision: 1,
                body: "Amended.\nDone when: done still works.",
              }),
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "leave alpha",
                stallRoutes: [
                  {
                    slug: "alpha",
                    action: "leave",
                    reason: "needs the architect",
                  },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runStallPm(runtime, {
        iteration: 1,
        state: merged,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(causeText(validations[0]!.cause)).toContain(
        'frozen task "done" was edited',
      );
      expect(fs.readFileSync(donePath, "utf8")).toBe(before);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("cancels a parked slug with a kernel record and writes no task", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "cancel alpha",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "cancel",
                  reason: "the direction is gone",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result).toEqual({ continued: [], left: ["alpha"] });
      const records = await runtime.store.listRecords();
      const cancel = records.find(
        (r) => r.step === "cancel" && r.slug === "alpha",
      );
      expect(cancel?.cause).toEqual({
        kind: "note",
        detail: "the direction is gone",
      });
      expect(await runtime.store.listDir("tasks")).toEqual(["alpha.md"]);
      const after = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(after.tasks.alpha!.status).toBe("cancelled");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("rejects editing the parked task file", async () => {
    const { repo, runtime, harness, state } = await stallFixture(["alpha"]);
    try {
      const before = fs.readFileSync(
        path.join(runtime.store.tasksDir, "alpha.md"),
        "utf8",
      );
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            fs.appendFileSync(
              path.join(runtime.store.tasksDir, "alpha.md"),
              "\nEdited by the stall turn.\n",
              "utf8",
            );
            ctx.writeOutcome(
              outcome({
                summary: "leave alpha",
                stallRoutes: [
                  { slug: "alpha", action: "leave", reason: "stays" },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(causeText(validations[0]!.cause)).toContain("never edits");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
      ).toBe(before);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("requires one route per parked slug", async () => {
    const { repo, runtime, harness, state } = await stallFixture([
      "alpha",
      "beta",
    ]);
    try {
      for (let i = 0; i < 2; i++) {
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(
              outcome({
                summary: "route alpha only",
                stallRoutes: [
                  { slug: "alpha", action: "leave", reason: "stays" },
                ],
              }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "pm" }) },
        );
      }
      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha", "beta"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["alpha", "beta"]);
      const validations = (await runtime.store.listRecords()).filter(
        (r) => r.step === "pm-validate",
      );
      expect(causeText(validations[0]!.cause)).toContain(
        'slug "beta" has no route',
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps the stall continuation for the next boundary's pack instead of cancelling it", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n## alpha\nParked work.\n",
        "utf8",
      );
      await runtime.store.writeTask(
        task("alpha", {
          scope: ["alpha.txt"],
          body: "Do alpha.\nDone when: alpha works.",
        }),
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug: "alpha", round: 1 }),
        { ok: true, cause: cause("blocked: alpha stuck") },
      );
      await runtime.store.writeTask(
        task("beta", {
          scope: ["alpha.txt"],
          base: "alpha",
          source: "stall: 1",
          body: "Retry.\nDone when: alpha works.",
        }),
      );
      // Unplanned and ready: no bullet means no cancellation; it stays open.
      await runtime.store.writeTask(
        task("gamma", {
          scope: ["gamma.txt"],
          body: "Do gamma.\nDone when: gamma works.",
        }),
      );
      harness.script((req, ctx) => {
        fs.appendFileSync(
          path.join(runtime.store.goalDir, "plan.md"),
          "\n## note\nThe stall continuation stands.\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "plan stands", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "files stand" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain("| beta |");
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.step === "cancel" && r.slug === "beta"),
      ).toBe(false);
      expect(
        records.some((r) => r.step === "cancel" && r.slug === "gamma"),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("PM over plan scopes", () => {
  function scopedRuntime(): {
    root: string;
    runtime: KernelRuntime;
    fake: FakeHarness;
  } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pm-scopes-"));
    const fake = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    const runtime = runtimeFor(fake, root);
    fs.mkdirSync(path.join(runtime.store.goalDir, "epics"), {
      recursive: true,
    });
    fs.mkdirSync(runtime.store.tasksDir, { recursive: true });
    fs.writeFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      [
        "# Plan",
        "",
        "## Architect register",
        "",
        "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i1 | active",
        "- epic `billing` | architect `subarchitect` | plan `epics/billing.md` | scope `src/billing/**` | opened i1 | active",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(runtime.store.goalDir, "epics/auth.md"),
      "# Epic auth\n\n- auth.login — Add login.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(runtime.store.goalDir, "epics/billing.md"),
      "# Epic billing\n\n- billing.invoice — Add invoices.\n",
      "utf8",
    );
    return { root, runtime, fake };
  }

  it("derives tasks from both epic plans and names each plan in the prompt", async () => {
    const { root, runtime, fake } = scopedRuntime();
    try {
      const authPlan = path.join(runtime.store.goalDir, "epics/auth.md");
      const billingPlan = path.join(runtime.store.goalDir, "epics/billing.md");
      fake.script((req, ctx) => {
        expect(req.prompt).toContain(`- epic \`auth\`: ${authPlan}`);
        expect(req.prompt).toContain(`- epic \`billing\`: ${billingPlan}`);
        for (const [epic, planPath] of [
          ["auth", authPlan],
          ["billing", billingPlan],
        ] as const) {
          const plan = fs.readFileSync(planPath, "utf8");
          for (const match of plan.matchAll(/^- (\S+) —/gmu)) {
            const slug = match[1]!;
            const taskFile = task(slug, {
              epic,
              scope: [`src/${epic}/${slug.split(".")[1]}.ts`],
              source: "plan",
            });
            fs.writeFileSync(
              path.join(runtime.store.tasksDir, `${slug}.md`),
              renderTaskFile(taskFile),
              "utf8",
            );
          }
        }
        ctx.writeOutcome(outcome({ summary: "derived both epic plans" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: root,
      });
      expect(result.status).toBe("done");
      const tasks = await runtime.store.listTasks();
      expect(tasks.map((entry) => [entry.slug, entry.epic])).toEqual([
        ["auth.login", "auth"],
        ["billing.invoice", "billing"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores an edit to any epic plan and reports which plan changed", async () => {
    const { root, runtime, fake } = scopedRuntime();
    try {
      const authPlan = path.join(runtime.store.goalDir, "epics/auth.md");
      const billingPlan = path.join(runtime.store.goalDir, "epics/billing.md");
      const authBefore = fs.readFileSync(authPlan, "utf8");
      const billingBefore = fs.readFileSync(billingPlan, "utf8");
      fake.script((req, ctx) => {
        fs.appendFileSync(authPlan, "\n## smuggled\n", "utf8");
        fs.appendFileSync(billingPlan, "\n## smuggled\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "edited both plans" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain(
          "epics/auth.md changed during the PM turn; restored",
        );
        expect(req.prompt).toContain(
          "epics/billing.md changed during the PM turn; restored",
        );
        ctx.writeOutcome(outcome({ summary: "left the plans alone" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(fs.readFileSync(authPlan, "utf8")).toBe(authBefore);
      expect(fs.readFileSync(billingPlan, "utf8")).toBe(billingBefore);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies each plan's cancellation only to the tasks that plan owns", async () => {
    const { root, runtime, fake } = scopedRuntime();
    try {
      await runtime.store.writeTask(
        task("auth.old", {
          epic: "auth",
          scope: ["src/auth/old.ts"],
          body: "Old auth work.\nDone when: it works.",
        }),
      );
      await runtime.store.writeTask(
        task("billing.old", {
          epic: "billing",
          scope: ["src/billing/old.ts"],
          body: "Old billing work.\nDone when: it works.",
        }),
      );
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "epics/auth.md"),
        [
          "cancelled: auth.old — auth replaced it",
          "cancelled: billing.old — an epic plan cannot retire this",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "epics/billing.md"),
        "cancelled: billing.old — billing replaced it\n",
        "utf8",
      );
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "applied both plans" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive(await runtime.store.listTasks(), []),
        cwd: root,
      });
      expect(result.status).toBe("done");
      const cancels = (await runtime.store.listRecords())
        .filter((record) => record.step === "cancel")
        .map((record) => [record.slug, causeText(record.cause)]);
      expect(cancels).toEqual([
        ["auth.old", "auth replaced it"],
        ["billing.old", "billing replaced it"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
