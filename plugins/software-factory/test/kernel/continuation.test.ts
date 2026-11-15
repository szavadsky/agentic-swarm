import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("parked continuation", () => {
  it("continues a task with base from the parked task's kept branch", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
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
  let counterSeq = 0;

  /** Unique flag file a flake gate toggles; outside every worktree. */
  function freshCounter(): string {
    counterSeq += 1;
    return path.join(
      os.tmpdir(),
      `kept-land-flake-${process.pid}-${counterSeq}`,
    );
  }

  function rmCounter(counter: string): void {
    if (fs.existsSync(counter)) fs.rmSync(counter, { force: true });
  }

  /**
   * A gate that stays green on task branches and runs `body` only in merge
   * scratch, where HEAD is the squash commit. Lets a test park on a red
   * merged result and decide what the boundary re-run sees.
   */
  function mergeOnlyGate(slug: string, body: string): string {
    return `if git log -1 --format=%s | grep -q "^factory: merge ${slug}$"; then ${body}; fi; exit 0`;
  }

  /**
   * A merge-gate body that reds the first `reds` merge runs, then stays
   * green.
   */
  function flakeRedTimes(counter: string, reds: number): string {
    return `n=$(cat "${counter}" 2>/dev/null || echo 0); if [ "$n" -lt ${reds} ]; then echo $((n + 1)) > "${counter}"; echo flake-red-$n; exit 1; fi; exit 0`;
  }

  /**
   * A merge-gate body that reds the two dispatch merge runs, then stays
   * green. Dispatch allows one gate fix: the first red sends the fix, the
   * second parks, and the boundary re-run sees green. A single red no longer
   * parks — a deferred empty fix with green checks carries on to merge.
   */
  function flakeRedTwice(counter: string): string {
    return flakeRedTimes(counter, 2);
  }

  function planFor(slugs: string[]): string {
    return `# Milestone 1\n\n${slugs.map((slug) => `## ${slug}\nDo ${slug}.\n`).join("\n")}`;
  }

  function writePlan(runtime: KernelRuntime, slugs: string[]): void {
    fs.writeFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      planFor(slugs),
      "utf8",
    );
  }

  function scriptContinueBoundary(
    harness: FakeHarness,
    runtime: KernelRuntime,
  ): void {
    harness.script((req, ctx) => {
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "\n## architect edit\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "continue", decision: "continue" }));
      return fakeTurnResult(req);
    });
    harness.script((req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
      return fakeTurnResult(req);
    });
  }

  async function stateOf(runtime: KernelRuntime) {
    return derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
  }

  function scriptImplementApprove(
    harness: FakeHarness,
    file: string,
    content: string,
  ): void {
    harness.script((req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, file), content, "utf8");
      ctx.writeOutcome(outcome({ summary: "implemented" }));
      return fakeTurnResult(req);
    });
    harness.script((req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    });
  }

  it("lands a flake-parked kept branch with no new task and no agent turn", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: 1 },
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
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-flake", { scope: ["feature.txt"] }));
      writePlan(runtime, ["kept-flake"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-flake"]!.status).toBe(
        "parked",
      );
      expect((await stateOf(runtime)).tasks["kept-flake"]!.cause).toContain(
        "gates: unit",
      );
      expect(harness.calls).toHaveLength(3);

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
      expect(harness.calls).toHaveLength(5);
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
      limits: { concurrency: 1 },
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
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("kept-conflict", { scope: ["feature.txt"] }),
      );
      writePlan(runtime, ["kept-conflict"]);

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
          (r) => r.slug === "kept-conflict" && r.step === "merge-attempt",
        ),
      ).toHaveLength(0);
      expect(
        records.filter(
          (r) => r.slug === "kept-conflict" && r.actor === "agent",
        ),
      ).toHaveLength(3);
      expect(harness.calls).toHaveLength(5);
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
      limits: { concurrency: 1 },
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
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-red", { scope: ["feature.txt"] }));
      writePlan(runtime, ["kept-red"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-red"]!.status).toBe("parked");

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-red"]!.status).toBe("parked");

      const records = await runtime.store.listRecords();
      // Attempted (fresh merge-checks) but the red repeated on re-run.
      expect(
        records.filter(
          (r) =>
            r.slug === "kept-red" &&
            r.step === "merge-checks" &&
            r.iteration === 2,
        ).length,
      ).toBeGreaterThan(0);
      expect(
        records.filter((r) => r.slug === "kept-red" && r.step === "kept-land"),
      ).toHaveLength(0);
      expect(harness.calls).toHaveLength(5);
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
      expect(harness.calls).toHaveLength(7);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("never lands a branch parked for a review rejection", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
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
      expect(harness.calls).toHaveLength(4);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("never lands when a later commit voids the approve", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: 1 },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-void", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "feature.txt", "feature\n");
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "fix.txt"), "fix\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "gate fix attempt" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-void", { scope: ["feature.txt"] }));
      writePlan(runtime, ["kept-void"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      const parked = (await stateOf(runtime)).tasks["kept-void"]!;
      expect(parked.status).toBe("parked");
      expect(parked.cause).toBe("gates: unit");

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      // The gate is green now, but the fix commit voided the approve.
      expect((await stateOf(runtime)).tasks["kept-void"]!.status).toBe(
        "parked",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter(
          (r) =>
            r.slug === "kept-void" && r.step === "merge" && r.iteration === 2,
        ),
      ).toHaveLength(0);
      expect(harness.calls).toHaveLength(5);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("lands a just-implement branch on green checks", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: 1 },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-simple", flakeRedTwice(counter)),
        },
      ],
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
        ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("kept-simple", { flow: "just-implement", scope: ["feature.txt"] }),
      );
      writePlan(runtime, ["kept-simple"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-simple"]!.status).toBe(
        "parked",
      );

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-simple"]!.status).toBe(
        "merged",
      );

      const records = await runtime.store.listRecords();
      const kept = records.filter(
        (r) => r.slug === "kept-simple" && r.step === "kept-land",
      );
      expect(kept).toHaveLength(1);
      expect(kept[0]!.ok).toBe(true);
      expect(harness.calls).toHaveLength(4);
      expect(repo.git(["show", "factory/demo:feature.txt"]).stdout.trim()).toBe(
        "feature",
      );
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("skips a base another task continues", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: 1 },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-base", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "alpha.txt", "alpha\n");
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-base", { scope: ["alpha.txt"] }));
      await writeTask(
        runtime,
        task("kept-next", {
          base: "kept-base",
          deps: ["kept-base"],
          scope: ["beta.txt"],
        }),
      );
      writePlan(runtime, ["kept-base", "kept-next"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-base"]!.status).toBe(
        "parked",
      );
      expect((await stateOf(runtime)).tasks["kept-next"]!.status).toBe(
        "pending",
      );

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-base"]!.status).toBe(
        "parked",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter(
          (r) =>
            r.slug === "kept-base" && r.step === "merge" && r.iteration === 2,
        ),
      ).toHaveLength(0);
      expect(harness.calls).toHaveLength(5);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("lands when the boundary re-run flips a red gate to green", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: 1 },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-flip", flakeRedTimes(counter, 3)),
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
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-flip", { scope: ["feature.txt"] }));
      writePlan(runtime, ["kept-flip"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      expect((await stateOf(runtime)).tasks["kept-flip"]!.status).toBe(
        "parked",
      );
      expect(harness.calls).toHaveLength(3);

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect((await stateOf(runtime)).tasks["kept-flip"]!.status).toBe(
        "merged",
      );

      const records = await runtime.store.listRecords();
      const kept = records.filter(
        (r) => r.slug === "kept-flip" && r.step === "kept-land",
      );
      expect(kept).toHaveLength(1);
      expect(kept[0]!.ok).toBe(true);
      const flakes = records.filter(
        (r) => r.slug === "kept-flip" && r.step === "gate-flake",
      );
      expect(flakes).toHaveLength(1);
      expect(flakes[0]!.ok).toBe(true);
      expect(flakes[0]!.cause).toContain("unit");
      expect(
        records.filter((r) => r.slug === "kept-flip" && r.actor === "agent"),
      ).toHaveLength(3);
      expect(harness.calls).toHaveLength(5);
      expect(repo.git(["show", "factory/demo:feature.txt"]).stdout.trim()).toBe(
        "feature",
      );
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);
});
