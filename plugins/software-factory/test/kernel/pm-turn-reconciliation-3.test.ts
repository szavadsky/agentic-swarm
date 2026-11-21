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
import { parseTaskFile } from "../../src/kernel/tasks.js";
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
import { cause } from "./helpers.js";
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

async function blocksIterationEveryRungAsAliasPart1(
  goal: ReturnType<typeof makeGoal>,
) {
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

  return { pm };
}

async function blocksIterationEveryRungAsAliasPart2(
  scope: Awaited<ReturnType<typeof blocksIterationEveryRungAsAliasPart1>>,
) {
  const { pm } = scope;
  expect(pm.map((record) => [record.round, record.alias])).toEqual([
    [1, "pm"],
    [2, "pm"],
    [3, "escalation"],
    [4, "escalation"],
  ]);
}

async function blocksEscalatedQuestionNoFurtherPart1(
  goal: ReturnType<typeof makeGoal>,
) {
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

  return { pm };
}

async function blocksEscalatedQuestionNoFurtherPart2(
  scope: Awaited<ReturnType<typeof blocksEscalatedQuestionNoFurtherPart1>>,
) {
  const { pm } = scope;
  expect(pm.map((record) => record.round)).toEqual([1, 2, 3]);
}

function registerPMTurnReconciliationPart11(): void {
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
        "  qa: { harness: fake, model: fake-qa }",
        "  steward: { harness: fake, model: fake-steward }",
        "  plan-checker: { harness: fake, model: fake-check }",
        "  intent: { harness: fake, model: fake-intent }",
        "  plan-reviewer: { harness: fake, model: fake-plan-review }",
        "  pack-preparer: { harness: fake, model: fake-pack-prep }",
        "limits: { iterations: 1, concurrency: { overall: 1, perSubscription: {}, perModel: {} } }",
        "",
      ].join("\n"),
    });
    try {
      const scope1 = await blocksIterationEveryRungAsAliasPart1(goal);
      await blocksIterationEveryRungAsAliasPart2(scope1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}

function registerPMTurnReconciliationPart12(): void {
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
        "  qa: { harness: fake, model: fake-qa }",
        "  steward: { harness: fake, model: fake-steward }",
        "  plan-checker: { harness: fake, model: fake-check }",
        "  intent: { harness: fake, model: fake-intent }",
        "  plan-reviewer: { harness: fake, model: fake-plan-review }",
        "  pack-preparer: { harness: fake, model: fake-pack-prep }",
        "limits: { iterations: 1, concurrency: { overall: 1, perSubscription: {}, perModel: {} } }",
        "",
      ].join("\n"),
    });
    try {
      const scope1 = await blocksEscalatedQuestionNoFurtherPart1(goal);
      await blocksEscalatedQuestionNoFurtherPart2(scope1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}

function registerPMTurnReconciliationPart13(): void {
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
}

function registerPMTurnReconciliationPart14(): void {
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
}

function registerPMTurnReconciliationPart15(): void {
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
}

describe("PM turn reconciliation", () => {
  registerPMTurnReconciliationPart11();

  registerPMTurnReconciliationPart12();

  registerPMTurnReconciliationPart13();

  registerPMTurnReconciliationPart14();

  registerPMTurnReconciliationPart15();
});
