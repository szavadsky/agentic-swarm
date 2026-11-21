import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { PLAN_CHECK_STEP, runPlanCheck } from "../../src/kernel/plan-check.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { renderTaskFile } from "../../src/kernel/tasks.js";
import { task, cause } from "./helpers.js";
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

async function checksBeforeArchitectAtBoundaryPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "beta", round: 1, revision: 0 }),
    { ok: true, cause: cause("failed: runner crashed mid-turn") },
  );
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- beta — Beta.\n",
    "utf8",
  );

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

  return { harness, runtime };
}

async function checksBeforeArchitectAtBoundaryPart2(
  scope: Awaited<ReturnType<typeof checksBeforeArchitectAtBoundaryPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "beta-2.md"),
        renderTaskFile(
          task("beta-2", {
            scope: ["beta.txt"],
            source: "plan-check: 1",
          }),
        ),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "continued beta",
          planCheckRoutes: [
            {
              slug: "beta",
              action: "continue",
              reason: "mechanical park",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  scriptStallLeave(harness, ["beta"]);
  // Boundary 1: the checker runs first; its progress resumes dispatch
  // through the PM without an architect turn.
  const first = await runBoundary(runtime, {
    relaunch: false,
    iteration: 1,
  });
  expect(first.decision).toBe("continue");
  expect(
    harness.calls.some((call) => fakeTurnIdentity(call).step === "architect"),
  ).toBe(false);
  expect(fs.existsSync(path.join(runtime.store.tasksDir, "beta-2.md"))).toBe(
    true,
  );
}

async function checksBeforeArchitectAtBoundaryPart3(
  scope: Awaited<ReturnType<typeof checksBeforeArchitectAtBoundaryPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "beta-2 implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta-2", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "beta-2 approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta-2", step: "review" }) },
  );
  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect(
    derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    ).tasks["beta-2"]!.status,
  ).toBe("merged");

  // Boundary 2: the single allowed round is spent, so the architect runs.
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "nothing to file" }));
    return fakeTurnResult(req);
  });
  const second = await runBoundary(runtime, {
    relaunch: false,
    iteration: 2,
  });
  expect(second.decision).toBe("done");
}

async function checksBeforeArchitectAtBoundaryPart4(
  scope: Awaited<ReturnType<typeof checksBeforeArchitectAtBoundaryPart1>>,
) {
  const { harness } = scope;
  expect(
    harness.calls.filter((call) => fakeTurnIdentity(call).step === "architect"),
  ).toHaveLength(1);
  // One checker turn: the gate's. The bound stopped dispatch re-checking.
  expect(
    harness.calls.filter(
      (call) => fakeTurnIdentity(call).step === PLAN_CHECK_STEP,
    ),
  ).toHaveLength(1);
}

async function handsCheckerLastGateRecordNoGatePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  const checks = (summary: string) => [
    {
      name: "readme",
      ok: true,
      summary,
      output: "",
      fingerprint: "abc123",
    },
  ];
  await runtime.store.appendRecord(
    scriptMeta(1, "checks", { slug: "alpha", round: 1 }),
    { ok: true, checks: checks("pass") },
  );
  const last = await runtime.store.appendRecord(
    scriptMeta(1, "merge-checks", { slug: "alpha", round: 1 }),
    { ok: true, checks: checks("pass on the merged tree") },
  );
  const probe = { prompt: "" };
  harness.script(
    (req, ctx) => {
      probe.prompt = req.prompt;
      ctx.writeOutcome(
        outcome({
          summary: "nothing to add",
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

  return { runtime, state, last, probe };
}

async function handsCheckerLastGateRecordNoGatePart2(
  scope: Awaited<ReturnType<typeof handsCheckerLastGateRecordNoGatePart1>>,
) {
  const { runtime, state, probe, last } = scope;
  await runPlanCheck(runtime, { iteration: 1, round: 1, state });

  const record = path.join(
    runtime.store.recordsDir,
    `00002-i1-alpha-merge-checks-r1`,
    "end.yaml",
  );
  expect(probe.prompt).toContain(record);
  expect(last.seq).toBe(2);
  // The checker reads the record; the configured gate commands stay out.
  expect(probe.prompt).not.toContain("test -f README.md");
  expect(probe.prompt).not.toContain("Run the gate commands");
  expect(probe.prompt).toContain("never run a gate, test or lint command");
}

function registerPlanCheckerPart17(): void {
  it("checks before the architect at a boundary, resumes dispatch on progress, and consults at the bound", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 1 },
    });
    try {
      const scope1 = await checksBeforeArchitectAtBoundaryPart1(repo, goal);
      await checksBeforeArchitectAtBoundaryPart2(scope1);
      await checksBeforeArchitectAtBoundaryPart3(scope1);
      await checksBeforeArchitectAtBoundaryPart4(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("hands the checker the last gate record and no gate command", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const scope1 = await handsCheckerLastGateRecordNoGatePart1(repo, goal);
      await handsCheckerLastGateRecordNoGatePart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("plan checker", () => {
  registerPlanCheckerPart17();
});
