import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

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
      await writeTask(runtime, task("task", { flow: "draft-polish", scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const steps = records
        .filter((r) => r.slug === "task" && r.actor === "agent" && r.step !== "merge-attempt")
        .sort((a, b) => a.seq - b.seq);
      expect(steps.map((r) => r.step)).toEqual(["draft", "polish", "critique"]);
      const checks = records.filter((r) => r.slug === "task" && r.step === "checks");
      expect(checks.length).toBe(1);
      expect(checks[0]!.seq).toBeGreaterThan(steps[1]!.seq);
      expect(checks[0]!.seq).toBeLessThan(steps[2]!.seq);
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe("polished");
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
            concerns: [{ kind: "debt", calibration: "architect", text: "retry policy is untested" }],
          })
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { flow: "just-implement", scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.phase).toBe("done");
      expect(harness.calls.length).toBe(1);
      expect(records.filter((r) => r.slug === "task" && r.step === "review")).toEqual([]);
      expect(records.some((r) => r.slug === "task" && r.step === "debt")).toBe(false);
      expect(records.filter((r) => r.slug === "task" && r.step === "checks").length).toBe(1);
      expect(records.filter((r) => r.slug === "task" && r.step === "merge-checks").length).toBe(1);
      expect(records.filter((r) => r.slug === "task" && r.step === "merge" && r.ok === true).length).toBe(1);

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(path.join(runtime.store.goalDir, "iterations/1/summary.md"), "utf8");
      expect(summary).toMatch(/## Debt opened\n- task: retry policy is untested/);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks after a red merged gate and lets one gate-fix turn run first", async () => {
    const { repo, goal } = setupFlowRepo({
      // Passes on the task branch, fails on the detached merge scratch: the
      // task's own gates are green while the merged-result gate is red.
      gates: [{ id: "branch-only", command: "git symbolic-ref -q --short HEAD" }],
    });
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
      await writeTask(runtime, task("task", { flow: "just-implement", scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toContain("gates: branch-only");
      expect(state.tasks.task!.round).toBe(1);
      expect(harness.calls.length).toBe(2);
      expect(records.filter((r) => r.slug === "task" && r.step === "merge" && r.ok === false).length).toBe(2);
      expect(records.filter((r) => r.slug === "task" && r.step === "review")).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("fix-round follow-up modes", () => {
  it("same-session resumes the compacted implementer session", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.compactions.length).toBe(1);
      const fix = harness.calls[2]!;
      const records = await runtime.store.listRecords();
      const firstImplement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq)[0];
      expect(fix.session?.id).toBe(firstImplement?.session?.id);
      expect(fix.session?.compacted).toBe(true);
      const implementRecords = records.filter((r) => r.slug === "task" && r.step === "implement");
      expect(implementRecords.map((r) => r.alias)).toEqual(["implementer", "implementer"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("de-novo starts the fix turn without the previous session", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { flows: { "implement-review": { followUp: { mode: "de-novo" } } } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      expect(harness.calls[2]!.session).toBeUndefined();
      expect(harness.compactions.length).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("different-model runs the fix turn on another alias", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        flows: { "implement-review": { followUp: { mode: "different-model", role: "implementer-strong" } } },
        roles: {
          "implementer-strong": { prompt: "implementer", alias: "implementer-strong" },
        },
      },
      aliases: {
        architect: { harness: "fake", model: "fake-architect" },
        pm: { harness: "fake", model: "fake-pm" },
        implementer: { harness: "fake", model: "fake-impl" },
        reviewer: { harness: "fake", model: "fake-review" },
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
      const implementRecords = records.filter((r) => r.slug === "task" && r.step === "implement");
      expect(implementRecords.map((r) => r.alias)).toEqual(["implementer", "implementer-strong"]);
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
      const state = derive(await runtime.store.listTasks(), await runtime.store.listRecords(), runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("merged");
      expect(harness.calls.length).toBe(2);
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
        fs.writeFileSync(path.join(req.cwd!, "finding.md"), "# Finding\n\nUse the cache.\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "finding written" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "finding is sound", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("probe", { kind: "spike", flow: "spike", scope: ["finding.md"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.probe!.status).toBe("finished");
      expect(records.filter((r) => r.slug === "probe" && r.step === "merge").length).toBe(0);
      expect(records.filter((r) => r.slug === "probe" && r.step === "finish" && r.ok === true).length).toBe(1);
      expect(repo.git(["rev-parse", "--verify", "refs/heads/factory-task/demo/probe"]).code).toBe(0);
      expect(repo.git(["show", "factory/demo:finding.md"], { allowFail: true }).code).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
