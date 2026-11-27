import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { DEFAULT_FLOWS, reduceTask } from "../../src/kernel/derive-task.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { launchKindOf } from "../../src/kernel/metrics.js";
import { qaReportOf } from "../../src/kernel/qa.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
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

async function makeFlowRuntime(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
): Promise<void> {
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
}

/** The v1 implement turn, the QA accept and the reviewer's approval. */
function scriptAcceptFlow(harness: FakeHarness): void {
  harness.script((req: TurnRequest, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script(
    (req: TurnRequest, ctx) => {
      expect(req.prompt).toContain("- checks: `pass`");
      expect(req.prompt).toContain("- round: `1` of `3`");
      expect(req.prompt).toContain("qa:");
      expect(req.prompt).toContain("verdict: accept");
      ctx.writeOutcome(
        outcome({ summary: "accepted", qa: { verdict: "accept" } }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "qa" }) },
  );
  harness.script((req: TurnRequest, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

async function runFirstDevFlow() {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  scriptAcceptFlow(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  expect(
    runtime.configs.process.flows["implement-review"]!.steps.map(
      (step) => step.id,
    ),
  ).toEqual(["implement", "qa", "review", "resolve"]);
  await makeFlowRuntime(runtime);
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  return { repo, runtime };
}

async function expectFirstDevFlow(runtime: KernelRuntime): Promise<void> {
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
  expect(records.filter((r) => r.slug === "task" && r.step === "park")).toEqual(
    [],
  );
}

/** A QA turn with no verdict: the kernel repairs it before the review reads the tree. */
async function runQaVerdictRepair() {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req: TurnRequest, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script(
    (req: TurnRequest, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no verdict yet" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "qa" }) },
  );
  harness.script((req: TurnRequest, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await makeFlowRuntime(runtime);
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  return { repo, runtime, harness };
}

async function expectQaVerdictRepair(
  runtime: KernelRuntime,
  harness: FakeHarness,
): Promise<void> {
  const qaCalls = harness.calls.filter((call) =>
    whenTurn({ step: "qa" })(call),
  );
  expect(qaCalls).toHaveLength(2);
  expect(qaCalls[1]!.prompt).toContain("qa verdict is required");
  expect(qaCalls[1]!.prompt).toContain("qa:");
  expect(qaCalls[1]!.prompt).toContain("verdict: accept");

  const records = await runtime.store.listRecords();
  const qa = records.find(
    (r) => r.slug === "task" && r.step === "qa" && r.actor === "agent",
  )!;
  expect(qaReportOf(qa.outcome)?.verdict).toBe("accept");
  expect(records.filter((r) => r.slug === "task" && r.step === "park")).toEqual(
    [],
  );
}

/** Two QA rounds: changes with a finding, then accept after the implementer's fix. */
function scriptQaChangesFlow(harness: FakeHarness): void {
  harness.script((req: TurnRequest, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script(
    (req: TurnRequest, ctx) => {
      expect(req.prompt).toContain("- round: `1` of `3`");
      ctx.writeOutcome(
        outcome({
          summary: "needs another pass",
          qa: { verdict: "changes", findings: ["task.txt:1 needs v2"] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "qa" }) },
  );
  harness.script((req: TurnRequest, ctx) => {
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
    (req: TurnRequest, ctx) => {
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
  harness.script((req: TurnRequest, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

async function runQaChangesFlow() {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  scriptQaChangesFlow(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await makeFlowRuntime(runtime);
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  return { repo, runtime };
}

async function expectQaChangesFlow(
  runtime: KernelRuntime,
  repo: Awaited<ReturnType<typeof setupFlowRepo>>["repo"],
): Promise<void> {
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
  expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe("v2");
}

/** QA edits its own test file: the kernel gates it before the reviewer reads the tree. */
function scriptQaEditFlow(harness: FakeHarness): void {
  harness.script((req: TurnRequest, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script(
    (req: TurnRequest, ctx) => {
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
  harness.script((req: TurnRequest, ctx) => {
    expect(req.prompt).toContain("- checks: `pass`");
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

async function runQaEditFlow() {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  scriptQaEditFlow(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("task", { scope: ["task.txt", "qa.test.ts"] }));
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  return { repo, runtime };
}

async function expectQaEditFlow(
  runtime: KernelRuntime,
  repo: Awaited<ReturnType<typeof setupFlowRepo>>["repo"],
): Promise<void> {
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
}

describe("default development flow", () => {
  it("runs implement, checks, QA, review in that order", async () => {
    const { repo, runtime } = await runFirstDevFlow();
    try {
      await expectFirstDevFlow(runtime);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("repairs a QA turn that delivers no qa verdict", async () => {
    const { repo, runtime, harness } = await runQaVerdictRepair();
    try {
      await expectQaVerdictRepair(runtime, harness);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("routes QA changes back to the implementer and gates the fix before QA reads it", async () => {
    const { repo, runtime } = await runQaChangesFlow();
    try {
      await expectQaChangesFlow(runtime, repo);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("gates QA's own test edits before the reviewer reads the tree", async () => {
    const { repo, runtime } = await runQaEditFlow();
    try {
      await expectQaEditFlow(runtime, repo);
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
  it("raises the last-call signal when QA changes after its own requests are spent", () => {
    const reduction = reduceTask(
      task("a"),
      [
        qaRecord(1, 1, "changes", ["task.txt:1 needs work"]),
        qaRecord(2, 2, "changes", ["task.txt:1 still needs work"]),
        qaRecord(3, 3, "changes", ["task.txt:1 needs work"]),
      ],
      DEFAULT_FLOWS["implement-review"]!,
    );
    expect(reduction.phase).toBe("decide");
    expect(reduction.park).toBeUndefined();
    expect(reduction.pendingSignal).toEqual({
      kind: "invalid-outcome",
      evidence: "qa changes on the last acceptance call: qa",
    });
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
