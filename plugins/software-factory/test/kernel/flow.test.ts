import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { GATE_LAST_CALL_TEXT } from "../../src/kernel/prompts.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import type { Action } from "../../src/kernel/types.js";
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
            steps: [
              { id: "draft", role: "implementer" },
              { id: "polish", role: "implementer" },
              {
                id: "critique",
                role: "reviewer",
                review: true,
                changeRequests: 0,
              },
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

describe("checks step bound and last call", () => {
  it("honors checks step changeRequests: 1 by rendering last call on the 2nd fix turn and parking on 2nd failure", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: "test ! -f broken.txt" }],
    });
    try {
      const processYaml = [
        "flows:",
        "  implement-review:",
        "    steps:",
        "      - id: implement",
        "        role: implementer",
        "      - id: checks",
        "        changeRequests: 1",
        "      - id: review",
        "        role: reviewer",
        "        review: true",
        "",
      ].join("\n");
      repo.writeFile(".factory/process.yaml", processYaml);

      const harness = new FakeHarness({ id: "fake" });
      const prompts: string[] = [];

      // Initial turn creates broken.txt
      harness.script((req, ctx) => {
        prompts.push(req.prompt ?? "");
        fs.writeFileSync(path.join(req.cwd!, "broken.txt"), "bad\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "wrote broken" }));
        return fakeTurnResult(req);
      });
      // Fix 1
      harness.script((req, ctx) => {
        prompts.push(req.prompt ?? "");
        fs.writeFileSync(path.join(req.cwd!, "fix-1.txt"), "f1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "fix 1" }));
        return fakeTurnResult(req);
      });
      // Fix 2 (last call)
      harness.script((req, ctx) => {
        prompts.push(req.prompt ?? "");
        fs.writeFileSync(path.join(req.cwd!, "fix-2.txt"), "f2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "fix 2" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["broken.txt", "fix-1.txt", "fix-2.txt"] }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );

      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toBe("gates: unit");

      // Initial + Fix 1 + Fix 2 = 3 turns
      expect(prompts).toHaveLength(3);
      expect(prompts[1]).not.toContain(GATE_LAST_CALL_TEXT);
      expect(prompts[2]).toContain(GATE_LAST_CALL_TEXT);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
