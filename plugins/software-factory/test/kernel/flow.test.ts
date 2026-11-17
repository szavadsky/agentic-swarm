import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { commitAll } from "../../src/core/git/commit.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { type GoalMetrics, writeMetrics } from "../../src/kernel/metrics.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type {
  Action,
  KernelRuntime,
  TaskFile,
  TaskState,
} from "../../src/kernel/types.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
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
  cleanup as cleanupGoal,
  expectLaunch,
  makeGoal,
  scriptDigest,
  simpleTask,
  stateOf,
  writeTask as writeGoalTask,
} from "./e2e-helpers.js";

function scriptFix(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "needs a fix", verdict: "changes" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v2" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

describe("flow data drives the steps", () => {
  it("runs configured step ids in order and gates only before the review", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        flows: {
          "draft-polish": {
            reviewRounds: 1,
            steps: [
              { id: "draft", role: "implementer" },
              { id: "polish", role: "implementer" },
              { id: "critique", role: "reviewer", review: true },
            ],
          },
        },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "draft\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "drafted" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(fs.existsSync(path.join(req.cwd!, "task.txt"))).toBe(true);
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "polished\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "polished" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { flow: "draft-polish", scope: ["task.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const steps = records
        .filter((r) => r.slug === "task" && r.actor === "agent")
        .sort((a, b) => a.seq - b.seq);
      expect(steps.map((r) => r.step)).toEqual(["draft", "polish", "critique"]);
      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks.length).toBe(1);
      expect(checks[0]!.seq).toBeGreaterThan(steps[1]!.seq);
      expect(checks[0]!.seq).toBeLessThan(steps[2]!.seq);
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
        "polished",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("just-implement", () => {
  it("merges after gates with zero reviewer turns and keeps the implementer's debt", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "done\n", "utf8");
        ctx.writeOutcome(
          outcome({
            summary: "implemented directly",
            concerns: [
              {
                kind: "debt",
                calibration: "architect",
                text: "retry policy is untested",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { flow: "just-implement", scope: ["task.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.phase).toBe("done");
      expect(harness.calls.length).toBe(1);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toEqual([]);
      expect(records.some((r) => r.slug === "task" && r.step === "debt")).toBe(
        false,
      );
      expect(
        records.filter((r) => r.slug === "task" && r.step === "checks").length,
      ).toBe(1);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "merge-checks")
          .length,
      ).toBe(0);
      const merges = records.filter(
        (r) => r.slug === "task" && r.step === "merge" && r.ok === true,
      );
      expect(merges.length).toBe(1);
      expect(merges[0]!.cause).toContain("skipped merge-checks");

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(
        path.join(runtime.store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toMatch(
        /## Debt opened\n- task: retry policy is untested/,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks after a red merged gate and lets one gate-fix turn run first", async () => {
    const { repo, goal } = setupFlowRepo({
      // Green on the task worktree, red once a concurrent landing poisons the
      // head: the merged tree differs, so the merge gates still run.
      gates: [{ id: "poison-gate", command: "test ! -f poison.txt" }],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v2" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", {
        flow: "just-implement",
        scope: ["task.txt"],
      });
      await writeTask(runtime, file);
      const drive = async (action: Action): Promise<void> => {
        const before = derive(
          await runtime.store.listTasks(),
          await runtime.store.listRecords(),
          runtime.configs.process.flows,
        );
        await executeTaskAction(
          runtime,
          file,
          action,
          1,
          before.tasks[file.slug]!,
        );
      };
      await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
      // A concurrent landing poisons the head before the merge queue runs.
      fs.writeFileSync(path.join(checkout, "poison.txt"), "poison\n", "utf8");
      repo.git(["add", "poison.txt"], { cwd: checkout });
      repo.git(["commit", "-m", "concurrent poison"], { cwd: checkout });
      await drive({ kind: "merge", slug: "task" });
      await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
      await drive({ kind: "merge", slug: "task" });
      scriptStallLeave(harness, ["task"]);
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("gates: poison-gate");
      expect(state.tasks.task!.round).toBe(1);
      expect(harness.calls.length).toBe(3);
      expect(
        records.filter(
          (r) => r.slug === "task" && r.step === "merge" && r.ok === false,
        ).length,
      ).toBe(2);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "merge-checks")
          .length,
      ).toBe(2);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("fix-round follow-up modes", () => {
  it("same-session resumes the session compacted at the end of its turn", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const implement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      const review = records
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      // Each turn compacts its own session at its end; the fix turn resumes the
      // compacted implement session and the second review resumes the
      // compacted first review. A resume adds no compaction because the ref it
      // resumes is already compacted.
      expect(harness.compactions.map((c) => c.id)).toEqual([
        implement[0]!.session!.id,
        review[0]!.session!.id,
        implement[1]!.session!.id,
        review[1]!.session!.id,
      ]);
      expect(implement.map((r) => r.session?.compacted)).toEqual([true, true]);
      expect(review.map((r) => r.session?.compacted)).toEqual([true, true]);

      const fix = harness.calls[2]!;
      expect(fix.session?.id).toBe(implement[0]?.session?.id);
      expect(fix.session?.compacted).toBe(true);
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("de-novo starts the fix turn without the previous session", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        flows: { "implement-review": { followUp: { mode: "de-novo" } } },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      expect(harness.calls[2]!.session).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("different-model runs the fix turn on another alias", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        flows: {
          "implement-review": {
            followUp: { mode: "different-model", role: "implementer-strong" },
          },
        },
        roles: {
          "implementer-strong": {
            prompt: "implementer",
            alias: "implementer-strong",
          },
        },
      },
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: { harness: "fake", model: "fake-impl" },
        reviewer: { harness: "fake", model: "fake-review" },
        steward: { harness: "fake", model: "fake-steward" },
        "plan-checker": { harness: "fake", model: "fake-check" },
        "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
        "implementer-strong": { harness: "fake", model: "fake-strong" },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.calls[2]!.model.id).toBe("fake-strong");
      expect(harness.calls[2]!.session).toBeUndefined();
      const records = await runtime.store.listRecords();
      const implementRecords = records.filter(
        (r) => r.slug === "task" && r.step === "implement",
      );
      expect(implementRecords.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer-strong",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("worktree setup", () => {
  it("runs the setup step in a fresh worktree before gates", async () => {
    const { repo, goal } = setupFlowRepo({
      setup: ["printf ready > dependency.txt"],
      gates: [{ id: "dependency", command: "test -f dependency.txt" }],
    });
    try {
      repo.writeFile(".gitignore", "dependency.txt\n");
      repo.commit("ignore setup artifact");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(harness.calls.length).toBe(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("empty diff", () => {
  it("parks a task whose implement turn commits nothing instead of running the reviewer", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "reported done without a change" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause!.startsWith("empty-diff:")).toBe(true);
      expect(harness.calls.length).toBe(2);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toEqual([]);
      expect(
        records.filter(
          (r) =>
            r.slug === "task" &&
            r.step === "park" &&
            r.cause?.startsWith("empty-diff:"),
        ),
      ).toHaveLength(1);
      expect(
        repo.git(["show", "factory/demo:task.txt"], { allowFail: true }).code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
  it("carries an empty gate fix to review when the following checks go green", async () => {
    // m5-kept-land (i30): the fix turn verified the work and committed nothing
    // while the red was a twice-red flake; the checks on the same tree came
    // back green. The task must reach review instead of parking empty-diff.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-gatefix-"));
    const count = path.join(dir, "count");
    const quote = (value: string): string => `'${value}'`;
    // Red on the first two runs (initial + the flake re-run), then green: no
    // gate-flake record, one red checks record, and the fix turn runs.
    const twiceRed =
      `echo run >> ${quote(count)}; ` +
      `if [ "$(grep -c . ${quote(count)})" -ge 3 ]; then exit 0; ` +
      `else printf 'src/t.test.ts:\\n(fail) suite > broken test\\n'; exit 1; fi`;
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: twiceRed }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        // Writes nothing: the failure did not reproduce.
        ctx.writeOutcome(
          outcome({ summary: "verified done; no change needed" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(harness.calls).toHaveLength(3);

      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks).toHaveLength(2);
      expect(checks[0]!.ok).toBe(false);
      expect(checks[1]!.ok).toBe(true);
      expect(checks[0]!.tree).toBe(checks[1]!.tree);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "gate-flake"),
      ).toHaveLength(0);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
      // Initial + re-run (both red) and the post-fix checks; the merge skips
      // its gates on the already-judged tree.
      const runs = fs.readFileSync(count, "utf8").trim().split("\n").length;
      expect(runs).toBe(3);
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("treats an empty diff in a spike as a normal finish", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "the cache approach holds; no artifact needed" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "finding is sound", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("probe", { kind: "spike", flow: "spike", scope: ["finding.md"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.probe!.status).toBe("finished");
      expect(state.tasks.probe!.cause).toBeUndefined();
      expect(harness.calls.length).toBe(2);
      expect(
        records.filter((r) => r.slug === "probe" && r.step === "park"),
      ).toEqual([]);
      expect(
        records.filter(
          (r) => r.slug === "probe" && r.step === "finish" && r.ok === true,
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("continuation carry", () => {
  it("lands a no-change first turn carrying kept work past checks to review", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha rejected", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["alpha"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      let sawAlpha = false;
      harness.script((req, ctx) => {
        sawAlpha = fs.existsSync(path.join(req.cwd!, "alpha.txt"));
        ctx.writeOutcome(
          outcome({ summary: "kept branch already meets done-when" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["alpha.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");
      expect(sawAlpha).toBe(true);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("merged");
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "park"),
      ).toEqual([]);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "checks"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toHaveLength(1);
      const advance = records.find(
        (r) => r.slug === "beta" && r.step === "base-advance",
      );
      expect(advance?.headTree).toBeDefined();
      expect(advance?.tree).not.toBe(advance?.headTree);
      const firstImplement = records
        .filter(
          (r) =>
            r.slug === "beta" && r.step === "implement" && r.actor === "agent",
        )
        .sort((a, b) => a.seq - b.seq)[0];
      expect(firstImplement?.tree).toBe(advance?.tree);
      expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
        "alpha",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("lands a no-change first turn carrying kept work past checks to merge on just-implement", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha rejected", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["alpha"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "kept branch already meets done-when" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", {
          base: "alpha",
          flow: "just-implement",
          scope: ["alpha.txt"],
        }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("merged");
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "park"),
      ).toEqual([]);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "checks"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toEqual([]);
      const advance = records.find(
        (r) => r.slug === "beta" && r.step === "base-advance",
      );
      expect(advance?.headTree).toBeDefined();
      expect(advance?.tree).not.toBe(advance?.headTree);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks empty-diff when the kept work is already on the head", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha rejected", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["alpha"]);
      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      // Another landing puts the same tree on the head: the kept branch
      // carries nothing beyond it.
      fs.writeFileSync(path.join(checkout, "alpha.txt"), "alpha\n", "utf8");
      repo.git(["add", "-A"], { cwd: checkout });
      repo.git(["commit", "-m", "factory: land same alpha"], { cwd: checkout });

      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to do" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "should never review", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["alpha.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta!.cause).toStartWith("empty-diff:");
      expect(state.tasks.beta!.cause).toContain("already on the head");
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toEqual([]);
      expect(
        records.filter(
          (r) => r.slug === "beta" && r.step === "merge" && r.ok === true,
        ),
      ).toEqual([]);
      const advance = records.find(
        (r) => r.slug === "beta" && r.step === "base-advance",
      );
      expect(advance?.headTree).toBeDefined();
      expect(advance?.tree).toBe(advance?.headTree);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("spikes", () => {
  it("finishes a spike without merging and keeps its branch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "finding.md"),
          "# Finding\n\nUse the cache.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "finding written" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "finding is sound", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("probe", { kind: "spike", flow: "spike", scope: ["finding.md"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.probe!.status).toBe("finished");
      expect(
        records.filter((r) => r.slug === "probe" && r.step === "merge").length,
      ).toBe(0);
      expect(
        records.filter(
          (r) => r.slug === "probe" && r.step === "finish" && r.ok === true,
        ).length,
      ).toBe(1);
      expect(
        repo.git([
          "rev-parse",
          "--verify",
          "refs/heads/factory-task/demo/probe",
        ]).code,
      ).toBe(0);
      expect(
        repo.git(["show", "factory/demo:finding.md"], { allowFail: true }).code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("delivery guard", () => {
  it("parks an implement turn that delivers no outcome, naming the outcome", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "work\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      scriptStallLeave(harness, ["task"]);
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("no outcome after repair");
      expect(harness.calls).toHaveLength(3);
      expect(harness.calls[1]!.prompt).toContain(
        "You are the implementer. Your turn did not deliver its outcome.",
      );
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a review that delivers no verdict, naming the verdict", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no verdict yet" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "still no verdict" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("verdict is required");
      expect(harness.calls).toHaveLength(4);
      expect(harness.calls[2]!.prompt).toContain(
        "You are the reviewer. Your turn did not deliver its verdict.",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("merges after the second repair delivers the implement outcome", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      harness.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "v1 recovered" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["task.txt"], repairTurns: 2 }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(4);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      const implement = records.find(
        (r) => r.slug === "task" && r.step === "implement",
      )!;
      expect(implement.attempts).toHaveLength(3);
      expect(state.tasks.task!.turns).toBe(4);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("honours a task repairTurns override of zero", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "work\n", "utf8");
        return fakeTurnResult(req, { text: "nothing" });
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["task.txt"], repairTurns: 0 }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(2);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("no outcome");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("gate flake re-run", () => {
  interface GateProbe {
    dir: string;
    count: string;
    marker: string;
  }

  function makeProbe(): GateProbe {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flake-"));
    return {
      dir,
      count: path.join(dir, "count"),
      marker: path.join(dir, "marker"),
    };
  }

  function runs(probe: GateProbe): number {
    try {
      const text = fs.readFileSync(probe.count, "utf8").trim();
      return text === "" ? 0 : text.split("\n").length;
    } catch {
      return 0;
    }
  }

  function cleanupProbe(probe: GateProbe): void {
    fs.rmSync(probe.dir, { recursive: true, force: true });
  }

  const quote = (value: string): string => `'${value}'`;

  /** Always green; its count proves green gates never re-run. */
  function greenCommand(probe: GateProbe): string {
    return `echo run >> ${quote(probe.count)}`;
  }

  /** Red once with a bun-style failure, then green on the same tree. */
  function flakyCommand(probe: GateProbe): string {
    return (
      `echo run >> ${quote(probe.count)}; ` +
      `if [ -f ${quote(probe.marker)} ]; then exit 0; ` +
      `else touch ${quote(probe.marker)}; ` +
      `printf 'src/a.test.ts:\\n(fail) suite > flaky test\\n'; exit 1; fi`
    );
  }

  function redCommand(probe: GateProbe): string {
    return (
      `echo run >> ${quote(probe.count)}; ` +
      `printf 'src/b.test.ts:\\n(fail) suite > broken test\\n'; exit 1`
    );
  }

  function infraCommand(probe: GateProbe): string {
    return `echo run >> ${quote(probe.count)}; exit 127`;
  }

  /**
   * A bun-style red report longer than the `tail -25` the implementer used
   * live: the `(fail)` line sits above 30 detail lines, so a truncated run
   * loses the only line that names the failure.
   */
  function longRedCommand(probe: GateProbe): string {
    const detail = Array.from(
      { length: 30 },
      (_, i) => `    at src/long.test.ts:${i + 1}:3`,
    ).join("\n");
    return (
      `echo run >> ${quote(probe.count)}; ` +
      `printf 'src/long.test.ts:\n(fail) suite > hidden red [1.2ms]\n${detail}\n'; exit 1`
    );
  }

  /** Drives one real action and returns the freshly derived state. */
  async function driveAction(
    runtime: KernelRuntime,
    file: TaskFile,
    action: Action,
  ): Promise<TaskState> {
    const state = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    await executeTaskAction(runtime, file, action, 1, state.tasks[file.slug]!);
    const after = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    return after.tasks[file.slug]!;
  }

  it("re-runs a red gate once and merges with a gate-flake record when the re-run is green", async () => {
    const green = makeProbe();
    const flaky = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "flaky", command: flakyCommand(flaky) },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      // No fix turn: one implement turn plus its review.
      expect(harness.calls).toHaveLength(2);

      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.ok).toBe(true);
      expect(typeof checks[0]!.tree).toBe("string");

      const flakes = records.filter(
        (r) => r.slug === "task" && r.step === "gate-flake",
      );
      expect(flakes).toHaveLength(1);
      expect(flakes[0]!.cause).toContain("flaky");
      expect(flakes[0]!.cause).toContain("src/a.test.ts");
      expect(flakes[0]!.cause).toContain("flaky test");

      // Only the red gate re-ran, and the merge skipped its gates on the
      // already-judged tree: flaky ran first + re-run, green ran checks.
      expect(runs(flaky)).toBe(2);
      expect(runs(green)).toBe(1);

      await writeMetrics(runtime.store, {
        iteration: 1,
        status: "in-progress",
        records,
      });
      const metrics = yaml.parse(
        (await runtime.store.readFile("metrics.yaml"))!,
      ) as GoalMetrics;
      expect(metrics.iterations[0]!.incidents.gateFlakes).toBe(1);
      expect(metrics.totals.incidents.gateFlakes).toBe(1);

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(
        path.join(runtime.store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("- gate flakes: 1");
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(flaky);
    }
  }, 60_000);

  it("sends a still-red gate to the existing fix route with no gate-flake record", async () => {
    const green = makeProbe();
    const red = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "unit", command: redCommand(red) },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const after = await driveAction(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      expect(after.phase).toBe("implement");
      expect(after.round).toBe(1);

      const records = await runtime.store.listRecords();
      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.ok).toBe(false);
      expect(typeof checks[0]!.tree).toBe("string");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "gate-flake"),
      ).toHaveLength(0);
      expect(runs(red)).toBe(2);
      expect(runs(green)).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(red);
    }
  }, 60_000);

  it("names a red test above the last 25 lines in the fix turn's prompt", async () => {
    const red = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: longRedCommand(red) }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      let fixPrompt = "";
      harness.script((req, ctx) => {
        fixPrompt = req.prompt;
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v2" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const after = await driveAction(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      expect(after.phase).toBe("implement");
      expect(after.gateFix).toBe(true);

      const records = await runtime.store.listRecords();
      const redRun = records.find(
        (r) => r.slug === "task" && r.step === "checks" && r.ok === false,
      );
      const output = redRun?.checks?.[0]?.output ?? "";
      const lines = output.split("\n");
      expect(lines.length).toBeGreaterThan(25);
      // The report fits a `tail -25` without the line that names the failure.
      expect(lines.slice(-25).join("\n")).not.toContain("hidden red");

      await driveAction(runtime, file, {
        kind: "step",
        slug: "task",
        step: "implement",
        round: 1,
      });
      expect(harness.calls).toHaveLength(2);
      expect(fixPrompt).toContain("### unit: exit 1");
      expect(fixPrompt).toContain("(fail) suite > hidden red");
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(red);
    }
  }, 60_000);

  it("keeps infra reds on their own path without a re-run", async () => {
    const probe = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "typecheck", command: infraCommand(probe) }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const file = task("a", { scope: ["a.txt"] });
      await writeTask(runtime, file);
      await driveAction(runtime, file, { kind: "checks", slug: "a" });

      const records = await runtime.store.listRecords();
      const checks = records.filter(
        (r) => r.slug === "a" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.ok).toBe(false);
      expect(checks[0]!.checks?.[0]?.details).toMatchObject({ kind: "infra" });
      expect(
        records.filter((r) => r.slug === "a" && r.step === "gate-flake"),
      ).toHaveLength(0);
      expect(runs(probe)).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(probe);
    }
  }, 60_000);

  it("re-runs once per tree: a repeat checks on the same tree skips it, a new commit re-arms it", async () => {
    const green = makeProbe();
    const red = makeProbe();
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "green", command: greenCommand(green) },
        { id: "unit", command: redCommand(red) },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const file = task("a", { scope: ["a.txt"] });
      await writeTask(runtime, file);

      await driveAction(runtime, file, { kind: "checks", slug: "a" });
      expect(runs(red)).toBe(2);
      expect(runs(green)).toBe(1);

      await driveAction(runtime, file, { kind: "checks", slug: "a" });
      expect(runs(red)).toBe(3);
      expect(runs(green)).toBe(2);

      const ensured = await ensureTaskWorktree(runtime, file);
      expect(ensured.error).toBeUndefined();
      fs.writeFileSync(path.join(ensured.path!, "a.txt"), "a\n", "utf8");
      await commitAll(runtime.repo, ensured.path!, "factory: test change");

      await driveAction(runtime, file, { kind: "checks", slug: "a" });
      expect(runs(red)).toBe(5);
      expect(runs(green)).toBe(3);

      const records = await runtime.store.listRecords();
      const checks = records.filter(
        (r) => r.slug === "a" && r.step === "checks",
      );
      expect(checks).toHaveLength(3);
      expect(checks[0]!.tree).toBe(checks[1]!.tree);
      expect(checks[2]!.tree).not.toBe(checks[0]!.tree);
      expect(
        records.filter((r) => r.slug === "a" && r.step === "gate-flake"),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
      cleanupProbe(green);
      cleanupProbe(red);
    }
  }, 60_000);
});

describe("standalone upscope", () => {
  function writeClass(goalDir: string, text: string): void {
    fs.writeFileSync(path.join(goalDir, "class.yaml"), text, "utf8");
  }

  function readClass(goalDir: string): unknown {
    return yaml.parse(
      fs.readFileSync(path.join(goalDir, "class.yaml"), "utf8"),
    );
  }

  it("parks on review upscope=yes, rewrites the class to bigger, and the next launch runs the architect", async () => {
    const goal = makeGoal({ classYaml: "class: task\nslug: solo\n" });
    try {
      writeGoalTask(goal.goalDir, simpleTask("solo", "solo.txt"));
      const first = new FakeHarness({ id: "fake" });
      let reviewPrompt = "";
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "solo.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        reviewPrompt = req.prompt;
        ctx.writeOutcome(
          outcome({
            summary: "needs an architect: two services, not one",
            verdict: "approve",
            upscope: "yes",
          }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(first, ["solo"]);

      // Iteration 1 escalates through the launch: the class rewrite skips the
      // front stop, so the goal stays active instead of blocking on the park.
      await expectLaunch(3, goal.repo, first, 1);
      expect(reviewPrompt).toContain("standalone task");

      const store = createFolderStore(goal.goalDir);
      const escalated = await stateOf(goal.goalDir);
      expect(escalated.tasks.solo!.status).toBe("parked");
      expect(escalated.tasks.solo!.cause).toMatch(/^upscope: /);
      expect(escalated.goal).toBe("active");
      expect(escalated.terminal).toBe(false);
      expect(readClass(goal.goalDir)).toEqual({ class: "bigger" });
      expect(
        (await store.listRecords()).filter((r) => r.step === "front-stop"),
      ).toEqual([]);

      // The next launch reads the bigger class and runs the architect.
      const second = new FakeHarness({ id: "fake" });
      scriptDigest(second, goal.goalDir, 2);
      second.script((req, ctx) => {
        expect(req.prompt).toContain("You are the architect");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "done" }));
        return fakeTurnResult(req);
      });
      await expectLaunch(0, goal.repo, second, 1);

      const records = await store.listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      expect(architect?.iteration).toBe(2);
      expect((await stateOf(goal.goalDir)).goal).toBe("done");
      expect(first.calls).toHaveLength(3);
      expect(second.calls).toHaveLength(2);
    } finally {
      cleanupGoal(goal);
    }
  }, 90_000);

  it("keeps the normal verdict path on review upscope=no", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "looks right",
            verdict: "approve",
            upscope: "no",
          }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writeClass(goalDir, "class: task\nslug: solo\n");
      await writeTask(runtime, task("solo", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.solo!.status).toBe("merged");
      expect(readClass(goalDir)).toEqual({ class: "task", slug: "solo" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("never escalates tasks inside an architect plan", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "hallucinated escalation",
            verdict: "approve",
            upscope: "yes",
          }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["planned"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("planned", { scope: ["task.txt"] });
      await writeTask(runtime, file);

      const vars = promptVars(
        runtime,
        file,
        "/worktrees/demo-tasks/planned",
        [],
        1,
        runtime.configs.process.flows["implement-review"]!,
      );
      expect(vars.upscope_ask).toBe("");

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.planned!.status).toBe("parked");
      expect(state.tasks.planned!.cause).toMatch(/^upscope: /);
      expect(fs.existsSync(path.join(goalDir, "class.yaml"))).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
