// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
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

describe("review adjudication", () => {
  it("never hands a discarded finding to the implementer or the next review", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { flows: adjudicatedFlow("all") },
    });
    try {
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
          ctx.writeOutcome(
            outcome({ summary: "approved", verdict: "approve" }),
          );
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
      expect(agentRecords(records).map((r) => `${r.step} r${r.round}`)).toEqual(
        [
          "implement r1",
          "review r1",
          "adjudicate r1",
          "implement r2",
          "review r2",
        ],
      );
      expect(
        records.find((r) => r.slug === "task" && r.step === "adjudicate")
          ?.outcome?.verdict,
      ).toBe("changes");
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
        "v2",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("adjudicates only the last change-bearing review cycle on `last`", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { flows: adjudicatedFlow("last") },
    });
    try {
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
      expect(agentRecords(records).map((r) => `${r.step} r${r.round}`)).toEqual(
        [
          "implement r1",
          "review r1",
          "implement r2",
          "review r2",
          "adjudicate r2",
        ],
      );
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a rejecting adjudicator and keeps the branch unmerged", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { flows: adjudicatedFlow("all") },
    });
    try {
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
      expect(agentRecords(records).map((r) => `${r.step} r${r.round}`)).toEqual(
        ["implement r1", "review r1", "adjudicate r1"],
      );
      const park = records.find((r) => r.slug === "task" && r.step === "park");
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
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
