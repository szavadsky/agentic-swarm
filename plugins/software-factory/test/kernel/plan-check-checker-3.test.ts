import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { runGoal } from "../../src/kernel/launch.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { testPriceSource } from "../helpers/price-source.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
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

/** `ALIASES` plus the roles launch pre-flight demands but this goal never runs. */
const LAUNCH_ALIASES = {
  ...ALIASES,
  digest: { harness: "fake", model: "fake-digest" },
  "implementer-b": { harness: "fake", model: "fake-impl-b" },
  researcher: { harness: "fake", model: "fake-research" },
};

/** The graph finding a task file raises when it names a dep nothing declares. */
const missingDepFinding = (slug: string, dep: string): string =>
  `task "${slug}" depends on missing task "${dep}"`;

/** A checker report that routes beta to the PM over its dead dep. */
const scriptPlanCheckProgress = (harness: FakeHarness): void => {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "beta's dep is dead",
          planCheck: {
            verdict: "progress",
            evidence: [
              {
                item: "beta",
                status: "missing",
                evidence: "beta depends on gone, which no task declares",
              },
            ],
            followUps: [
              {
                kind: "cancel",
                slug: "beta",
                reason: "the dead dep is not derivable from the plan",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
};

/** The PM's clean turn: leave beta, write nothing, keep the ladder's exit. */
const scriptPlanCheckLeave = (harness: FakeHarness): void => {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "left beta for the architect",
          planCheckRoutes: [
            {
              slug: "beta",
              action: "leave",
              reason: "the dead dep is not the plan's to derive",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
};

function registerPlanCheckerPart8(): void {
  it("surfaces the architect exit from a dispatch-lane plan check", async () => {
    const { repo, goal, goalDir } = setupFlowRepo({
      aliases: ALIASES,
      limits: { planCheckRounds: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
      );
      fs.writeFileSync(
        path.join(goalDir, "plan.md"),
        "# Plan\n\n- beta — Beta.\n",
        "utf8",
      );
      scriptPlanCheckProgress(harness);
      scriptPlanCheckLeave(harness);

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(result.cause?.kind).toBe("boundary");
      expect(result.cause?.detail).toBe(
        `PM ladder routed to the architect: ${missingDepFinding("beta", "gone")}`,
      );
      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "pm"),
      ).toHaveLength(1);
      const records = await runtime.store.listRecords();
      expect(records.some((record) => record.step === "pm-validate")).toBe(
        false,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** Scripts the architect turn and asserts the finding reached summary and pack. */
function scriptBoundaryLaneFinding(
  harness: FakeHarness,
  goalDir: string,
): void {
  harness.script(
    (req, ctx) => {
      const summary = fs.readFileSync(
        path.join(goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain(
        `PM ladder routed to the architect: ${missingDepFinding("beta", "gone")}`,
      );
      const pack = fs.readFileSync(
        path.join(goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain("previous iteration summary");
      ctx.writeOutcome(
        outcome({ summary: "read the finding", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
}

function registerPlanCheckerPart9(): void {
  it("carries the boundary lane's architect finding into the next consult", async () => {
    const { repo, goal, goalDir } = setupFlowRepo({
      aliases: LAUNCH_ALIASES,
      limits: { iterations: 2, planCheckRounds: 1 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], deps: ["gone"] }),
      );
      fs.writeFileSync(
        path.join(goalDir, "plan.md"),
        "# Plan\n\n- beta — Beta.\n",
        "utf8",
      );
      scriptPlanCheckProgress(harness);
      scriptPlanCheckLeave(harness);
      scriptBoundaryLaneFinding(harness, goalDir);

      const result = await runGoal({
        repo: repo.dir,
        goal,
        iterations: 2,
        harnesses: { fake: harness },
        priceSource: testPriceSource(repo.dir),
      });
      expect(result.stop).toBe("done");
      expect(
        harness.calls.filter(
          (call) => fakeTurnIdentity(call).step === "architect",
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

describe("plan checker", () => {
  registerPlanCheckerPart8();

  registerPlanCheckerPart9();
});
