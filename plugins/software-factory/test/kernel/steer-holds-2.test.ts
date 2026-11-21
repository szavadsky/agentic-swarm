import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer, scanInbox } from "../../src/kernel/mailbox.js";
import { cause, causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  implementer,
  tasks,
  writeHold,
} from "./steer-holds-helpers.js";

function registerMidRunSteerHoldsPart6(): void {
  it("an urgent steer drains dispatch, leaves the steer for the next consult, and lets in-flight work finish", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(
            runtime.store,
            "s1",
            "---\nurgent: true\n---\nStop the rollout and consult me.",
          );
        }),
      );
      harness.script(approver("alpha is correct"));
      // Without the drain, gamma would run and need these next two scripts.
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(dispatched.cause).toEqual(cause("steer: s1 marked urgent"));

      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("ready");
      const records = await runtime.store.listRecords();
      expect(records.some((record) => record.slug === "gamma")).toBe(false);
      // Urgent is the owner's exception: the PM does not answer it and the
      // steer stays pending for the consult the next iteration opens.
      expect(records.filter((record) => record.step === "pm")).toHaveLength(0);
      const pending = await scanInbox(runtime.store, { settleMs: 0 });
      expect(pending.map((steer) => [steer.id, steer.urgent])).toEqual([
        ["s1", true],
      ]);
      expect(harness.calls).toHaveLength(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart7(): void {
  it("charges the steer PM turn to the iteration dollar brake", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, iterationUsd: 5 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(async (req, ctx) => {
        await postSteer(runtime.store, "s1", "Hold alpha for now.");
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req, { usage: { costUsd: 1 } });
      });
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha"]);
        ctx.writeOutcome(outcome({ summary: "held alpha" }));
        return fakeTurnResult(req, { usage: { costUsd: 10 } });
      });
      // Alpha started before the brake, so it runs to the end despite its hold.
      harness.script(approver("alpha is correct"));
      // If the PM turn were free, gamma would run and need these.
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(causeText(dispatched.cause)).toContain(
        "budget: iteration USD limit $5.0000 reached",
      );
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("ready");
      expect(
        (await runtime.store.listRecords()).some((r) => r.slug === "gamma"),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart8(): void {
  it("restores a task file the steer turn edits and records the failed guard", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      const taskFile = path.join(runtime.store.tasksDir, "alpha.md");
      const original = fs.readFileSync(taskFile, "utf8");

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(
            runtime.store,
            "s1",
            "Structure me; write no task file.",
          );
        }),
      );
      harness.script((req, ctx) => {
        // A malformed file would throw out of the next derive without the guard.
        fs.writeFileSync(taskFile, "# not a task file\n\nbroken: [\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tried to rewrite alpha" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
      });
      expect(dispatched.reason).toBe("boundary");
      expect(fs.readFileSync(taskFile, "utf8")).toBe(original);
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");

      const records = await runtime.store.listRecords();
      const guard = records.find((record) => record.step === "steer-reconcile");
      expect(guard?.ok).toBe(false);
      expect(causeText(guard?.cause)).toContain("tasks/alpha.md");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMidRunSteerHoldsPart9(): void {
  it("removes a plan the steer turn creates when none existed", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      expect(fs.existsSync(planPath)).toBe(false);

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Structure me; do not plan.");
        }),
      );
      harness.script((req, ctx) => {
        // An empty plan.md would send the next front to the boundary instead of
        // dispatching the tasks that already exist.
        fs.writeFileSync(
          planPath,
          "# Plan\n\n## smuggled\nPM-authored direction.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "tried to write a plan" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
      });
      expect(dispatched.reason).toBe("boundary");
      expect(fs.existsSync(planPath)).toBe(false);
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");

      const guard = (await runtime.store.listRecords()).find(
        (record) => record.step === "steer-reconcile",
      );
      expect(guard?.ok).toBe(false);
      expect(causeText(guard?.cause)).toContain("plan.md");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("mid-run steer holds", () => {
  registerMidRunSteerHoldsPart6();

  registerMidRunSteerHoldsPart7();

  registerMidRunSteerHoldsPart8();

  registerMidRunSteerHoldsPart9();
});
