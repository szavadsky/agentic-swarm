import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type FakeTurnHandler,
  FakeHarness,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

type WriteCtx = { writeOutcome(value: unknown): void };

const implement =
  (version: string): FakeTurnHandler =>
  (req: TurnRequest, ctx: WriteCtx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), `${version}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: version }));
    return fakeTurnResult(req);
  };

const qaChanges =
  (round: number, finding: string): FakeTurnHandler =>
  (req: TurnRequest, ctx: WriteCtx) => {
    expect(req.prompt).toContain(`round: \`${round}\` of \`3\``);
    expect(req.prompt).not.toContain("This is QA's last acceptance call");
    ctx.writeOutcome(
      outcome({
        summary: finding,
        qa: { verdict: "changes", findings: [finding] },
      }),
    );
    return fakeTurnResult(req);
  };

const qaAccept: FakeTurnHandler = (req: TurnRequest, ctx: WriteCtx) => {
  expect(req.prompt).toContain("round: `3` of `3`");
  expect(req.prompt).toContain("This is QA's last acceptance call");
  ctx.writeOutcome(outcome({ summary: "accepted", qa: { verdict: "accept" } }));
  return fakeTurnResult(req);
};

const reviewChanges =
  (reviews: string[], finding: string): FakeTurnHandler =>
  (req: TurnRequest, ctx: WriteCtx) => {
    reviews.push(req.prompt);
    ctx.writeOutcome(outcome({ summary: `1. ${finding}`, verdict: "changes" }));
    return fakeTurnResult(req);
  };

const reviewApprove =
  (reviews: string[]): FakeTurnHandler =>
  (req: TurnRequest, ctx: WriteCtx) => {
    reviews.push(req.prompt);
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  };

/** QA spends both of its change requests; the reviewer then spends its own two. */
function scriptFlow(harness: FakeHarness): string[] {
  const reviews: string[] = [];
  const qa = { when: whenTurn({ step: "qa" }) };
  harness.script(implement("v1"));
  harness.script(qaChanges(1, "task.txt:1 needs v2"), qa);
  harness.script(implement("v2"));
  harness.script(qaChanges(2, "task.txt:1 needs v3"), qa);
  harness.script(implement("v3"));
  harness.script(qaAccept, qa);
  harness.script(reviewChanges(reviews, "task.txt:1 needs v4"));
  harness.script(implement("v4"));
  harness.script(qaAccept, qa);
  harness.script(reviewChanges(reviews, "task.txt:1 needs v5"));
  harness.script(implement("v5"));
  harness.script(qaAccept, qa);
  harness.script(reviewApprove(reviews));
  return reviews;
}

/** One review's last-call prompt is the third call of its own budget. */
function expectReviewCalls(reviews: string[]): void {
  expect(reviews).toHaveLength(3);
  expect(reviews[0]).toContain("round: `1` of `3`");
  expect(reviews[0]).not.toContain("This is the last call");
  expect(reviews[1]).toContain("round: `2` of `3`");
  expect(reviews[1]).not.toContain("This is the last call");
  expect(reviews[2]).toContain("round: `3` of `3`");
  expect(reviews[2]).toContain("This is the last call");
}

describe("per-agent rounds", () => {
  it("gives the reviewer its own change requests after QA spent both", async () => {
    const { repo, goal } = setupFlowRepo();
    const harness = new FakeHarness({ id: "fake" });
    const reviews = scriptFlow(harness);
    try {
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expectReviewCalls(reviews);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.launches.qa).toEqual({
        glitches: 0,
        changeRequests: 2,
        failures: 0,
      });
      expect(state.tasks.task!.launches.review).toEqual({
        glitches: 0,
        changeRequests: 2,
        failures: 0,
      });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
