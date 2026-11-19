// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { TurnResult } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { TIMEOUT_SETTLE_GRACE_MS } from "../../src/kernel/flow.js";
import { ensureTaskWorktree, treeSha } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

describe("turn failures — outcome, crash and wall-clock handling", () => {
  it("times out a never-resolving harness after the bound plus grace and moves the launch on", async () => {
    // 30ms bound; the handler writes, then ignores the bound and never resolves.
    const { repo, goal } = setupFlowRepo({
      limits: { turnMinutes: 0.0005, concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd, "orphan.txt"), "before\n", "utf8");
        return new Promise<TurnResult>(() => {});
      });
      // Relaunch handlers: implement completes, review approves.
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "a approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const taskFile = task("a", { scope: ["a.txt"] });
      await writeTask(runtime, taskFile);
      const wtPath = (await ensureTaskWorktree(runtime, taskFile)).path;
      const startHead = repo
        .git(["rev-parse", "HEAD"], { cwd: wtPath })
        .stdout.trim();
      const startTree = await treeSha(wtPath);

      const start = Date.now();
      const result = await runDispatch(runtime, { iteration: 1 });
      const elapsed = Date.now() - start;
      expect(result.reason).toBe("infra");
      // Bound plus the fixed settle grace — the hung turn holds the launch for
      // the grace, never forever.
      expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_SETTLE_GRACE_MS - 250);
      expect(elapsed).toBeLessThan(TIMEOUT_SETTLE_GRACE_MS + 30_000);
      const records = await runtime.store.listRecords();
      const turn = records.find((r) => r.slug === "a" && r.actor === "agent");
      expect(turn?.stop?.kind).toBe("infra");
      if (turn?.stop?.kind === "infra") {
        expect(turn.stop.cause).toBe("timeout");
      }
      expect(turn?.commit).toBeUndefined();
      expect(turn?.tree).toBeUndefined();
      // No commit carries the orphan's writes: the task branch never moved.
      expect(repo.git(["rev-parse", "factory-task/demo/a"]).stdout.trim()).toBe(
        startHead,
      );
      // The worktree is back at the step's start tree.
      expect(await treeSha(wtPath)).toBe(startTree);
      expect(fs.existsSync(path.join(wtPath, "orphan.txt"))).toBe(false);

      // The launch moves on: a relaunch redispatches and merges the task.
      const second = await runDispatch(runtime, { iteration: 2 });
      expect(second.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("aborts the harness turn when the wall bound fires", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { turnMinutes: 0.0005, concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      let observed: AbortSignal | undefined;
      harness.script(async (req) => {
        observed = req.signal;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      await runDispatch(runtime, { iteration: 1 });
      expect(observed?.aborted).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("leaves the signal alone when the turn resolves before the bound", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["a"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      await runDispatch(runtime, { iteration: 1 });
      expect(harness.calls[0]?.signal).toBeDefined();
      expect(harness.calls[0]?.signal?.aborted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stops an iteration at the wall bound set by limits.iterationMinutes before dispatching anything", async () => {
    // ~0.06ms rounds to 0: the bound is already reached when the loop first reads the clock.
    const { repo, goal } = setupFlowRepo({
      limits: { iterationMinutes: 0.000001, concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      expect(runtime.limits.iterationWallMs).toBe(0);
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      expect(result.cause).toContain("wall limit");
      expect(harness.calls).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("bounds a task turn at the task file's turnMinutes", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      let seen: { wallMs: number } | undefined;
      harness.script(
        (req, ctx) => {
          seen = req.timeouts;
          fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "a implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "a approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "review" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("a", { scope: ["a.txt"], turnMinutes: 30 }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(seen?.wallMs).toBe(30 * 60_000);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("still caps the task file's turnMinutes at the run's turnMinutes", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { turnMinutes: 5, concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      let seen: { wallMs: number } | undefined;
      harness.script(
        (req, ctx) => {
          seen = req.timeouts;
          fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "a implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "a approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "review" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("a", { scope: ["a.txt"], turnMinutes: 30 }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(seen?.wallMs).toBe(5 * 60_000);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
