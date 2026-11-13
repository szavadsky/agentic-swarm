import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, emptyUsage, fakeTurnResult } from "../../src/harness/fake/index.js";
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

describe("iteration USD brake", () => {
  it("drains when priced spend crosses the limit, finishes started work and reports the blind turns", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1, iterationUsd: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req, { usage: { costUsd: 0.7 } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "a approved", verdict: "approve" }));
        return fakeTurnResult(req, { usage: { costUsd: 0.2 } });
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));
      await runtime.store.appendRecord(
        { iteration: 1, step: "architect", round: 1, actor: "agent", alias: "architect", model: { id: "fake-architect" } },
        { stop: { kind: "done" }, usage: { ...emptyUsage(), costUsd: 0.4 }, outcome: outcome({ summary: "go", decision: "continue" }) }
      );
      // Neither harness nor price table priced this turn, so the brake sees $0.
      await runtime.store.appendRecord(
        { iteration: 1, step: "pm", round: 1, actor: "agent", alias: "pm", model: { id: "fake-pm" } },
        { stop: { kind: "done" }, usage: emptyUsage(), outcome: outcome({ summary: "filed" }) }
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      expect(result.cause).toBe("budget: iteration USD limit $1.0000 reached (spent $1.1000)");
      // a's review ran after the brake fired: started work finishes, b never starts.
      expect(harness.calls.length).toBe(2);

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.b!.status).toBe("ready");
      expect(state.tasks.b!.cause).toBeUndefined();
      expect(state.tasks.b!.turns).toBe(0);
      expect(records.filter((r) => r.slug === "b")).toEqual([]);

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
        cause: result.cause,
        prices: runtime.configs.run.prices,
      });
      const text = fs.readFileSync(path.join(runtime.store.goalDir, "iterations/1/summary.md"), "utf8");
      expect(text).toContain(
        "- budget: iteration USD limit $1.0000 reached (spent $1.1000); brake blind for 1 unpriced turn"
      );
      expect(text).not.toContain("boundary: budget");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("ignores priced spend from earlier iterations", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1, iterationUsd: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      for (let i = 0; i < 4; i += 1) {
        harness.script((req, ctx) => {
          const slug = path.basename(req.cwd!);
          if (req.prompt.startsWith("You review")) {
            ctx.writeOutcome(outcome({ summary: `${slug} review`, verdict: "approve" }));
          } else {
            fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
            ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
          }
          return fakeTurnResult(req, { usage: emptyUsage() });
        });
      }

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));
      // The previous iteration spent far past the brake; the new one starts clean.
      await runtime.store.appendRecord(
        { iteration: 1, step: "pm", round: 1, actor: "agent", alias: "pm", model: { id: "fake-pm" } },
        { stop: { kind: "done" }, usage: { ...emptyUsage(), costUsd: 5 }, outcome: outcome({ summary: "filed" }) }
      );

      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");
      expect(result.cause).toBeUndefined();
      expect(harness.calls.length).toBe(4);
      const state = derive(await runtime.store.listTasks(), await runtime.store.listRecords(), runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.b!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("prices harness-silent turns from run.prices and reports no blind turns", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: 1, iterationUsd: 1 },
      prices: {
        "fake-impl": { input: 1, cachedInput: 0, output: 0, reasoning: 0 },
        "fake-review": { input: 1, cachedInput: 0, output: 0, reasoning: 0 },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req, { usage: { in: 1_000_000 } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "a approved", verdict: "approve" }));
        return fakeTurnResult(req, { usage: { in: 100_000 } });
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      // $1.00 of table-priced input crossed the $1 brake; the review then finished.
      expect(result.cause).toBe("budget: iteration USD limit $1.0000 reached (spent $1.0000)");
      expect(harness.calls.length).toBe(2);

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.b!.status).toBe("ready");

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
        cause: result.cause,
        prices: runtime.configs.run.prices,
      });
      const text = fs.readFileSync(path.join(runtime.store.goalDir, "iterations/1/summary.md"), "utf8");
      expect(text).toContain(
        "- budget: iteration USD limit $1.0000 reached (spent $1.0000); brake blind for 0 unpriced turns"
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("treats an unpriced turn as $0 and does not trip the brake", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1, iterationUsd: 0.01 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req, { usage: { in: 5_000_000, out: 1_000_000 } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req, { usage: { in: 2_000_000 } });
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(result.cause).toBeUndefined();
      const state = derive(await runtime.store.listTasks(), await runtime.store.listRecords(), runtime.configs.process.flows);
      expect(state.tasks.task!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("leaves dispatch unchanged when no limit is configured", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      for (let i = 0; i < 4; i += 1) {
        harness.script((req, ctx) => {
          const slug = path.basename(req.cwd!);
          if (req.prompt.startsWith("You review")) {
            ctx.writeOutcome(outcome({ summary: `${slug} review`, verdict: "approve" }));
          } else {
            fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
            ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
          }
          return fakeTurnResult(req, { usage: { costUsd: 5 } });
        });
      }

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const state = derive(await runtime.store.listTasks(), await runtime.store.listRecords(), runtime.configs.process.flows);
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.b!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
