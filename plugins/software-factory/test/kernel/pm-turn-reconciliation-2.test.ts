import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runPm } from "../../src/kernel/pm.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  simpleTask,
  writePlan,
} from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

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
      artifacts: { backend: "folder", root },
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

async function climbsFromBaseTierFailedBlockedPart1(
  fake: FakeHarness,
  runtime: KernelRuntime,
  root: string,
) {
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
    expect(req.prompt).toContain("status blocked: Which task owns the API?");
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

  return { result };
}

async function climbsFromBaseTierFailedBlockedPart2(
  runtime: KernelRuntime,
  scope: Awaited<ReturnType<typeof climbsFromBaseTierFailedBlockedPart1>>,
) {
  const { result } = scope;
  expect(result.rungs.map((rung) => [rung.round, rung.alias])).toEqual([
    [1, "pm"],
    [2, "pm"],
  ]);
  expect(result.rungs[0]!.failure).toContain("status failed: plan underivable");
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
}

function registerPMTurnReconciliationPart6(): void {
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
}

function registerPMTurnReconciliationPart7(): void {
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
}

function registerPMTurnReconciliationPart8(): void {
  it("climbs from base-tier failed and blocked answers with their reasons as findings", async () => {
    const { root, runtime, fake, planPath } = await ladderSetup(["escalation"]);
    try {
      const scope1 = await climbsFromBaseTierFailedBlockedPart1(
        fake,
        runtime,
        root,
      );
      await climbsFromBaseTierFailedBlockedPart2(runtime, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPMTurnReconciliationPart9(): void {
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
}

function registerPMTurnReconciliationPart10(): void {
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
}

describe("PM turn reconciliation", () => {
  registerPMTurnReconciliationPart6();

  registerPMTurnReconciliationPart7();

  registerPMTurnReconciliationPart8();

  registerPMTurnReconciliationPart9();

  registerPMTurnReconciliationPart10();
});
