import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  simpleTask,
  stateOf,
  writeTask as writeGoalTask,
  writePlan,
} from "./e2e-helpers.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

describe("KERNEL0 scenario 4 — infra stops and item turns", () => {
  it("retries an infra stop without counting a turn or a review round", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "rate" } }),
      );
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "done\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      // The rate stop is transient: the same dispatch backs off and retries
      // the turn instead of freezing the slug for the launch.
      const result = await runDispatch(runtime, {
        iteration: 1,
        sleep: async () => {},
      });
      expect(result.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      // Only the delivered turn and the review count: the rate stop is free.
      expect(state.tasks.task!.turns).toBe(2);
      expect(state.tasks.task!.round).toBe(1);
      expect(state.tasks.task!.park).toBeUndefined();

      const records = await runtime.store.listRecords();
      const implementRecords = records.filter(
        (r) => r.slug === "task" && r.step === "implement",
      );
      expect(implementRecords).toHaveLength(2);
      expect(implementRecords[0]!.stop).toEqual({
        kind: "infra",
        cause: "rate",
      });
      expect(implementRecords[0]!.outcome).toBeUndefined();
      expect(implementRecords[1]!.stop).toEqual({ kind: "done" });
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park").length,
      ).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("confines an infra stop to its slug and lets an independent task merge", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      // Alpha's transport loss outlasts every re-dispatch; beta lands while it
      // is still faulting, so the slug is confined and the fault is named last.
      harness.script(
        (req) =>
          fakeTurnResult(req, {
            stop: { kind: "infra", cause: "network", details: "ECONNRESET" },
          }),
        {
          when: whenTurn({ slug: "alpha", step: "implement" }),
          fallback: true,
        },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "beta implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "beta", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "beta", step: "review" }) },
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      const sleeps: number[] = [];
      const result = await runDispatch(runtime, {
        iteration: 1,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      expect(result.reason).toBe("infra");
      expect(result.cause).toContain("alpha");
      expect(result.cause).toContain("network");
      // The bounded backoffs, then the fault is named: never an endless spin.
      expect(sleeps).toEqual([1_000, 2_000]);
      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).slug === "alpha"),
      ).toHaveLength(3);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.alpha!.turns).toBe(0);
      expect(state.tasks.beta!.status).toBe("merged");
      expect(
        records.filter(
          (r) => r.slug === "beta" && r.step === "merge" && r.ok === true,
        ),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "alpha" && r.step === "park"),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("ends a launch with a summary and exit 1 when the harness is out of quota", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(
          goal.goalDir,
          "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n",
        );
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeGoalTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
        ctx.writeOutcome(outcome({ summary: "filed alpha" }));
        return fakeTurnResult(req);
      });
      // Every re-dispatch still draws quota: the launch ends infra only after
      // the bounded retries are spent.
      harness.script(
        (req) =>
          fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
        { when: whenTurn({ step: "implement" }), fallback: true },
      );

      await expectLaunch(1, goal.repo, harness, 2);

      const state = await stateOf(goal.goalDir);
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.alpha!.turns).toBe(0);
      expect(state.tasks.alpha!.phase).toBe("implement");
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).toContain("infrastructure stop during iteration 1");
      expect(
        fs.existsSync(path.join(goal.goalDir, "iterations/2/summary.md")),
      ).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("drives one task through ten-plus turns of glitches, repairs and change requests without parking it", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        reminders: 2,
        flows: {
          "implement-review": {
            steps: [
              { id: "implement", prompt: "implementer", alias: "implementer" },
              {
                id: "review",
                prompt: "reviewer",
                alias: "reviewer",
                review: true,
                changeRequests: 3,
              },
            ],
          },
        },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const implement = (content: string) => (req: any, ctx: any) => {
        fs.writeFileSync(
          path.join(req.cwd!, "task.txt"),
          `${content}\n`,
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: `wrote ${content}` }));
        return fakeTurnResult(req);
      };
      const review =
        (summary: string, verdict: "changes" | "approve") =>
        (req: any, ctx: any) => {
          ctx.writeOutcome(outcome({ summary, verdict }));
          return fakeTurnResult(req);
        };
      // Reported timeouts count as turns; each is a glitch the launch survives.
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "timeout" } }),
      );
      // Implement r1: a missing outcome spends a repair, then delivers.
      harness.script((req) => fakeTurnResult(req, { text: "no outcome" }));
      harness.script(implement("v1"));
      // Review r1: a missing verdict spends a repair, then requests changes.
      harness.script((req) => fakeTurnResult(req, { text: "no verdict" }));
      harness.script(review("needs another round", "changes"));
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "timeout" } }),
      );
      harness.script(implement("v2"));
      harness.script(review("still not there", "changes"));
      harness.script(implement("v3"));
      harness.script(review("approved", "approve"));

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      for (let launch = 0; launch < 2; launch += 1) {
        const stopped = await runDispatch(runtime, { iteration: 1 });
        expect(stopped.reason).toBe("infra");
      }
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.turns).toBeGreaterThanOrEqual(10);
      expect(
        records.filter(
          (r) =>
            r.slug === "task" &&
            r.step === "review" &&
            r.outcome?.verdict === "changes",
        ),
      ).toHaveLength(2);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
      expect(harness.calls.length).toBe(10);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
