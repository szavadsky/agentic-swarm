import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { PLAN_CHECK_ROUTES_STEP, runPlanCheckPm } from "../../src/kernel/pm.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
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

/** The graph finding a task file raises when it names a dep nothing declares. */
const missingDepFinding = (slug: string, dep: string): string =>
  `task "${slug}" depends on missing task "${dep}"`;

async function fallsBackBoundaryWhenPMRoutesPart1() {
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
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "beta can continue",
          planCheck: {
            verdict: "progress",
            evidence: [],
            followUps: [
              {
                kind: "replace",
                slug: "beta",
                reason: "mechanical park",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
  // Both ladder rungs answer without routes; the writes roll back.
  scriptStallLeave(harness, ["beta"]);
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no routes" }));
    return fakeTurnResult(req);
  });

  return { harness };
}

async function fallsBackBoundaryWhenPMRoutesPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  scope: Awaited<ReturnType<typeof fallsBackBoundaryWhenPMRoutesPart1>>,
) {
  const { harness } = scope;
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "still no routes" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
    "utf8",
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  expect(fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md"))).toBe(
    false,
  );
  const routes = (await runtime.store.listRecords()).filter(
    (r) => r.iteration === 1 && r.step === PLAN_CHECK_ROUTES_STEP && r.endedAt,
  );
  expect(routes).toHaveLength(1);
  expect(routes[0]!.ok).toBe(false);
}

async function keepsCleanPlanCheckTurnRoutesPrePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
    { ok: true, cause: cause("failed: runner crashed mid-turn") },
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("parked");
  const betaPath = path.join(runtime.store.tasksDir, "beta.md");

  return { harness, runtime, state, betaPath };
}

async function keepsCleanPlanCheckTurnRoutesPrePart2(
  scope: Awaited<ReturnType<typeof keepsCleanPlanCheckTurnRoutesPrePart1>>,
) {
  const { harness, betaPath } = scope;
  harness.script(
    (req, ctx) => {
      const current = parseTaskFile(fs.readFileSync(betaPath, "utf8"), "beta");
      fs.writeFileSync(
        betaPath,
        renderTaskFile({
          ...current,
          revision: 1,
          body: "Amended brief.\nDone when: beta.txt holds beta.",
        }),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "amended beta; the dead dep is not the plan's to derive",
          planCheckRoutes: [
            {
              slug: "beta",
              action: "continue",
              reason: "the brief was too vague to retry",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

async function keepsCleanPlanCheckTurnRoutesPrePart3(
  missingDepFinding: (slug: string, dep: string) => string,
  scope: Awaited<ReturnType<typeof keepsCleanPlanCheckTurnRoutesPrePart1>>,
) {
  const { runtime, state, harness, betaPath } = scope;
  const result = await runPlanCheckPm(runtime, {
    iteration: 1,
    state,
    followUps: [
      {
        kind: "amend",
        slug: "beta",
        reason: "the brief was too vague to retry",
      },
    ],
    cwd: runtime.paths.goalCheckout,
  });
  expect(result.status).toBe("architect");
  if (result.status === "architect")
    expect(result.findings).toEqual([missingDepFinding("beta", "gone")]);
  expect(result.continued).toEqual(["beta"]);
  expect(
    harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
  ).toHaveLength(1);
  // The amend stands: only a finding no rung can fix stopped the ladder.
  expect(
    parseTaskFile(fs.readFileSync(betaPath, "utf8"), "beta").revision,
  ).toBe(1);
  const records = await runtime.store.listRecords();
  expect(records.some((record) => record.step === "pm-validate")).toBe(false);
  expect(
    records.some(
      (record) => record.step === PLAN_CHECK_ROUTES_STEP && record.ok === true,
    ),
  ).toBe(true);
}

async function stillEscalatesFindingPlanCheckTurnPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
    { ok: true, cause: cause("failed: runner crashed mid-turn") },
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );

  return { harness, runtime, state };
}

async function stillEscalatesFindingPlanCheckTurnPart2(
  scope: Awaited<ReturnType<typeof stillEscalatesFindingPlanCheckTurnPart1>>,
) {
  const { harness, runtime } = scope;
  for (const summary of ["wrote a self dep", "wrote it again"]) {
    harness.script(
      (req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "beta-2.md"),
          renderTaskFile(
            task("beta-2", {
              base: "beta",
              scope: ["beta.txt"],
              deps: ["beta-2"],
              source: "plan-check: 1",
            }),
          ),
          "utf8",
        );
        ctx.writeOutcome(
          outcome({
            summary,
            planCheckRoutes: [
              {
                slug: "beta",
                action: "continue",
                reason: "retry on a fresh branch",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "pm" }) },
    );
  }
}

async function stillEscalatesFindingPlanCheckTurnPart3(
  missingDepFinding: (slug: string, dep: string) => string,
  scope: Awaited<ReturnType<typeof stillEscalatesFindingPlanCheckTurnPart1>>,
) {
  const { harness, runtime, state } = scope;
  harness.script(
    (req, ctx) => {
      expect(req.model.id).toBe("fake-pm-2");
      ctx.writeOutcome(
        outcome({
          summary: "left beta",
          planCheckRoutes: [
            {
              slug: "beta",
              action: "leave",
              reason: "needs the architect",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  const result = await runPlanCheckPm(runtime, {
    iteration: 1,
    state,
    followUps: [
      {
        kind: "cancel",
        slug: "beta",
        reason: "the architect must rule on the dead dep",
      },
    ],
    cwd: runtime.paths.goalCheckout,
  });
  expect(harness.calls.map((call) => call.model.id)).toEqual([
    "fake-pm",
    "fake-pm",
    "fake-pm-2",
  ]);
  expect(result.status).toBe("architect");
  if (result.status === "architect")
    expect(result.findings).toEqual([missingDepFinding("beta", "gone")]);
  expect(result.continued).toEqual([]);
  expect(result.left).toEqual(["beta"]);
}

async function stillEscalatesFindingPlanCheckTurnPart4(
  missingDepFinding: (slug: string, dep: string) => string,
  scope: Awaited<ReturnType<typeof stillEscalatesFindingPlanCheckTurnPart1>>,
) {
  const { runtime } = scope;
  const validations = (await runtime.store.listRecords()).filter(
    (record) => record.step === "pm-validate",
  );
  expect(validations).toHaveLength(2);
  for (const record of validations) {
    expect(causeText(record.cause)).toContain(
      'task "beta-2" depends on itself',
    );
    expect(causeText(record.cause)).not.toContain(
      missingDepFinding("beta", "gone"),
    );
  }
  expect(fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md"))).toBe(
    false,
  );
}

function registerPlanCheckerPart10(): void {
  it("keeps a clean plan-check turn and routes a pre-existing finding to the architect", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await keepsCleanPlanCheckTurnRoutesPrePart1(repo, goal);
      await keepsCleanPlanCheckTurnRoutesPrePart2(scope1);
      await keepsCleanPlanCheckTurnRoutesPrePart3(missingDepFinding, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("still escalates on a finding a plan-check turn introduced", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        ...ALIASES,
        pm: { ...ALIASES.pm, escalateTo: "pm-2" },
        "pm-2": { harness: "fake", model: "fake-pm-2" },
      },
    });
    try {
      const scope1 = await stillEscalatesFindingPlanCheckTurnPart1(repo, goal);
      await stillEscalatesFindingPlanCheckTurnPart2(scope1);
      await stillEscalatesFindingPlanCheckTurnPart3(missingDepFinding, scope1);
      await stillEscalatesFindingPlanCheckTurnPart4(missingDepFinding, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("falls back to the boundary when the PM routes nothing", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await fallsBackBoundaryWhenPMRoutesPart1();
      await fallsBackBoundaryWhenPMRoutesPart2(repo, goal, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("plan checker", () => {
  registerPlanCheckerPart10();
});
