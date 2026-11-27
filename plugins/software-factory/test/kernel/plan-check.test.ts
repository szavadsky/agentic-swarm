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
import { PLAN_CHECK_ROUTES_STEP } from "../../src/kernel/pm.js";
import { renderTaskFile } from "../../src/kernel/tasks.js";
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

async function consultsArchitectArchitectVerdictPart1(
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
  harness.script(writeFileTurn("beta.txt", "beta implemented"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta rejected", verdict: "reject" }));
    return fakeTurnResult(req);
  });
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "direction problem",
          planCheck: {
            verdict: "architect",
            evidence: [
              {
                item: "beta",
                status: "below-standard",
                evidence: "review rejected the design twice running",
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

  scriptStallLeave(harness, ["beta"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

  return { harness, runtime };
}

async function consultsArchitectArchitectVerdictPart2(
  scope: Awaited<ReturnType<typeof consultsArchitectArchitectVerdictPart1>>,
) {
  const { runtime, harness } = scope;
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
    "utf8",
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  const boundary = await runBoundary(runtime, {
    relaunch: false,
    iteration: 2,
  });
  expect(boundary.decision).toBe("done");
  const pack = await runtime.store.readFile(contextPackRelPath(2));
  expect(pack).toContain("## Plan check");
  expect(pack).toContain("iteration 1, verdict architect");
  expect(pack).toContain("- beta (below-standard): review rejected");
}

async function stopsCheckingOnceRoundsArePart1(
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

  scriptStallLeave(harness, ["beta"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });

  return { harness, runtime };
}

async function stopsCheckingOnceRoundsArePart2(
  scope: Awaited<ReturnType<typeof stopsCheckingOnceRoundsArePart1>>,
) {
  const { harness, runtime } = scope;
  harness.script((req, ctx) => {
    const cont = task("beta-2", {
      base: "beta",
      scope: ["beta.txt"],
      source: "plan-check: 1",
    });
    fs.writeFileSync(
      path.join(runtime.store.tasksDir, "beta-2.md"),
      renderTaskFile(cont),
      "utf8",
    );
    ctx.writeOutcome(
      outcome({
        summary: "continued beta",
        planCheckRoutes: [
          { slug: "beta", action: "continue", reason: "mechanical park" },
        ],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(writeFileTurn("beta.txt", "beta-2 implemented"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "beta-2 approved", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });

  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n",
    "utf8",
  );

  // No second checker script: an exhausted checker must not turn again.
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  const checks = (await runtime.store.listRecords()).filter(
    (r) => r.iteration === 1 && r.step === "plancheck" && r.endedAt,
  );
  expect(checks).toHaveLength(1);
}

async function resumesDispatchProgressReRunsPart1() {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(writeFileTurn("alpha.txt", "alpha implemented"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha approved", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  // Beta's runner crashes mid-turn: a mechanical park with turns left.
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "runner crashed mid-turn" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  // Gamma's review rejects: a live park that stays open after beta-2 lands so
  // wave end still has open work to re-check.
  harness.script(writeFileTurn("gamma.txt", "gamma implemented"), {
    when: whenTurn({ slug: "gamma", step: "implement" }),
  });
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "gamma rejected", verdict: "reject" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "gamma", step: "review" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "beta can continue",
          planCheck: {
            verdict: "progress",
            evidence: [
              {
                item: "beta",
                status: "missing",
                evidence: "beta implement turn failed; runner crashed",
              },
            ],
            followUps: [
              {
                kind: "replace",
                slug: "beta",
                reason: "mechanical park, runner crashed",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );

  return { harness };
}

async function resumesDispatchProgressReRunsPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  scope: Awaited<ReturnType<typeof resumesDispatchProgressReRunsPart1>>,
) {
  const { harness } = scope;
  scriptStallLeave(harness, ["beta", "gamma"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  harness.script((req, ctx) => {
    const cont = task("beta-2", {
      base: "beta",
      scope: ["beta.txt"],
      source: "plan-check: 1",
    });
    fs.writeFileSync(
      path.join(runtime.store.tasksDir, "beta-2.md"),
      renderTaskFile(cont),
      "utf8",
    );
    ctx.writeOutcome(
      outcome({
        summary: "continued beta",
        planCheckRoutes: [
          { slug: "beta", action: "continue", reason: "mechanical park" },
        ],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(writeFileTurn("beta.txt", "beta-2 implemented"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "beta-2 approved", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });

  return { ...scope, runtime };
}

async function resumesDispatchProgressReRunsPart3(
  scope: Awaited<ReturnType<typeof resumesDispatchProgressReRunsPart2>>,
) {
  const { harness, runtime } = scope;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "nothing left to continue",
          planCheck: {
            verdict: "architect",
            evidence: [
              {
                item: "beta",
                status: "done",
                evidence: "beta.txt on the head",
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

  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- alpha — Alpha.\n- beta — Beta.\n- gamma — Gamma.\n",
    "utf8",
  );

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("parked");
  expect(state.tasks["beta-2"]!.status).toBe("merged");
  const checks = records.filter(
    (r) => r.iteration === 1 && r.step === "plancheck" && r.endedAt,
  );

  return { ...scope, records, checks };
}

async function resumesDispatchProgressReRunsPart4(
  scope: Awaited<ReturnType<typeof resumesDispatchProgressReRunsPart3>>,
) {
  const { checks, records } = scope;
  expect(checks).toHaveLength(2);
  const routes = records.filter(
    (r) => r.iteration === 1 && r.step === PLAN_CHECK_ROUTES_STEP && r.endedAt,
  );
  expect(routes).toHaveLength(1);
  expect(routes[0]!.ok).toBe(true);
}

function registerPlanCheckerPart1(): void {
  it("resumes dispatch on progress and re-runs the checker after", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await resumesDispatchProgressReRunsPart1();
      const scope2 = await resumesDispatchProgressReRunsPart2(
        repo,
        goal,
        scope1,
      );
      const scope3 = await resumesDispatchProgressReRunsPart3(scope2);
      await resumesDispatchProgressReRunsPart4(scope3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("consults the architect on an architect verdict and packs the evidence", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await consultsArchitectArchitectVerdictPart1(repo, goal);
      await consultsArchitectArchitectVerdictPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("stops checking once its rounds are exhausted", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 1 },
    });
    try {
      const scope1 = await stopsCheckingOnceRoundsArePart1(repo, goal);
      await stopsCheckingOnceRoundsArePart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("plan checker", () => {
  registerPlanCheckerPart1();
});
