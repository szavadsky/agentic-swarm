import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task, cause } from "./helpers.js";
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

function registerMergeConflictsPart1(): void {
  it("defers a steward leg that stops on infra and names it at the stop", async () => {
    const { repo, goal } = setupFlowRepo();
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: {
            kind: "infra",
            cause: "auth",
            details:
              "provider.no-route Model unavailable: local-host/missing-free",
          },
        }),
      );
      // The dead leg leaves the conflict parked, so the wave-end stall PM
      // still decides it before the launch reports the fault.
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      // The dead candidate is named: the launch stops for its slug, not for a
      // bare cause that outlived the wave.
      expect(result.cause).toEqual({
        kind: "boundary",
        detail:
          "task: auth: provider.no-route Model unavailable: local-host/missing-free",
      });
      // Implement, QA and review compacted; the infra-stopped steward turn did not.
      expect(harness.compactions).toHaveLength(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMergeConflictsPart2(): void {
  it("does not compact a steward turn that ends in a refusal", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: { harness: "fake", model: "fake-impl" },
        reviewer: { harness: "fake", model: "fake-review" },
        steward: { harness: "fake", model: "fake-steward" },
        "plan-checker": { harness: "fake", model: "fake-check" },
        intent: { harness: "fake", model: "fake-intent" },
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
        "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      },
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptConflict(harness);
      scriptResolveLeavesConflict(harness);
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "content policy" },
        }),
      );
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["conflict.txt"] });
      await writeTask(runtime, file);
      await ensureTaskWorktree(runtime, file);
      landIntegrationChange(repo, checkout);
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      // Implement, QA and review compacted; the refused steward turn did not.
      expect(harness.compactions).toHaveLength(3);
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.step === "steward" && r.slug === "task"),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMergeConflictsPart3(): void {
  it("parks with the conflict and hands the branch to the steward", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: { harness: "fake", model: "fake-impl" },
        reviewer: { harness: "fake", model: "fake-review" },
        steward: { harness: "fake", model: "fake-steward" },
        "plan-checker": { harness: "fake", model: "fake-check" },
        intent: { harness: "fake", model: "fake-intent" },
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
        "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      },
    });
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
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause?.kind === "conflict").toBe(true);
      expect(
        records.filter(
          (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
        ).length,
      ).toBe(0);
      expect(
        repo.git(["show", "factory/demo:conflict.txt"]).stdout.trim(),
      ).toBe("integration");
      expect(
        records.some((r) => r.step === "steward" && r.slug === "task"),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerStewardPart1(): void {
  it("skips (and records) when the wave merges clean and green", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: stewardAliases });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "clean.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "clean task" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["clean.txt"] }));
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
      const skip = records.find((r) => r.step === "steward" && !r.slug);
      expect(skip?.ok).toBe(true);
      expect(skip?.cause).toEqual(cause("skipped: no conflicts"));
      expect(records.some((r) => r.step === "steward" && r.slug)).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("merge conflicts", () => {
  registerMergeConflictsPart1();

  registerMergeConflictsPart2();

  registerMergeConflictsPart3();
});

describe("steward", () => {
  registerStewardPart1();
});
