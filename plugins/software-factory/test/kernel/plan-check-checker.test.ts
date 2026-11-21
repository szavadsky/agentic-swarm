import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { appendCancel } from "../../src/kernel/record.js";
import { renderTaskFile } from "../../src/kernel/tasks.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

function writeFileTurn(file: string, summary: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary }));
    return fakeTurnResult(req);
  };
}

async function discardsWhateverCheckerWritesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha approved", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ status: "failed", summary: "runner crashed mid-turn" }),
    );
    return fakeTurnResult(req);
  });

  scriptStallLeave(harness, ["beta"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(
    planPath,
    "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
    "utf8",
  );
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  const betaBefore = fs.readFileSync(
    path.join(runtime.store.tasksDir, "beta.md"),
    "utf8",
  );

  return { harness, runtime, planPath, betaBefore };
}

async function discardsWhateverCheckerWritesPart2(
  scope: Awaited<ReturnType<typeof discardsWhateverCheckerWritesPart1>>,
) {
  const { harness, planPath, runtime, betaBefore } = scope;
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(planPath, "# Plan\n\nHACKED\n", "utf8");
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "beta.md"),
        "HACKED\n",
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "direction problem",
          planCheck: { verdict: "architect", evidence: [], followUps: [] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  expect(fs.readFileSync(planPath, "utf8")).toContain("- beta");
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
  ).toBe(betaBefore);
  const reconciled = (await runtime.store.listRecords()).filter(
    (r) => r.iteration === 1 && r.step === "plan-check-reconcile",
  );
  expect(reconciled).toHaveLength(1);
  expect(causeText(reconciled[0]!.cause)).toContain("plan.md");
  expect(causeText(reconciled[0]!.cause)).toContain("beta");
}

async function unblocksTaskWaitingDeadDepThroughPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "app waits on a dropped dep",
          planCheck: {
            verdict: "progress",
            evidence: [
              {
                item: "app",
                status: "missing",
                evidence: "app never dispatched; ghost is cancelled",
              },
            ],
            followUps: [
              {
                kind: "missing-dep",
                slug: "app",
                dep: "ghost",
                reason: "ghost is cancelled, app waits forever",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("ghost", { scope: ["ghost.txt"] }));
  await writeTask(
    runtime,
    task("app", { scope: ["app.txt"], deps: ["ghost"] }),
  );
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- app — App works.\n",
    "utf8",
  );

  return { harness, runtime };
}

async function unblocksTaskWaitingDeadDepThroughPart2(
  scope: Awaited<ReturnType<typeof unblocksTaskWaitingDeadDepThroughPart1>>,
) {
  const { runtime, harness } = scope;
  await appendCancel(
    runtime.store,
    { iteration: 1, slug: "ghost", round: 1 },
    cause("dropped from the plan"),
  );
  harness.script((req, ctx) => {
    const fixed = task("app", { scope: ["app.txt"], deps: [] });
    fs.writeFileSync(
      path.join(runtime.store.tasksDir, "app.md"),
      renderTaskFile(fixed),
      "utf8",
    );
    ctx.writeOutcome(
      outcome({
        summary: "dropped the dead dep",
        planCheckRoutes: [
          { slug: "app", action: "continue", reason: "dead dep dropped" },
        ],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(writeFileTurn("app.txt", "app implemented"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "app approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

async function unblocksTaskWaitingDeadDepThroughPart3(
  scope: Awaited<ReturnType<typeof unblocksTaskWaitingDeadDepThroughPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "nothing left to continue",
          planCheck: {
            verdict: "architect",
            evidence: [],
            followUps: [],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(state.tasks.app!.status).toBe("merged");
}

async function reChecksRelaunchInsteadTrustingPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- alpha — Alpha.\n",
    "utf8",
  );
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
      ok: true,
      outcome: outcome({ summary: "first plan", decision: "continue" }),
    },
  );

  return { harness, runtime };
}

async function reChecksRelaunchInsteadTrustingPart2(
  scope: Awaited<ReturnType<typeof reChecksRelaunchInsteadTrustingPart1>>,
) {
  const { runtime } = scope;
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "plancheck",
      round: 1,
      actor: "agent",
      alias: "plan-checker",
      model: { id: "fake-check" },
    },
    {
      ok: true,
      outcome: outcome({
        summary: "stale progress",
        planCheck: {
          verdict: "progress",
          evidence: [
            {
              item: "alpha",
              status: "missing",
              evidence: "stale claim from the dead launch",
            },
          ],
          followUps: [],
        },
      }),
    },
  );
}

async function reChecksRelaunchInsteadTrustingPart3(
  scope: Awaited<ReturnType<typeof reChecksRelaunchInsteadTrustingPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "fresh check",
          planCheck: {
            verdict: "architect",
            evidence: [
              {
                item: "alpha",
                status: "missing",
                evidence: "fresh check after the relaunch",
              },
            ],
            followUps: [],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "debt reviewed", decision: "done" }));
    return fakeTurnResult(req);
  });
  const boundary = await runBoundary(runtime, {
    relaunch: true,
    iteration: 2,
  });
  expect(boundary.decision).toBe("done");
  const records = await runtime.store.listRecords();
  expect(records.some((r) => r.step === "architect" && r.iteration === 2)).toBe(
    true,
  );
  // The dead launch's progress claim is not the evidence the consult
  // acts on: the gate checked again, and the fresh architect verdict
  // opened the consult.
  expect(
    records.filter(
      (r) => r.step === PLAN_CHECK_STEP && r.iteration === 2 && r.endedAt,
    ),
  ).toHaveLength(1);
}

async function reChecksRelaunchInsteadTrustingPart4(
  scope: Awaited<ReturnType<typeof reChecksRelaunchInsteadTrustingPart1>>,
) {
  const { runtime } = scope;
  const pack = await runtime.store.readFile(contextPackRelPath(2));
  expect(pack).toContain("iteration 2, verdict architect");
  expect(pack).toContain("fresh check after the relaunch");
  expect(pack).not.toContain("stale claim from the dead launch");
}

function registerPlanCheckerPart2(): void {
  it("re-checks a relaunch instead of trusting stale progress evidence, then consults", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await reChecksRelaunchInsteadTrustingPart1(repo, goal);
      await reChecksRelaunchInsteadTrustingPart2(scope1);
      await reChecksRelaunchInsteadTrustingPart3(scope1);
      await reChecksRelaunchInsteadTrustingPart4(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("discards whatever the checker writes outside its outcome", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await discardsWhateverCheckerWritesPart1(repo, goal);
      await discardsWhateverCheckerWritesPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("unblocks a task waiting on a dead dep through the PM", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await unblocksTaskWaitingDeadDepThroughPart1(repo, goal);
      await unblocksTaskWaitingDeadDepThroughPart2(scope1);
      await unblocksTaskWaitingDeadDepThroughPart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("plan checker", () => {
  registerPlanCheckerPart2();
});
