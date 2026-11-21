import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  latestPlanCheck,
  PLAN_CHECK_STEP,
  planCheckBrief,
  planSlugs,
  runPlanCheck,
  validatePlanCheck,
} from "../../src/kernel/plan-check.js";
import { runPlanCheckPm } from "../../src/kernel/pm.js";
import { rec, script, task, cause } from "./helpers.js";
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

function registerPlanCheckerPart11(): void {
  it("skips the checker when the goal has no plan", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
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
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      // No plan on disk and no checker script: the front path dispatches
      // through exhaustion without spending a checker turn.
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const checks = (await runtime.store.listRecords()).filter(
        (r) => r.step === "plancheck",
      );
      expect(checks).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerPlanCheckerPart12(): void {
  it("defaults planCheckRounds to 2 and honours the knob", async () => {
    const plain = setupFlowRepo({ aliases: ALIASES });
    try {
      const runtime = await makeRuntime(plain.repo, plain.goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      expect(runtime.limits.planCheckRounds).toBe(2);
    } finally {
      cleanupFlowRepo(plain.repo);
    }
    const tuned = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 5 },
    });
    try {
      const runtime = await makeRuntime(tuned.repo, tuned.goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      expect(runtime.limits.planCheckRounds).toBe(5);
    } finally {
      cleanupFlowRepo(tuned.repo);
    }
  });

  it("briefs the checker with parked causes", () => {
    const tasks = [task("a"), task("b")];
    const state = derive(tasks, [
      rec(1, {
        slug: "a",
        step: "park",
        ok: true,
        cause: cause("blocked: stuck"),
      }),
    ]);
    const brief = planCheckBrief(state, tasks);
    expect(brief).toContain("- a | parked |");
    expect(brief).toContain("- a: blocked: stuck");
  });

  it("briefs a dependent as ready when a merged continuation stands in for its parked dep", () => {
    const tasks = [
      task("a"),
      task("b", { base: "a" }),
      task("c", { deps: ["a"] }),
    ];
    const state = derive(tasks, [
      rec(1, {
        slug: "a",
        step: "park",
        ok: true,
        cause: cause("empty-diff: no changes"),
      }),
      script(2, { slug: "b", step: "merge", ok: true, commit: "deadbeef" }),
    ]);
    expect(planCheckBrief(state, tasks)).toContain("- c | ready |");
  });
}

function registerPlanCheckerPart13(): void {
  it("packs the latest reported check", () => {
    const stale = rec(1, {
      slug: undefined,
      step: "plancheck",
      outcome: outcome({
        planCheck: {
          verdict: "progress",
          evidence: [{ item: "a", status: "missing", evidence: "old" }],
          followUps: [],
        },
      }),
    });
    const fresh = rec(2, {
      slug: undefined,
      step: "plancheck",
      outcome: outcome({
        planCheck: {
          verdict: "architect",
          evidence: [{ item: "a", status: "done", evidence: "new" }],
          followUps: [],
        },
      }),
    });
    const silent = rec(3, { slug: undefined, step: "plancheck" });
    expect(latestPlanCheck([stale, silent, fresh])?.verdict).toBe("architect");
    expect(latestPlanCheck([stale, silent, fresh])?.evidence).toEqual([
      { item: "a", status: "done", evidence: "new" },
    ]);
    expect(latestPlanCheck([silent])).toBeUndefined();
    expect(latestPlanCheck([])).toBeUndefined();
  });
}

function registerPlanCheckerPart14(): void {
  it("bounds follow-up slugs by plan bullets and exempts a dead dep", () => {
    const plan = [
      "# Plan",
      "",
      "- app — App works.",
      "- beta — Beta works.",
      "",
      "Retired: gamma was merged.",
    ].join("\n");
    expect([...planSlugs(plan)].sort()).toEqual(["app", "beta"]);
    const check = outcome({
      planCheck: {
        verdict: "progress",
        evidence: [],
        followUps: [
          {
            kind: "missing-dep",
            slug: "app",
            dep: "ghost",
            reason: "ghost is gone",
          },
          { kind: "amend", slug: "gamma", reason: "retry the old slug" },
        ],
      },
    });
    expect(validatePlanCheck([plan], check)).toEqual([
      'follow-up slug "gamma" has no "- gamma —" bullet in the plan; merged and retired slugs are history',
    ]);
  });
}

function registerPlanCheckerPart15(): void {
  it("accepts a follow-up named by any active plan and rejects one named by none", () => {
    const goal =
      "# Goal\n\n## Architect register\n\n- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i1 | active\n";
    const auth = "# Epic auth\n\n- auth.login — Add login.\n";
    const check = outcome({
      planCheck: {
        verdict: "progress",
        evidence: [],
        followUps: [
          { kind: "amend", slug: "auth.login", reason: "retry the turn" },
          { kind: "replace", slug: "retired", reason: "not in any plan" },
        ],
      },
    });
    expect(validatePlanCheck([goal, auth], check)).toEqual([
      'follow-up slug "retired" has no "- retired —" bullet in the plan; merged and retired slugs are history',
    ]);
  });
}

/** The checker's first answer: one valid cancel and one slug missing from the plan. */
function scriptOutsideFollowUpCheck(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "beta can continue",
          planCheck: {
            verdict: "progress",
            evidence: [],
            followUps: [
              { kind: "cancel", slug: "beta", reason: "no longer worth it" },
              { kind: "amend", slug: "retired", reason: "old slug" },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
}

/** The repair answer after the outside follow-up is dropped from the brief. */
function scriptOutsideFollowUpRepair(
  harness: FakeHarness,
  onPrompt: (prompt: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      onPrompt(req.prompt);
      ctx.writeOutcome(
        outcome({
          summary: "beta can continue",
          planCheck: {
            verdict: "progress",
            evidence: [],
            followUps: [
              { kind: "cancel", slug: "beta", reason: "no longer worth it" },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
}

/** The PM turn that leaves the surviving follow-up to the architect. */
function scriptLeaveFollowUpPm(
  harness: FakeHarness,
  onPrompt: (prompt: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      onPrompt(req.prompt);
      ctx.writeOutcome(
        outcome({
          summary: "left beta",
          planCheckRoutes: [
            { slug: "beta", action: "leave", reason: "needs the architect" },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

function registerPlanCheckerPart16(): void {
  it("repairs a follow-up outside the plan and briefs the PM with the rest", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Plan\n\n- beta — Beta.\n",
        "utf8",
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );

      scriptOutsideFollowUpCheck(harness);
      let repairPrompt = "";
      scriptOutsideFollowUpRepair(harness, (prompt) => {
        repairPrompt = prompt;
      });

      const checked = await runPlanCheck(runtime, {
        iteration: 1,
        round: 1,
        state,
      });
      expect(checked.verdict).toBe("progress");
      expect(checked.followUps.map((item) => item.slug)).toEqual(["beta"]);
      expect(repairPrompt).toContain(
        'follow-up slug "retired" has no "- retired —" bullet in the plan',
      );
      expect(repairPrompt).not.toContain('follow-up slug "beta"');

      let pmPrompt = "";
      scriptLeaveFollowUpPm(harness, (prompt) => {
        pmPrompt = prompt;
      });
      const followed = await runPlanCheckPm(runtime, {
        iteration: 1,
        state,
        followUps: checked.followUps,
        cwd: runtime.paths.goalCheckout,
      });
      expect(followed.left).toEqual(["beta"]);
      expect(pmPrompt).toContain("- beta (cancel)");
      expect(pmPrompt).not.toContain("retired");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("plan checker", () => {
  registerPlanCheckerPart11();

  registerPlanCheckerPart12();

  registerPlanCheckerPart13();

  registerPlanCheckerPart14();

  registerPlanCheckerPart15();

  registerPlanCheckerPart16();
});
