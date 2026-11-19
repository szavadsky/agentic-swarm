// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { TurnResult } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
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
  it("keeps a valid outcome delivered on an infra stop and advances on the relaunch", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req, {
          stop: { kind: "infra", cause: "timeout", details: "idle 30m" },
        });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "a approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      const first = await runDispatch(runtime, { iteration: 1 });
      expect(first.reason).toBe("infra");
      // The infra stop refuses further actions for the faulted task in this
      // launch; the outcome itself is kept.
      expect(harness.calls).toHaveLength(1);
      let records = await runtime.store.listRecords();
      const implement = records.find(
        (r) => r.slug === "a" && r.step === "implement" && r.actor === "agent",
      );
      expect(implement?.outcome?.summary).toBe("a implemented");
      expect(implement?.stop?.kind).toBe("infra");
      const checks = records.find((r) => r.slug === "a" && r.step === "checks");
      expect(checks?.ok).toBe(true);
      let state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.phase).toBe("review");

      // A relaunch advances on the kept outcome instead of redispatching implement.
      const second = await runDispatch(runtime, { iteration: 2 });
      expect(second.reason).toBe("boundary");
      records = await runtime.store.listRecords();
      state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).toBe("merged");
      expect(
        records.filter(
          (r) =>
            r.slug === "a" && r.step === "implement" && r.actor === "agent",
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps a valid outcome delivered on a cancelled stop", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req, { stop: { kind: "cancelled" } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "a approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      const first = await runDispatch(runtime, { iteration: 1 });
      expect(first.reason).toBe("cancelled");
      expect(harness.calls).toHaveLength(1);
      let records = await runtime.store.listRecords();
      const implement = records.find(
        (r) => r.slug === "a" && r.step === "implement" && r.actor === "agent",
      );
      expect(implement?.outcome?.summary).toBe("a implemented");
      expect(implement?.stop?.kind).toBe("cancelled");
      let state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.phase).toBe("review");

      const second = await runDispatch(runtime, { iteration: 2 });
      records = await runtime.store.listRecords();
      state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).toBe("merged");
      expect(second.reason).toBe("boundary");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not stamp a real red gate infra for printing an install-looking error", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: "echo 'Cannot find module x'; exit 1" }],
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        // The retry commits nothing: the red stays the task's own.
        ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["a"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      await runDispatch(runtime, { iteration: 1 });
      const records = await runtime.store.listRecords();
      const checks = records.find((r) => r.slug === "a" && r.step === "checks");
      expect(checks?.ok).toBe(false);
      expect(checks?.checks?.[0]?.summary).toBe("exit 1");
      expect(
        (checks?.checks?.[0]?.details as { kind?: unknown } | undefined)?.kind,
      ).not.toBe("infra");

      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.cause ?? "").not.toContain("infra: gate");
      expect(state.tasks.a!.status).not.toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("records an unstartable gate as infra and parks as infra, never empty-diff", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "typecheck", command: "factory-missing-command-xyz-123" }],
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["a"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      await runDispatch(runtime, { iteration: 1 });
      // One implement turn plus the stall turn that leaves the infra park for the architect.
      expect(harness.calls).toHaveLength(2);
      expect(fakeTurnIdentity(harness.calls[1]!).step).toBe("pm");
      const records = await runtime.store.listRecords();
      const checks = records.find((r) => r.slug === "a" && r.step === "checks");
      expect(checks?.ok).toBe(false);
      expect(checks?.checks?.[0]?.summary).toBe("exit 127");
      expect(checks?.checks?.[0]?.details).toMatchObject({ kind: "infra" });

      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).toBe("parked");
      expect(state.tasks.a!.cause).toContain(
        "infra: gate could not start: typecheck",
      );
      expect(state.tasks.a!.cause).not.toContain("empty-diff");
      const park = records.find((r) => r.slug === "a" && r.step === "park");
      expect(park?.cause).toContain("infra: gate could not start: typecheck");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("records a throwing task as an infra crash and the sibling continues", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 2 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      // Each turn is bound to its slug and step, so the thrower can never be
      // consumed by the sibling's turn (or vice versa) under load.
      harness.script(
        (): TurnResult => {
          throw new Error("simulated kill in a");
        },
        { when: whenTurn({ slug: "a", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "b.txt"), "b\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "b implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "b", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "b approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "b", step: "review" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain("a: crash: simulated kill in a");
      const records = await runtime.store.listRecords();
      const aCrash = records.find(
        (r) => r.slug === "a" && r.step === "implement" && r.actor === "script",
      );
      expect(aCrash?.ok).toBe(false);
      expect(aCrash?.cause).toBe("crash: simulated kill in a");
      expect(aCrash?.stop).toEqual({
        kind: "infra",
        cause: "crash",
        details: "simulated kill in a",
      });
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.b!.status).toBe("merged");
      expect(state.tasks.a!.status).not.toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("records a non-Error throw with its crash cause instead of 'crash: undefined'", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((): TurnResult => {
        // A throw that is not an Error must still produce a cause, never "crash: undefined".
        throw "simulated non-error failure";
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain("crash: simulated non-error failure");
      const records = await runtime.store.listRecords();
      const crash = records.find(
        (r) => r.slug === "a" && r.step === "implement" && r.actor === "script",
      );
      expect(crash?.cause).toBe("crash: simulated non-error failure");
      expect(crash?.stop).toEqual({
        kind: "infra",
        cause: "crash",
        details: "simulated non-error failure",
      });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stops a turn at the turn wall bound set by limits.turnMinutes", async () => {
    // 0.0005 minute = 30ms; the handler returns past the bound, so only the bound ends the turn.
    const { repo, goal } = setupFlowRepo({
      limits: { turnMinutes: 0.0005, concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      expect(runtime.limits.turnMinutes).toBe(0.0005);
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      const records = await runtime.store.listRecords();
      const turn = records.find((r) => r.slug === "a" && r.actor === "agent");
      expect(turn?.stop?.kind).toBe("infra");
      if (turn?.stop?.kind === "infra") {
        expect(turn.stop.cause).toBe("timeout");
        expect(turn.stop.details).toContain("wall clock");
      }
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.turns).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("times out without committing the orphan's writes and resets the tree", async () => {
    // 30ms bound; the orphan writes before it, sleeps past it, then writes again.
    const { repo, goal } = setupFlowRepo({
      limits: { turnMinutes: 0.0005, concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(async (req) => {
        fs.writeFileSync(path.join(req.cwd, "orphan.txt"), "before\n", "utf8");
        await new Promise((resolve) => setTimeout(resolve, 150));
        fs.writeFileSync(
          path.join(req.cwd, "orphan.txt"),
          "before\nlate\n",
          "utf8",
        );
        fs.writeFileSync(path.join(req.cwd, "late.txt"), "late\n", "utf8");
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

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
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
      expect(fs.existsSync(path.join(wtPath, "late.txt"))).toBe(false);
      expect(repo.git(["status", "--porcelain"], { cwd: wtPath }).stdout).toBe(
        "",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps a valid outcome written before the bound on a timed-out turn", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { turnMinutes: 0.0005, concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(async (req, ctx) => {
        ctx.writeOutcome(outcome({ status: "done", summary: "early" }));
        fs.writeFileSync(path.join(req.cwd, "orphan.txt"), "before\n", "utf8");
        await new Promise((resolve) => setTimeout(resolve, 150));
        fs.writeFileSync(
          path.join(req.cwd, "orphan.txt"),
          "before\nlate\n",
          "utf8",
        );
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const taskFile = task("a", { scope: ["a.txt"] });
      await writeTask(runtime, taskFile);
      const wtPath = (await ensureTaskWorktree(runtime, taskFile)).path;
      const startTree = await treeSha(wtPath);

      await runDispatch(runtime, { iteration: 1 });
      const records = await runtime.store.listRecords();
      const turn = records.find((r) => r.slug === "a" && r.actor === "agent");
      expect(turn?.stop?.kind).toBe("infra");
      if (turn?.stop?.kind === "infra") {
        expect(turn.stop.cause).toBe("timeout");
      }
      expect(turn?.outcome?.status).toBe("done");
      expect(turn?.outcome?.summary).toBe("early");
      expect(turn?.commit).toBeUndefined();
      expect(await treeSha(wtPath)).toBe(startTree);
      expect(fs.existsSync(path.join(wtPath, "orphan.txt"))).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
