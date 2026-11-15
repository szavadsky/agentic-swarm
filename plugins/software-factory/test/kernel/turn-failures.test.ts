import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult, type FakeTurnHandler } from "../../src/harness/fake/index.js";
import type { TurnResult } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

/**
 * The M2 done-when, one clause each: a valid outcome survives an infra or
 * cancelled stop, a throwing task is recorded while siblings continue, an
 * unstartable gate is recorded as infra, a wall-clock bound stops the turn and
 * the iteration. Budget accounting is covered by repro-e7-infra-timeout.
 */
describe("turn failures — outcome, crash and wall-clock handling", () => {
  it("keeps a valid outcome delivered on an infra stop and advances on the relaunch", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req, { stop: { kind: "infra", cause: "timeout", details: "idle 30m" } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "a approved", verdict: "approve" }));
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
      const implement = records.find((r) => r.slug === "a" && r.step === "implement" && r.actor === "agent");
      expect(implement?.outcome?.summary).toBe("a implemented");
      expect(implement?.stop?.kind).toBe("infra");
      const checks = records.find((r) => r.slug === "a" && r.step === "checks");
      expect(checks?.ok).toBe(true);
      let state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.phase).toBe("review");

      // A relaunch advances on the kept outcome instead of redispatching implement.
      const second = await runDispatch(runtime, { iteration: 2 });
      expect(second.reason).toBe("boundary");
      records = await runtime.store.listRecords();
      state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("merged");
      expect(records.filter((r) => r.slug === "a" && r.step === "implement" && r.actor === "agent")).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps a valid outcome delivered on a cancelled stop", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req, { stop: { kind: "cancelled" } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "a approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      const first = await runDispatch(runtime, { iteration: 1 });
      expect(first.reason).toBe("cancelled");
      expect(harness.calls).toHaveLength(1);
      let records = await runtime.store.listRecords();
      const implement = records.find((r) => r.slug === "a" && r.step === "implement" && r.actor === "agent");
      expect(implement?.outcome?.summary).toBe("a implemented");
      expect(implement?.stop?.kind).toBe("cancelled");
      let state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.phase).toBe("review");

      const second = await runDispatch(runtime, { iteration: 2 });
      records = await runtime.store.listRecords();
      state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("merged");
      expect(second.reason).toBe("boundary");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not stamp a real red gate infra for printing an install-looking error", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: "echo 'Cannot find module x'; exit 1" }],
      limits: { concurrency: 1 },
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
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      await runDispatch(runtime, { iteration: 1 });
      const records = await runtime.store.listRecords();
      const checks = records.find((r) => r.slug === "a" && r.step === "checks");
      expect(checks?.ok).toBe(false);
      expect(checks?.checks?.[0]?.summary).toBe("exit 1");
      expect((checks?.checks?.[0]?.details as { kind?: unknown } | undefined)?.kind).not.toBe("infra");

      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.cause ?? "").not.toContain("infra: gate");
      expect(state.tasks.a!.status).not.toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("records an unstartable gate as infra and parks as infra, never empty-diff", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "typecheck", command: "factory-missing-command-xyz-123" }],
      limits: { concurrency: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));

      await runDispatch(runtime, { iteration: 1 });
      expect(harness.calls).toHaveLength(1);
      const records = await runtime.store.listRecords();
      const checks = records.find((r) => r.slug === "a" && r.step === "checks");
      expect(checks?.ok).toBe(false);
      expect(checks?.checks?.[0]?.summary).toBe("exit 127");
      expect(checks?.checks?.[0]?.details).toMatchObject({ kind: "infra" });

      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("parked");
      expect(state.tasks.a!.cause).toContain("infra: gate could not start: typecheck");
      expect(state.tasks.a!.cause).not.toContain("empty-diff");
      const park = records.find((r) => r.slug === "a" && r.step === "park");
      expect(park?.cause).toContain("infra: gate could not start: typecheck");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("records a throwing task as an infra crash and the sibling continues", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 2 } });
    try {
      const implement: FakeTurnHandler = (req, ctx) => {
        const slug = path.basename(req.cwd!);
        if (slug === "a") throw new Error("simulated kill in a");
        fs.writeFileSync(path.join(req.cwd!, "b.txt"), "b\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "b implemented" }));
        return fakeTurnResult(req);
      };
      const harness = new FakeHarness({ id: "fake" });
      // Whichever task shifts which handle, both slugs are served.
      harness.script(implement);
      harness.script(implement);
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "b approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain("a: crash: simulated kill in a");
      const records = await runtime.store.listRecords();
      const aCrash = records.find(
        (r) => r.slug === "a" && r.step === "implement" && r.actor === "script"
      );
      expect(aCrash?.ok).toBe(false);
      expect(aCrash?.cause).toBe("crash: simulated kill in a");
      expect(aCrash?.stop).toEqual({ kind: "infra", cause: "crash", details: "simulated kill in a" });
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.b!.status).toBe("merged");
      expect(state.tasks.a!.status).not.toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("records a non-Error throw with its crash cause instead of 'crash: undefined'", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
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
        (r) => r.slug === "a" && r.step === "implement" && r.actor === "script"
      );
      expect(crash?.cause).toBe("crash: simulated non-error failure");
      expect(crash?.stop).toEqual({ kind: "infra", cause: "crash", details: "simulated non-error failure" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stops a turn at the turn wall bound set by limits.turnMinutes", async () => {
    // 0.0005 minute = 30ms; the handler never settles, so only the bound ends the turn.
    const { repo, goal } = setupFlowRepo({ limits: { turnMinutes: 0.0005, concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(() => new Promise<TurnResult>(() => {}));
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      expect((runtime.limits as { turnMinutes?: number }).turnMinutes).toBe(0.0005);
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
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.turns).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stops an iteration at the wall bound set by limits.iterationMinutes before dispatching anything", async () => {
    // ~0.06ms rounds to 0: the bound is already reached when the loop first reads the clock.
    const { repo, goal } = setupFlowRepo({ limits: { iterationMinutes: 0.000001, concurrency: 1 } });
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
});
