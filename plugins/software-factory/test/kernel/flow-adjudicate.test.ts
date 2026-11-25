import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { reduceTask } from "../../src/kernel/derive-task.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { FlowDefinition, StepRecord } from "../../src/kernel/types.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/** The development flow with one adjudicator step after its review. */
function adjudicatedFlow(mode: "last" | "all", changeRequests = 2) {
  return {
    "implement-review": {
      steps: [
        { id: "implement", prompt: "implementer", alias: "implementer" },
        {
          id: "review",
          prompt: "reviewer",
          alias: "reviewer",
          review: true,
          changeRequests,
        },
        {
          id: "adjudicate",
          prompt: "adjudicator",
          alias: "reviewer",
          adjudicate: mode,
        },
        { id: "resolve", prompt: "steward", alias: "steward" },
      ],
    },
  };
}

function agentRecords(records: StepRecord[]): StepRecord[] {
  return records
    .filter((r) => r.slug === "task" && r.actor === "agent")
    .sort((a, b) => a.seq - b.seq);
}

function qaReviewAdjudicatedFlow(): FlowDefinition {
  return {
    steps: [
      { id: "implement", prompt: "implementer", alias: "implementer" },
      {
        id: "qa",
        prompt: "qa",
        alias: "qa",
        qa: true,
        changeRequests: 2,
        deliverable: "verdict",
      },
      {
        id: "review",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: 2,
      },
      {
        id: "adjudicate",
        prompt: "adjudicator",
        alias: "reviewer",
        adjudicate: "last",
      },
    ],
  };
}

function reviewChangesRecord(seq: number, round: number): StepRecord {
  return rec(seq, {
    slug: "task",
    step: "review",
    round,
    launchKind: "change-request",
    outcome: outcome({
      summary: "1. task.txt:1 needs v2",
      verdict: "changes",
    }),
  });
}

describe("review adjudication", () => {
  it("adjudicates on the review's own change requests, not the shared round", () => {
    // QA's two changes leave the review's first changes at global round 4.
    const flow = qaReviewAdjudicatedFlow();
    const first = reduceTask(
      task("task", { scope: ["task.txt"] }),
      [reviewChangesRecord(1, 4)],
      flow,
    );
    expect(first.phase).toBe("implement");

    const second = reduceTask(
      task("task", { scope: ["task.txt"] }),
      [reviewChangesRecord(1, 4), reviewChangesRecord(2, 6)],
      flow,
    );
    expect(second.phase).toBe("adjudicate");
  });

  it("never hands a discarded finding to the implementer or the next review", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { flows: adjudicatedFlow("all") },
    });
    try {
      const scope1 = await neverHandsDiscardedFindingPart1();
      const scope2 = await neverHandsDiscardedFindingPart2(repo, goal, scope1);
      await neverHandsDiscardedFindingPart3(repo, scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("adjudicates only the last change-bearing review cycle on `last`", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { flows: adjudicatedFlow("last") },
    });
    try {
      const scope1 = await adjudicatesOnlyLastChangeBearingPart1();
      const scope2 = await adjudicatesOnlyLastChangeBearingPart2(
        repo,
        goal,
        scope1,
      );
      await adjudicatesOnlyLastChangeBearingPart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a rejecting adjudicator and keeps the branch unmerged", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { flows: adjudicatedFlow("all") },
    });
    try {
      const scope1 = await parksRejectingAdjudicatorKeepsPart1(repo, goal);
      await parksRejectingAdjudicatorKeepsPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

async function parksRejectingAdjudicatorKeepsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "v1" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "1. task.txt:1 must say v2",
          verdict: "changes",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
  harness.script(
    (req, ctx) => {
      expect(req.prompt).toContain("1. task.txt:1 must say v2");
      ctx.writeOutcome(
        outcome({ summary: "the work must not ship", verdict: "reject" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "adjudicate" }) },
  );
  scriptStallLeave(harness, ["task"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  expect(agentRecords(records).map((r) => `${r.step} r${r.round}`)).toEqual([
    "implement r1",
    "review r1",
    "adjudicate r1",
  ]);
  const park = records.find((r) => r.slug === "task" && r.step === "park");

  return { runtime, records, park };
}

async function parksRejectingAdjudicatorKeepsPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof parksRejectingAdjudicatorKeepsPart1>>,
) {
  const { park, runtime, records } = scope;
  expect(park?.cause?.kind).toBe("review-rejected");
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("parked");
  expect(
    repo.git(["show", "factory/demo:task.txt"], { allowFail: true }).code,
  ).not.toBe(0);
}

async function adjudicatesOnlyLastChangeBearingPart1() {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "v1" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "1. task.txt:1 must say v2",
          verdict: "changes",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
  // Round 1 is not the final change-bearing cycle: no adjudicator runs.
  harness.script(
    (req, ctx) => {
      expect(req.prompt).toContain("1. task.txt:1 must say v2");
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
      ctx.writeOutcome(
        outcome({
          summary: "raised to v2",
          replies: [{ finding: 1, reply: "raised to v2" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );

  return { harness };
}

async function adjudicatesOnlyLastChangeBearingPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  scope: Awaited<ReturnType<typeof adjudicatesOnlyLastChangeBearingPart1>>,
) {
  const { harness } = scope;
  harness.script(
    (req, ctx) => {
      expect(req.prompt).toContain("round: `2` of `3`");
      ctx.writeOutcome(
        outcome({
          summary: "1. task.txt:1 still reads v2",
          verdict: "changes",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
  harness.script(
    (req, ctx) => {
      // The final change-bearing cycle: discard the finding and ship.
      expect(req.prompt).toContain("- round: `2`");
      expect(req.prompt).toContain("1. task.txt:1 still reads v2");
      ctx.writeOutcome(
        outcome({ summary: "finding discarded", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "adjudicate" }) },
  );

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();
  expect(agentRecords(records).map((r) => `${r.step} r${r.round}`)).toEqual([
    "implement r1",
    "review r1",
    "implement r2",
    "review r2",
    "adjudicate r2",
  ]);

  return { ...scope, runtime, records };
}

async function adjudicatesOnlyLastChangeBearingPart3(
  scope: Awaited<ReturnType<typeof adjudicatesOnlyLastChangeBearingPart2>>,
) {
  const { runtime, records } = scope;
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
}

async function neverHandsDiscardedFindingPart1() {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "v1" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      expect(req.prompt).toContain("round: `1` of `3`");
      ctx.writeOutcome(
        outcome({
          summary:
            "1. task.txt:1 must say v2\n2. task.txt:1 is slop without a rule",
          verdict: "changes",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
  harness.script(
    (req, ctx) => {
      // The adjudicator is the only reader of the full review.
      expect(req.prompt).toContain("1. task.txt:1 must say v2");
      expect(req.prompt).toContain("2. task.txt:1 is slop without a rule");
      expect(req.prompt).toContain("- round: `1`");
      // Finding 2 is taste without a rule: discard it, keep finding 1.
      ctx.writeOutcome(
        outcome({
          summary: "1. task.txt:1 must say v2",
          verdict: "changes",
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "adjudicate" }) },
  );

  return { harness };
}

async function neverHandsDiscardedFindingPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  scope: Awaited<ReturnType<typeof neverHandsDiscardedFindingPart1>>,
) {
  const { harness } = scope;
  harness.script(
    (req, ctx) => {
      expect(req.prompt).toContain("1. task.txt:1 must say v2");
      expect(req.prompt).not.toContain("is slop without a rule");
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
      ctx.writeOutcome(
        outcome({
          summary: "raised to v2",
          replies: [{ finding: 1, reply: "raised to v2" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      // The next review re-judges the adjudicator's findings, not the
      // reviewer's discarded one.
      expect(req.prompt).toContain("1. task.txt:1 must say v2");
      expect(req.prompt).not.toContain("is slop without a rule");
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );

  const records = await runtime.store.listRecords();

  return { ...scope, runtime, records };
}

async function neverHandsDiscardedFindingPart3(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof neverHandsDiscardedFindingPart2>>,
) {
  const { records, runtime } = scope;
  expect(agentRecords(records).map((r) => `${r.step} r${r.round}`)).toEqual([
    "implement r1",
    "review r1",
    "adjudicate r1",
    "implement r2",
    "review r2",
  ]);
  expect(
    records.find((r) => r.slug === "task" && r.step === "adjudicate")?.outcome
      ?.verdict,
  ).toBe("changes");
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
  expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe("v2");
}
