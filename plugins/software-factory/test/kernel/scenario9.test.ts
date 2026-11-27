import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptDecider,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

describe("KERNEL0 scenario 9 — no progress over the item history", () => {
  it("routes an A, B, A sequence that only a history comparison catches to the decider", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
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
      const scope1 = await parksBSequenceOnlyHistoryPart1(repo, goal);
      await parksBSequenceOnlyHistoryPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

async function parksBSequenceOnlyHistoryPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const implement =
    (content: string, label: string) => (req: any, ctx: any) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), `${content}\n`, "utf8");
      ctx.writeOutcome(outcome({ summary: label }));
      return fakeTurnResult(req);
    };
  const changes = (label: string) => (req: any, ctx: any) => {
    ctx.writeOutcome(outcome({ summary: label, verdict: "changes" }));
    return fakeTurnResult(req);
  };
  harness.script(implement("A", "attempt A"));
  harness.script(changes("round 1 needs work"));
  harness.script(implement("B", "attempt B"));
  harness.script(changes("round 2 needs work"));
  harness.script(implement("A", "attempt A again"));
  scriptDecider(harness, { summary: "park it", verdict: "reject" });
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
  expect(state.tasks.task!.cause?.kind).toBe("no-progress");
  expect(causeText(state.tasks.task!.cause)).toContain(
    "implement r3 repeats r1",
  );
  expect(state.tasks.task!.turns).toBe(6);
  expect(harness.calls.length).toBe(7);

  const incidents = records.filter(
    (r) =>
      r.slug === "task" && r.step === "park" && r.cause?.kind === "no-progress",
  );

  return { incidents };
}

async function parksBSequenceOnlyHistoryPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof parksBSequenceOnlyHistoryPart1>>,
) {
  const { incidents } = scope;
  expect(incidents.length).toBe(1);
  expect(
    repo.git(["show", "factory/demo:task.txt"], { allowFail: true }).code,
  ).not.toBe(0);
}
