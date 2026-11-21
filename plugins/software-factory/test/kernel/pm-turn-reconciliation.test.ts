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
import { outcome, simpleTask } from "./e2e-helpers.js";
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

async function restoresFailedRungSTaskWritesFromPart1(
  runtime: KernelRuntime,
  planPath: string,
  fake: FakeHarness,
) {
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
      fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
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

  return { before, state };
}

async function restoresFailedRungSTaskWritesFromPart2(
  runtime: KernelRuntime,
  root: string,
  scope: Awaited<ReturnType<typeof restoresFailedRungSTaskWritesFromPart1>>,
) {
  const { state, before } = scope;
  const result = await runPm(runtime, {
    iteration: 1,
    state,
    cwd: root,
  });
  expect(result.status).toBe("done");
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
  ).toBe(before);
  expect(fs.existsSync(path.join(runtime.store.tasksDir, "b.md"))).toBe(false);
}

async function keepsDroppedTaskOpenCancelsOnlyPart1(
  planPath: string,
  runtime: KernelRuntime,
) {
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
}

async function keepsDroppedTaskOpenCancelsOnlyPart2(
  runtime: KernelRuntime,
  fake: FakeHarness,
) {
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

  return { state };
}

async function keepsDroppedTaskOpenCancelsOnlyPart3(
  runtime: KernelRuntime,
  root: string,
  scope: Awaited<ReturnType<typeof keepsDroppedTaskOpenCancelsOnlyPart2>>,
) {
  const { state } = scope;
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
}

function registerPMTurnReconciliationPart3(): void {
  it("restores a failed rung's task writes from the pre-PM snapshot", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const scope1 = await restoresFailedRungSTaskWritesFromPart1(
        runtime,
        planPath,
        fake,
      );
      await restoresFailedRungSTaskWritesFromPart2(runtime, root, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a dropped task open and cancels only the slug the plan names cancelled", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      await keepsDroppedTaskOpenCancelsOnlyPart1(planPath, runtime);
      const scope2 = await keepsDroppedTaskOpenCancelsOnlyPart2(runtime, fake);
      await keepsDroppedTaskOpenCancelsOnlyPart3(runtime, root, scope2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPMTurnReconciliationPart4(): void {
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
}

function registerPMTurnReconciliationPart5(): void {
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
}

describe("PM turn reconciliation", () => {
  registerPMTurnReconciliationPart3();

  registerPMTurnReconciliationPart4();

  registerPMTurnReconciliationPart5();
});
