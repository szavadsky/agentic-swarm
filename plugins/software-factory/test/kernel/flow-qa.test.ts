// biome-ignore-all lint/complexity: split-flow-dispatch
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { launchKindOf } from "../../src/kernel/metrics.js";
import { qaReportOf } from "../../src/kernel/qa.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function qaOutcome(
  verdict: "accept" | "changes",
  findings: string[] = [],
  summary = "qa",
): StepRecord["outcome"] {
  return {
    status: "done",
    summary,
    concerns: [],
    forward: [],
    qa: { verdict, findings },
  } as StepRecord["outcome"];
}

function qaRecord(
  seq: number,
  round: number,
  verdict: "accept" | "changes",
  findings: string[] = [],
  summary = "qa",
): StepRecord {
  return rec(seq, {
    step: "qa",
    round,
    tree: "tree-1",
    outcome: qaOutcome(verdict, findings, summary),
  });
}

describe("default development flow", () => {
  it("runs implement, checks, QA, review in that order", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("- checks: `pass`");
          expect(req.prompt).toContain("- round: `1` of `3`");
          expect(req.prompt).toContain("qa: {verdict");
          ctx.writeOutcome(
            outcome({ summary: "accepted", qa: { verdict: "accept" } }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "qa" }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      expect(
        runtime.configs.process.flows["implement-review"]!.steps.map(
          (step) => step.id,
        ),
      ).toEqual(["implement", "qa", "review", "resolve"]);
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const agents = records
        .filter((r) => r.slug === "task" && r.actor === "agent")
        .sort((a, b) => a.seq - b.seq);
      expect(agents.map((r) => r.step)).toEqual(["implement", "qa", "review"]);
      expect(qaReportOf(agents[1]!.outcome)?.verdict).toBe("accept");

      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      // The checks before QA already judged the accepted tree: no duplicate
      // run before the reviewer.
      expect(checks).toHaveLength(1);
      expect(checks[0]!.seq).toBeGreaterThan(agents[0]!.seq);
      expect(checks[0]!.seq).toBeLessThan(agents[1]!.seq);

      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("repairs a QA turn that delivers no qa verdict", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script(
        (_req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "no verdict yet" }));
          return fakeTurnResult(_req);
        },
        { when: whenTurn({ step: "qa" }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const qaCalls = harness.calls.filter((call) =>
        whenTurn({ step: "qa" })(call),
      );
      expect(qaCalls).toHaveLength(2);
      expect(qaCalls[1]!.prompt).toContain("qa verdict is required");
      expect(qaCalls[1]!.prompt).toContain("qa: {verdict");

      const records = await runtime.store.listRecords();
      const qa = records.find(
        (r) => r.slug === "task" && r.step === "qa" && r.actor === "agent",
      )!;
      expect(qaReportOf(qa.outcome)?.verdict).toBe("accept");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("routes QA changes back to the implementer and gates the fix before QA reads it", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("- round: `1` of `3`");
          ctx.writeOutcome(
            outcome({
              summary: "needs another pass",
              qa: {
                verdict: "changes",
                findings: ["task.txt:1 needs v2"],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "qa" }) },
      );
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("1. task.txt:1 needs v2");
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(
          outcome({
            summary: "raised to v2",
            replies: [{ finding: 1, reply: "raised to v2" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("- round: `2` of `3`");
          expect(req.prompt).toContain("1. task.txt:1 needs v2");
          expect(req.prompt).toContain("finding 1: raised to v2");
          ctx.writeOutcome(
            outcome({ summary: "accepted", qa: { verdict: "accept" } }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "qa" }) },
      );
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const agents = records
        .filter((r) => r.slug === "task" && r.actor === "agent")
        .sort((a, b) => a.seq - b.seq);
      expect(agents.map((r) => `${r.step} r${r.round}`)).toEqual([
        "implement r1",
        "qa r1",
        "implement r2",
        "qa r2",
        "review r2",
      ]);
      expect(launchKindOf(agents[1]!)).toBe("qa-finding");
      expect(launchKindOf(agents[3]!)).toBeUndefined();

      const checks = records
        .filter((r) => r.slug === "task" && r.step === "checks")
        .sort((a, b) => a.seq - b.seq);
      expect(checks).toHaveLength(2);
      expect(checks[0]!.seq).toBeGreaterThan(agents[0]!.seq);
      expect(checks[0]!.seq).toBeLessThan(agents[1]!.seq);
      expect(checks[1]!.seq).toBeGreaterThan(agents[2]!.seq);
      expect(checks[1]!.seq).toBeLessThan(agents[3]!.seq);

      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.round).toBe(2);
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
        "v2",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("gates QA's own test edits before the reviewer reads the tree", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(
            path.join(req.cwd!, "qa.test.ts"),
            'throw new Error("covered");\n',
            "utf8",
          );
          ctx.writeOutcome(
            outcome({ summary: "added coverage", qa: { verdict: "accept" } }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "qa" }) },
      );
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("- checks: `pass`");
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("task", { scope: ["task.txt", "qa.test.ts"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const agents = records
        .filter((r) => r.slug === "task" && r.actor === "agent")
        .sort((a, b) => a.seq - b.seq);
      const qa = agents.find((r) => r.step === "qa")!;
      const review = agents.find((r) => r.step === "review")!;
      const checks = records
        .filter((r) => r.slug === "task" && r.step === "checks")
        .sort((a, b) => a.seq - b.seq);
      expect(checks).toHaveLength(2);
      expect(checks[0]!.seq).toBeLessThan(qa.seq);
      expect(checks[1]!.seq).toBeGreaterThan(qa.seq);
      expect(checks[1]!.seq).toBeLessThan(review.seq);
      expect(checks[1]!.tree).toBe(qa.tree);
      expect(review.commit).toBeDefined();

      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(repo.git(["show", "factory/demo:qa.test.ts"]).stdout).toContain(
        "covered",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps the QA step in the fallback flow catalog", () => {
    const steps = DEFAULT_FLOWS["implement-review"]!.steps;
    expect(steps.map((step) => step.id)).toEqual([
      "implement",
      "qa",
      "review",
      "resolve",
    ]);
    expect(steps.find((step) => step.id === "qa")?.qa).toBe(true);
  });
});

describe("QA contract breaches", () => {
  it("parks a QA change on the last acceptance call instead of routing it back", () => {
    const reduction = reduceTask(
      task("a"),
      [qaRecord(1, 3, "changes", ["task.txt:1 needs work"])],
      DEFAULT_FLOWS["implement-review"]!,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.park?.kind).toBe("invalid-outcome");
    expect(reduction.park?.detail).toContain("last acceptance call");
  });

  it("parks a QA change with no findings instead of sending an empty fix", () => {
    const reduction = reduceTask(
      task("a"),
      [qaRecord(1, 1, "changes", [])],
      DEFAULT_FLOWS["implement-review"]!,
    );
    expect(reduction.phase).toBe("parked");
    expect(reduction.park?.kind).toBe("invalid-outcome");
    expect(reduction.park?.detail).toContain("without findings");
  });
});
