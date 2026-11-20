// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { workCalls } from "./fake-defaults.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  freshCounter,
  rmCounter,
  mergeOnlyGate,
  flakeRedTwice,
  writePlan,
  scriptContinueBoundary,
  stateOf,
  scriptImplementApprove,
  implementThenLand,
} from "./continuation-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

describe("parked continuation", () => {
  it("continues a task with base from the parked task's kept branch", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      // beta continues the parked alpha and merges, so the wave-end stall gets
      // the park even though the iteration merged.
      scriptStallLeave(harness, ["alpha"]);
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha is not acceptable", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(fs.existsSync(path.join(req.cwd!, "alpha.txt"))).toBe(true);
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta on top of alpha" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const integrationHead = repo
        .git(["rev-parse", "factory/demo"])
        .stdout.trim();
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
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
      expect(state.tasks.beta!.status).toBe("merged");

      // The continuation carries alpha's commits but reviews from the
      // integration head it synced to, so the parked commits are in the diff.
      const betaFirst = records
        .filter((r) => r.slug === "beta" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq)[0];
      expect(betaFirst?.base).toBe(integrationHead);

      expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
        "alpha",
      );
      expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
        "beta",
      );
      expect(
        repo.git([
          "rev-parse",
          "--verify",
          "refs/heads/factory-task/demo/alpha",
        ]).code,
      ).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("kept-land", () => {
  it("lands a flake-parked kept branch with no new task", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-flake", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "feature.txt", "feature\n");
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["kept-flake"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("kept-flake", { scope: ["feature.txt"] });
      await writeTask(runtime, file);
      writePlan(runtime, ["kept-flake"]);
      await implementThenLand(runtime, file, ["implement", "review"], repo);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-flake"]!.status).toBe(
        "parked",
      );
      expect(
        causeText((await stateOf(runtime)).tasks["kept-flake"]!.cause),
      ).toContain("gates: unit");
      expect(workCalls(harness)).toHaveLength(4);

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-flake"]!.status).toBe(
        "merged",
      );

      const records = await runtime.store.listRecords();
      const kept = records.filter(
        (r) => r.slug === "kept-flake" && r.step === "kept-land",
      );
      expect(kept).toHaveLength(1);
      expect(kept[0]!.ok).toBe(true);
      expect(await runtime.store.listTasks()).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "kept-flake" && r.actor === "agent"),
      ).toHaveLength(3);
      expect(workCalls(harness)).toHaveLength(6);
      expect(repo.git(["show", "factory/demo:feature.txt"]).stdout.trim()).toBe(
        "feature",
      );
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain("| kept-flake | merged |");
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("leaves a conflicted kept branch parked and named in the pack", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-conflict", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "feature.txt", "task side\n");
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["kept-conflict"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("kept-conflict", { scope: ["feature.txt"] });
      await writeTask(runtime, file);
      writePlan(runtime, ["kept-conflict"]);
      await implementThenLand(runtime, file, ["implement", "review"], repo);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-conflict"]!.status).toBe(
        "parked",
      );

      const checkout = goalCheckout(repo, goal);
      fs.writeFileSync(
        path.join(checkout, "feature.txt"),
        "integration side\n",
        "utf8",
      );
      repo.git(["add", "feature.txt"], { cwd: checkout });
      repo.git(["commit", "-m", "concurrent integration change"], {
        cwd: checkout,
      });

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-conflict"]!.status).toBe(
        "parked",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter(
          (r) =>
            r.slug === "kept-conflict" &&
            r.step === "merge" &&
            r.iteration === 2,
        ),
      ).toHaveLength(1);
      expect(
        records.filter(
          (r) => r.slug === "kept-conflict" && r.actor === "agent",
        ),
      ).toHaveLength(3);
      expect(workCalls(harness)).toHaveLength(6);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain("| kept-conflict | parked |");
      expect(pack).toContain("- kept-conflict:");
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("leaves a repeat-red kept branch parked", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-red", "echo still-red; exit 1"),
        },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "feature.txt", "feature\n");
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["kept-red"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("kept-red", { scope: ["feature.txt"] });
      await writeTask(runtime, file);
      writePlan(runtime, ["kept-red"]);
      await implementThenLand(runtime, file, ["implement", "review"], repo);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-red"]!.status).toBe("parked");

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-red"]!.status).toBe("parked");

      const records = await runtime.store.listRecords();
      // Attempted (fresh merge-checks) but the red repeated on re-run, so the
      // failed attempt is observable as a kept-land record carrying the merge
      // cause.
      expect(
        records.filter(
          (r) =>
            r.slug === "kept-red" &&
            r.step === "merge-checks" &&
            r.iteration === 2,
        ).length,
      ).toBeGreaterThan(0);
      const merge = records.find(
        (r) => r.slug === "kept-red" && r.step === "merge" && r.iteration === 2,
      );
      expect(merge?.ok).toBe(false);
      const failed = records.filter(
        (r) =>
          r.slug === "kept-red" && r.step === "kept-land" && r.iteration === 2,
      );
      expect(failed).toHaveLength(1);
      expect(failed[0]!.ok).toBe(false);
      expect(failed[0]!.cause).toEqual(merge!.cause!);
      expect(causeText(failed[0]!.cause)).toContain("gates: unit");
      expect(workCalls(harness)).toHaveLength(6);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain("| kept-red | parked |");
      // A second boundary makes no new attempt: the red already proved
      // deterministic on this tip.
      scriptContinueBoundary(harness, runtime);
      const second = await runBoundary(runtime, { relaunch: false });
      expect(second.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-red"]!.status).toBe("parked");
      const again = await runtime.store.listRecords();
      expect(
        again.filter(
          (r) =>
            r.slug === "kept-red" && r.step === "merge" && r.iteration === 3,
        ),
      ).toHaveLength(0);
      expect(
        again.filter(
          (r) =>
            r.slug === "kept-red" &&
            r.step === "merge-checks" &&
            r.iteration === 3,
        ),
      ).toHaveLength(0);
      // The skip is recorded, not silent: the red is deterministic on this tip.
      const skipped = again.filter(
        (r) =>
          r.slug === "kept-red" && r.step === "kept-land" && r.iteration === 3,
      );
      expect(skipped).toHaveLength(1);
      expect(skipped[0]!.ok).toBe(true);
      expect(skipped[0]!.cause).toEqual(cause("skipped: deterministic-red"));
      expect(workCalls(harness)).toHaveLength(8);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("never lands a branch parked for a review rejection", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "feature.txt"),
          "feature\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "not acceptable", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["kept-reject"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-reject", { scope: ["feature.txt"] }));
      writePlan(runtime, ["kept-reject"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-reject"]!.status).toBe(
        "parked",
      );

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-reject"]!.status).toBe(
        "parked",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter((r) => r.slug === "kept-reject" && r.step === "merge"),
      ).toHaveLength(0);
      expect(workCalls(harness)).toHaveLength(6);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
});
