import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { forwardedConcerns } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function scriptConflict(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "task\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "task side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/**
 * Another task's merge lands on the integration branch before this task starts,
 * so the task branch's squash has a conflicting file when the queue reaches it.
 */
function landIntegrationChange(repo: TmpRepo, checkout: string): void {
  fs.writeFileSync(
    path.join(checkout, "conflict.txt"),
    "integration\n",
    "utf8",
  );
  repo.git(["add", "conflict.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent integration change"], {
    cwd: checkout,
  });
}

/**
 * A resolve turn that reports done but leaves the conflict markers in place.
 * The flow parks the branch with the conflict and the wave-end steward owns it:
 * the fallback for a resolution the in-flow turn could not settle.
 */
function scriptResolveLeavesConflict(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "resolve left the conflict" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "resolve" }), fallback: true },
  );
}

const stewardAliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

async function readiesDependentsAfterLandingPart1(repo: TmpRepo, goal: string) {
  const harness = new FakeHarness({ id: "fake" });
  scriptResolveLeavesConflict(harness);
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "task\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(req.cwd!, "conflict.txt"),
      "steward-resolved\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "steward resolved beta" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "gamma.txt"), "gamma\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "gamma side" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  const beta = task("beta", { scope: ["conflict.txt"] });
  await writeTask(runtime, beta);

  return { runtime, beta };
}

async function readiesDependentsAfterLandingPart2(
  repo: TmpRepo,
  checkout: string,
  scope: Awaited<ReturnType<typeof readiesDependentsAfterLandingPart1>>,
) {
  const { runtime, beta } = scope;
  await writeTask(
    runtime,
    task("gamma", { deps: ["beta"], scope: ["gamma.txt"] }),
  );
  await ensureTaskWorktree(runtime, beta);
  landIntegrationChange(repo, checkout);
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  expect(state.tasks.gamma!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "steward-resolved",
  );
  const stewardSeq = records.find(
    (r) => r.slug === "beta" && r.step === "steward",
  )!.seq;
  const gammaSeq = records.find(
    (r) => r.slug === "gamma" && r.step === "implement",
  )!.seq;
  expect(gammaSeq).toBeGreaterThan(stewardSeq);
}

function registerStewardPart5(): void {
  it("resolves the parked conflict, then merges", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the steward (merge agent)");
        expect(req.prompt).toContain("conflict.txt");
        fs.writeFileSync(
          path.join(req.cwd!, "conflict.txt"),
          "steward-resolved\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "steward resolved" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(
        repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
      ).toBe("steward-resolved");
      const stewardTurn = records.find(
        (r) => r.slug === "task" && r.step === "steward" && r.actor === "agent",
      )!;
      expect(stewardTurn.session?.compacted).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart6(): void {
  it("leaves an architect pointer when the conflict is unresolvable", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "steward could not resolve" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      const records = await runtime.store.listRecords();
      const pointers = forwardedConcerns(records).filter((c) =>
        c.text.startsWith("steward: task unmerged"),
      );
      expect(pointers.length).toBe(1);
      expect(pointers[0]!.calibration).toBe("architect");
      expect(pointers[0]!.text).toContain("factory-task/demo/task");
      expect(pointers[0]!.text).toContain("worktree");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart7(): void {
  it("readies dependents after landing: unmerged work relaunches on the new head", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      limits: { concurrency: { overall: 1 } },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await readiesDependentsAfterLandingPart1(repo, goal);
      await readiesDependentsAfterLandingPart2(repo, checkout, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** Scripts the conflict, a red gate on the steward's resolve, and the continuation fix. */
function scriptGatedStewardResolve(harness: FakeHarness): void {
  scriptConflict(harness);
  scriptResolveLeavesConflict(harness);
  harness.script((req, ctx) => {
    fs.writeFileSync(
      path.join(req.cwd!, "conflict.txt"),
      "steward-resolved\n",
      "utf8",
    );
    ctx.writeOutcome(
      outcome({ summary: "steward resolved, gates will judge" }),
    );
    return fakeTurnResult(req);
  });
  scriptStallLeave(harness, ["task"]);
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "conflict.txt"), "fixed\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "continuation fix" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/** The red gate holds the merge and leaves exactly one architect pointer. */
async function expectRedMergeHeldWithPointer(
  runtime: KernelRuntime,
): Promise<void> {
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  // The resolved merge went red, so the steward held with a pointer.
  expect(state.tasks.task!.status).toBe("parked");
  expect(
    records.some(
      (r) => r.slug === "task" && r.step === "merge-checks" && r.ok === false,
    ),
  ).toBe(true);
  expect(
    forwardedConcerns(records).filter((c) =>
      c.text.startsWith("steward: task unmerged"),
    ).length,
  ).toBe(1);
}

/** The relaunch ports onto the head the steward left and lands. */
async function expectContinuationMergesOnStewardHead(
  runtime: KernelRuntime,
  repo: TmpRepo,
): Promise<void> {
  await writeTask(
    runtime,
    task("task-fix", { base: "task", scope: ["conflict.txt"] }),
  );
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks["task-fix"]!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim()).toBe(
    "fixed",
  );
}

function registerStewardPart8(): void {
  it("runs gates on the resolved merge: red holds, a continuation relaunches on the new head", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: stewardAliases,
      gates: [
        { id: "content", command: "! grep -q steward-resolved conflict.txt" },
      ],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptGatedStewardResolve(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      await expectRedMergeHeldWithPointer(runtime);
      await expectContinuationMergesOnStewardHead(runtime, repo);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("steward", () => {
  registerStewardPart5();

  registerStewardPart6();

  registerStewardPart7();

  registerStewardPart8();
});
