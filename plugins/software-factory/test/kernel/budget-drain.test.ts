// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  emptyUsage,
  FakeHarness,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { iterationMetrics } from "../../src/kernel/metrics.js";
import { loadPriceTable } from "../../src/kernel/openrouter.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { task, cause } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("iteration USD brake", () => {
  it("drains when priced spend crosses the limit, finishes started work and reports the blind turns", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, iterationUsd: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "a implemented" }));
        return fakeTurnResult(req, { usage: { costUsd: 0.7 } });
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "a approved", verdict: "approve" }),
        );
        return fakeTurnResult(req, { usage: { costUsd: 0.2 } });
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "architect",
          round: 1,
          actor: "agent",
          alias: "architect",
          model: { id: "fake-architect" },
        },
        {
          stop: { kind: "done" },
          usage: { ...emptyUsage(), costUsd: 0.4 },
          outcome: outcome({ summary: "go", decision: "continue" }),
        },
      );
      // Neither harness nor OpenRouter priced this turn, so the brake sees $0.
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "pm",
          round: 1,
          actor: "agent",
          alias: "pm",
          model: { id: "fake-pm" },
        },
        {
          stop: { kind: "done" },
          usage: emptyUsage(),
          outcome: outcome({ summary: "filed" }),
        },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      expect(result.cause).toEqual(
        cause("budget: iteration USD limit $1.0000 reached (spent $1.1000)"),
      );
      // a's review ran after the brake fired: started work finishes, b never starts.
      expect(harness.calls.length).toBe(2);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
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
        prices: await loadPriceTable(runtime.priceSource),
      });
      const text = fs.readFileSync(
        path.join(runtime.store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      // The PM turn is fully unpriced; the implement and review turns are
      // priced but their recorded compactions have no OpenRouter entry, so each
      // counts blind too.
      expect(text).toContain(
        "- budget: iteration USD limit $1.0000 reached (spent $1.1000); brake blind for 3 unpriced turns",
      );
      expect(text).not.toContain("boundary: budget");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("counts every reported attempt toward the USD brake, equal to the metrics figure", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, iterationUsd: 1 },
      priceTable: {
        "retry/model": {
          input: 4,
          cachedInput: 0.2,
          output: 20,
          reasoning: 20,
        },
      },
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      // A turn that retried onto another model: the harness priced one call,
      // OpenRouter prices the other. `usage` repeats only the last call, so
      // counting it as well would double that call.
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "architect",
          round: 1,
          actor: "agent",
          alias: "architect",
          model: { id: "retry/model" },
        },
        {
          stop: { kind: "done" },
          usage: { ...emptyUsage(), in: 1_000_000 },
          attempts: [
            {
              model: { id: "mystery/model" },
              stop: { kind: "infra", cause: "quota" },
              usage: { ...emptyUsage(), costUsd: 0.5 },
            },
            {
              model: { id: "retry/model" },
              stop: { kind: "done" },
              usage: { ...emptyUsage(), in: 1_000_000 },
            },
          ],
          outcome: outcome({ summary: "go", decision: "continue" }),
        },
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      const records = await runtime.store.listRecords();
      const metrics = iterationMetrics(
        1,
        "in-progress",
        records,
        {},
        0,
        await loadPriceTable(runtime.priceSource),
      );

      expect(metrics.usage.costUsd).toBeCloseTo(4.5, 10);
      // $0.50 from the harness-priced first call plus $4.00 from the
      // OpenRouter-priced second: `usage`'s $4.00 last call is not added a second time.
      expect(result.reason).toBe("drained");
      expect(result.cause).toEqual(
        cause("budget: iteration USD limit $1.0000 reached (spent $4.5000)"),
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("ignores priced spend from earlier iterations", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, iterationUsd: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      for (let i = 0; i < 4; i += 1) {
        harness.script((req, ctx) => {
          const slug = path.basename(req.cwd!);
          if (req.prompt.startsWith("You review")) {
            ctx.writeOutcome(
              outcome({ summary: `${slug} review`, verdict: "approve" }),
            );
          } else {
            fs.writeFileSync(
              path.join(req.cwd!, `${slug}.txt`),
              `${slug}\n`,
              "utf8",
            );
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
        {
          iteration: 1,
          step: "pm",
          round: 1,
          actor: "agent",
          alias: "pm",
          model: { id: "fake-pm" },
        },
        {
          stop: { kind: "done" },
          usage: { ...emptyUsage(), costUsd: 5 },
          outcome: outcome({ summary: "filed" }),
        },
      );

      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");
      expect(result.cause).toBeUndefined();
      expect(harness.calls.length).toBe(4);
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.b!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("prices harness-silent turns from the price cache and reports no blind turns", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, iterationUsd: 1 },
      priceTable: {
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
        ctx.writeOutcome(
          outcome({ summary: "a approved", verdict: "approve" }),
        );
        return fakeTurnResult(req, { usage: { in: 100_000 } });
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a.txt"] }));
      await writeTask(runtime, task("b", { scope: ["b.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("drained");
      // $1.00 of OpenRouter-priced input crossed the $1 brake; the review then finished.
      expect(result.cause).toEqual(
        cause("budget: iteration USD limit $1.0000 reached (spent $1.0000)"),
      );
      expect(harness.calls.length).toBe(2);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.b!.status).toBe("ready");

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
        cause: result.cause,
        prices: await loadPriceTable(runtime.priceSource),
      });
      const text = fs.readFileSync(
        path.join(runtime.store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(text).toContain(
        "- budget: iteration USD limit $1.0000 reached (spent $1.0000); brake blind for 0 unpriced turns",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("treats an unpriced turn as $0 and does not trip the brake", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 }, iterationUsd: 0.01 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req, {
          usage: { in: 5_000_000, out: 1_000_000 },
        });
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
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("leaves dispatch unchanged when no limit is configured", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      for (let i = 0; i < 4; i += 1) {
        harness.script((req, ctx) => {
          const slug = path.basename(req.cwd!);
          if (req.prompt.startsWith("You review")) {
            ctx.writeOutcome(
              outcome({ summary: `${slug} review`, verdict: "approve" }),
            );
          } else {
            fs.writeFileSync(
              path.join(req.cwd!, `${slug}.txt`),
              `${slug}\n`,
              "utf8",
            );
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
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.a!.status).toBe("merged");
      expect(state.tasks.b!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
