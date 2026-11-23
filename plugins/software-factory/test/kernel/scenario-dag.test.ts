import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import { next } from "../../src/kernel/next.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/**
 * Two parallel productive steps joining into one reviewer. Step ids are single
 * tokens: the harness recovers a turn's step from its record directory name.
 */
function parallelFlow(): Record<string, unknown> {
  return {
    flows: {
      "two-parallel-review": {
        steps: [
          {
            id: "cotaa",
            prompt: "implementer",
            alias: "implementer",
            after: [],
          },
          {
            id: "cotbb",
            prompt: "implementer",
            alias: "implementer",
            after: [],
          },
          {
            id: "review",
            prompt: "reviewer",
            alias: "reviewer",
            review: true,
            changeRequests: 0,
            deliverable: "verdict",
            after: ["cotaa", "cotbb"],
          },
        ],
      },
    },
  };
}

function agentSteps(records: StepRecord[]): string[] {
  return records
    .filter((r) => r.slug === "task" && r.actor === "agent")
    .sort((a, b) => a.seq - b.seq)
    .map((r) => r.step);
}

function repoWithBoundaryAliases() {
  return setupFlowRepo({
    process: parallelFlow(),
    // A custom process replaces the default aliases, so the vocabulary
    // outside the flow must be restated.
    aliases: {
      architect: { harness: "fake", model: "fake-architect" },
      pm: { harness: "fake", model: "fake-pm" },
      digest: { harness: "fake", model: "fake-digest" },
      implementer: { harness: "fake", model: "fake-impl" },
      reviewer: { harness: "fake", model: "fake-review" },
      steward: { harness: "fake", model: "fake-steward" },
      "plan-checker": { harness: "fake", model: "fake-check" },
      intent: { harness: "fake", model: "fake-intent" },
      "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
      "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
    },
  });
}

function scriptParallel(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "a.txt"), "from-a\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "wrote a" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(fs.existsSync(path.join(req.cwd!, "a.txt"))).toBe(true);
    fs.writeFileSync(
      path.join(req.cwd!, "b.txt"),
      `${fs.readFileSync(path.join(req.cwd!, "a.txt"), "utf8").trim()}+b\n`,
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "wrote b on a" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(fs.existsSync(path.join(req.cwd!, "a.txt"))).toBe(true);
    expect(fs.existsSync(path.join(req.cwd!, "b.txt"))).toBe(true);
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

async function assertParallelMerged(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  repo: ReturnType<typeof setupFlowRepo>["repo"],
): Promise<void> {
  const records = await runtime.store.listRecords();
  expect(agentSteps(records)).toEqual(["cotaa", "cotbb", "review"]);
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:a.txt"]).stdout.trim()).toBe("from-a");
  expect(repo.git(["show", "factory/demo:b.txt"]).stdout.trim()).toBe(
    "from-a+b",
  );
}

async function runParallelPart1(): Promise<{
  repo: ReturnType<typeof setupFlowRepo>["repo"];
  runtime: Awaited<ReturnType<typeof makeRuntime>>;
}> {
  const { repo, goal } = repoWithBoundaryAliases();
  const harness = new FakeHarness({ id: "fake" });
  scriptParallel(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("task", { flow: "two-parallel-review", scope: ["a.txt", "b.txt"] }),
  );
  return { repo, runtime };
}

function runParallelMergedTest(): void {
  it("runs two parallel steps joining into a reviewer", async () => {
    const scope = await runParallelPart1();
    try {
      const result = await runDispatch(scope.runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      await assertParallelMerged(scope.runtime, scope.repo);
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
}

function runPredecessorBlockedTest(): void {
  it("a step whose predecessor never completes is not ready", async () => {
    const { repo, goal } = repoWithBoundaryAliases();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ status: "blocked", summary: "stuck" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "cotaa" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const taskFile = task("task", {
        flow: "two-parallel-review",
        scope: ["a.txt"],
      });
      await writeTask(runtime, taskFile);
      await blockedDrivenPart(runtime, taskFile);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

async function blockedDrivenPart(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  taskFile: ReturnType<typeof task>,
): Promise<void> {
  // Drive the first step, which reports blocked. The records it writes
  // are the whole derivation: the sibling step never becomes ready.
  const before = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  await executeTaskAction(
    runtime,
    taskFile,
    { kind: "step", slug: "task", step: "cotaa", round: 1 },
    1,
    before.tasks.task!,
  );
  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("parked");
  expect(agentSteps(records)).toEqual(["cotaa"]);
  // A terminal fact from the park record sets the task's phase to done.
  expect(state.tasks.task!.phase).toBe("done");
  // The phase derived from the parked records ends in `done`, never a
  // step whose predecessor never completed.
  expect(next(state, runtime.limits, new Set())).not.toContainEqual(
    expect.objectContaining({ step: "cotbb" }),
  );
}

describe("flows as DAGs", () => {
  runParallelMergedTest();
  runPredecessorBlockedTest();
});
