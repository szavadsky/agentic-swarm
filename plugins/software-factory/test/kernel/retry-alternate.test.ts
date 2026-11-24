import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  emptyUsage,
  FakeHarness,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { formatCause } from "../../src/kernel/cause.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  alternatePosition,
  stepTarget,
} from "../../src/kernel/flow-context.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { cause, causeText, script, task } from "./helpers.js";
import {
  aliases,
  failedOutcome,
  flowOf,
  process,
  stepRec,
} from "./retry-alternate-fixtures.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

describe("alternate position", () => {
  it("derives the alias from records: the step alias, then each alternate in order", async () => {
    const { repo, goal } = setupFlowRepo({ aliases, process });
    try {
      await derivesTheAliasFromRecordsPart1(repo, goal);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("counts only failure-kind launches: infra, fallback hops and delivered reminders stay put", async () => {
    const { repo, goal } = setupFlowRepo({ aliases, process });
    try {
      const scope1 = await countsOnlyFailureKindLaunchesInfraPart1(repo, goal);
      await countsOnlyFailureKindLaunchesInfraPart2(scope1);
      await countsOnlyFailureKindLaunchesInfraPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("counts exhausted fix rounds on red gates for the productive step", async () => {
    const { repo, goal } = setupFlowRepo({ aliases, process });
    try {
      await countsExhaustedFixRoundsOnRedGatesPart1(repo, goal);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("alternates switch the alias on retry", () => {
  it("runs the amended retry on the next alternate after a no-outcome failure", async () => {
    const { repo, goal } = setupFlowRepo({ aliases, process });
    try {
      const scope1 = await runsAmendedRetryNextAlternateAfterPart1(repo, goal);
      await runsAmendedRetryNextAlternateAfterPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stays on the step alias when the reminder delivered", async () => {
    const { repo, goal } = setupFlowRepo({ aliases, process });
    try {
      const scope1 = await staysStepAliasWhenReminderPart1(repo, goal);
      const scope2 = await staysStepAliasWhenReminderPart2(scope1);
      await staysStepAliasWhenReminderPart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

async function countsOnlyFailureKindLaunchesInfraPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const runtime = await makeRuntime(repo, goal, {
    fake: new FakeHarness({ id: "fake" }),
  });
  const flow = flowOf(runtime);
  const position = (records: StepRecord[]) =>
    alternatePosition(records, "task", "implement", flow);

  expect(
    position([
      stepRec(1, {
        stop: { kind: "infra", cause: "timeout" },
        outcome: undefined,
      }),
    ]),
  ).toBe(0);
  expect(
    position([
      stepRec(1, {
        stop: { kind: "cancelled" },
        outcome: undefined,
        repairFindings: ["no outcome"],
      }),
    ]),
  ).toBe(0);

  return { flow, position };
}

async function countsOnlyFailureKindLaunchesInfraPart2(
  scope: Awaited<ReturnType<typeof countsOnlyFailureKindLaunchesInfraPart1>>,
) {
  const { position } = scope;
  expect(
    position([
      stepRec(1, {
        attempts: [
          {
            model: { id: "fake-a" },
            harness: "fake",
            stop: { kind: "infra", cause: "quota" },
            usage: emptyUsage(),
          },
          {
            model: { id: "fake-b" },
            harness: "fake",
            stop: { kind: "done" },
            usage: emptyUsage(),
          },
        ],
        outcome: failedOutcome(),
      }),
    ]),
  ).toBe(0);
  // The reminder delivered: the repair finding stays, the launch did not fail.
  expect(
    position([
      stepRec(1, {
        outcome: outcome({ summary: "repaired" }),
        repairFindings: ["no outcome written"],
      }),
    ]),
  ).toBe(0);
  // No outcome after the reminders is the failure the alternate answers.
  expect(
    position([
      stepRec(1, {
        stop: { kind: "refusal", details: "declined" },
        repairFindings: ["no outcome written"],
      }),
    ]),
  ).toBe(1);
}

async function countsOnlyFailureKindLaunchesInfraPart3(
  scope: Awaited<ReturnType<typeof countsOnlyFailureKindLaunchesInfraPart1>>,
) {
  const { flow } = scope;
  expect(
    alternatePosition(
      [
        stepRec(1, {
          step: "review",
          outcome: outcome({
            summary: "rejected",
            verdict: "reject",
          }),
        }),
      ],
      "task",
      "review",
      flow,
    ),
  ).toBe(0);
}

async function runsAmendedRetryNextAlternateAfterPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const implement = whenTurn({ slug: "task", step: "implement" });
  // No edit: a branch with no diff gets no rescue, so the turn parks.
  harness.script((req) => fakeTurnResult(req, { text: "nothing" }), {
    when: implement,
  });
  harness.script((req) => fakeTurnResult(req, { text: "still nothing" }), {
    when: implement,
  });
  scriptStallLeave(harness, ["task"]);
  // The amended retry: the alternate writes different work and delivers.
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "second\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "implemented on the alternate" }));
      return fakeTurnResult(req);
    },
    { when: implement },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "task", step: "review" }) },
  );

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  await runDispatch(runtime, { iteration: 1 });

  const first = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(first.tasks.task!.status).toBe("parked");

  return { runtime, first };
}

async function runsAmendedRetryNextAlternateAfterPart2(
  scope: Awaited<ReturnType<typeof runsAmendedRetryNextAlternateAfterPart1>>,
) {
  const { first, runtime } = scope;
  expect(causeText(first.tasks.task!.cause)).toContain(
    "no outcome after repair",
  );
  expect(
    alternatePosition(
      await runtime.store.listRecords(),
      "task",
      "implement",
      flowOf(runtime),
    ),
  ).toBe(1);

  // An amend bumps the revision; the next attempt at the step derives its
  // alternate from the records of the plan the amend replaced.
  await writeTask(
    runtime,
    task("task", {
      revision: 1,
      scope: ["task.txt"],
      body: "Retry it.\nDone when: it works.",
    }),
  );
  await runDispatch(runtime, { iteration: 2 });

  const records = await runtime.store.listRecords();
  const implementRecords = records.filter(
    (r) => r.slug === "task" && r.step === "implement" && r.actor === "agent",
  );
  expect(implementRecords.map((r) => r.alias)).toEqual([
    "implementer",
    "implementer-alt",
  ]);
  expect(implementRecords[1]!.model?.id).toBe("fake-alt-impl");
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
}

async function staysStepAliasWhenReminderPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const implement = whenTurn({ slug: "task", step: "implement" });
  harness.script(
    (req) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "first\n", "utf8");
      return fakeTurnResult(req, { text: "nothing" });
    },
    { when: implement },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "repaired delivery" }));
      return fakeTurnResult(req);
    },
    { when: implement },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "rejected", verdict: "reject" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "task", step: "review" }) },
  );
  scriptStallLeave(harness, ["task"]);
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "task.txt"), "second\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "implemented after amend" }));
      return fakeTurnResult(req);
    },
    { when: implement },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "task", step: "review" }) },
  );

  const runtime = await makeRuntime(repo, goal, { fake: harness });

  return { runtime };
}

async function staysStepAliasWhenReminderPart2(
  scope: Awaited<ReturnType<typeof staysStepAliasWhenReminderPart1>>,
) {
  const { runtime } = scope;
  await writeTask(runtime, task("task", { scope: ["task.txt"] }));
  await runDispatch(runtime, { iteration: 1 });

  const parked = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(parked.tasks.task!.status).toBe("parked");
  expect(causeText(parked.tasks.task!.cause)).toContain("review-rejected");
  const firstImplement = (await runtime.store.listRecords()).find(
    (r) => r.slug === "task" && r.step === "implement" && r.actor === "agent",
  )!;
  expect(firstImplement.outcome?.status).toBe("done");
  expect(firstImplement.repairFindings?.length).toBeGreaterThan(0);
  expect(firstImplement.launchKind).toBeUndefined();
  expect(
    alternatePosition(
      await runtime.store.listRecords(),
      "task",
      "implement",
      flowOf(runtime),
    ),
  ).toBe(0);

  await writeTask(
    runtime,
    task("task", {
      revision: 1,
      scope: ["task.txt"],
      body: "Retry it.\nDone when: it works.",
    }),
  );
  await runDispatch(runtime, { iteration: 2 });

  const records = await runtime.store.listRecords();
  const implementRecords = records.filter(
    (r) => r.slug === "task" && r.step === "implement" && r.actor === "agent",
  );
  expect(implementRecords.map((r) => r.alias)).toEqual([
    "implementer",
    "implementer",
  ]);

  return { ...scope, records };
}

async function staysStepAliasWhenReminderPart3(
  scope: Awaited<ReturnType<typeof staysStepAliasWhenReminderPart2>>,
) {
  const { runtime, records } = scope;
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("merged");
}

async function derivesTheAliasFromRecordsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const runtime = await makeRuntime(repo, goal, {
    fake: new FakeHarness({ id: "fake" }),
  });
  const file = task("task");
  const state = derive([file], [], runtime.configs.process.flows).tasks.task!;
  const target = (records: StepRecord[]) =>
    stepTarget(runtime, file, state, "implement", 1, records);
  const flow = flowOf(runtime);

  expect(target([]).alias).toBe("implementer");
  expect(target([stepRec(1, { outcome: failedOutcome() })]).alias).toBe(
    "implementer-alt",
  );
  // Alternates are spent: further attempts stay on the last one.
  expect(
    alternatePosition(
      [
        stepRec(1, { outcome: failedOutcome() }),
        stepRec(2, { outcome: failedOutcome() }),
      ],
      "task",
      "implement",
      flow,
    ),
  ).toBe(2);
  expect(
    target([
      stepRec(1, { outcome: failedOutcome() }),
      stepRec(2, { outcome: failedOutcome() }),
    ]).alias,
  ).toBe("implementer-alt");
  // Review keeps its own alias: the implement step owns the switch.
  expect(
    stepTarget(runtime, file, state, "review", 1, [
      stepRec(1, { outcome: failedOutcome() }),
    ]).alias,
  ).toBe("reviewer");
}

async function countsExhaustedFixRoundsOnRedGatesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const runtime = await makeRuntime(repo, goal, {
    fake: new FakeHarness({ id: "fake" }),
  });
  const flow = flowOf(runtime);
  const gatePark = script(2, {
    slug: "task",
    step: "park",
    cause: cause("gates: readme (red)"),
  });
  expect(alternatePosition([gatePark], "task", "implement", flow)).toBe(1);
  // The park names no step; only the productive step takes the advance.
  expect(alternatePosition([gatePark], "task", "review", flow)).toBe(0);
  // An empty-diff park is not the gate-exhaustion failure kind.
  expect(
    alternatePosition(
      [
        script(2, {
          slug: "task",
          step: "park",
          cause: cause("empty-diff: implement r1"),
        }),
      ],
      "task",
      "implement",
      flow,
    ),
  ).toBe(0);
}
