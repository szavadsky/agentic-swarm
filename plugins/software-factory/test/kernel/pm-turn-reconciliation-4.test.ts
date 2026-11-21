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
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  cleanup,
  makeGoal,
  outcome,
  simpleTask,
  writeTask as writeGoalTask,
  writePlan,
} from "./e2e-helpers.js";
import { withKernelRoleFallbacks, workCalls } from "./fake-defaults.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

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

function registerPMTurnReconciliationPart16(): void {
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
}

function registerPMTurnReconciliationPart17(): void {
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
}

function registerPMTurnReconciliationPart18(): void {
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
}

function registerPMLadderBaselinePart1(): void {
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
}

function registerPMLadderBaselinePart2(): void {
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
}

function registerPMLadderBaselinePart3(): void {
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
}

describe("PM turn reconciliation", () => {
  registerPMTurnReconciliationPart16();

  registerPMTurnReconciliationPart17();

  registerPMTurnReconciliationPart18();
});

describe("PM ladder baseline", () => {
  registerPMLadderBaselinePart1();

  registerPMLadderBaselinePart2();

  registerPMLadderBaselinePart3();
});
