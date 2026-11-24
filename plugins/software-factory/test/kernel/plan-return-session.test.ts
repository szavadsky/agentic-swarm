import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import {
  PLAN_RETURN_STEP,
  PLAN_REVIEW_STEP,
} from "../../src/kernel/plan-review.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";
import { FINDINGS, reviewed } from "./plan-review-fixtures.js";

const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

describe("plan return session continuity", () => {
  registerPlanReturnSessionPart1();
  registerPlanReturnSessionPart2();
});

/** Plans alpha, then scripts the review, return and PM turns of one boundary run. */
function scriptPlanReturnFlow(
  harness: FakeHarness,
  planPath: string,
  onReturn: (session: SessionRef | undefined) => void,
): void {
  harness.script((req, ctx) => {
    fs.appendFileSync(planPath, "\n## alpha\n", "utf8");
    ctx.writeOutcome(
      outcome({ summary: "planned alpha", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(reviewed("found a technical issue", FINDINGS));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_REVIEW_STEP }) },
  );
  harness.script(
    (req, ctx) => {
      onReturn(req.session);
      fs.appendFileSync(planPath, "\n## addressed\n", "utf8");
      ctx.writeOutcome(
        outcome({
          summary: "addressed every finding",
          planReviewMarks: [
            { finding: 1, mark: "helpful" },
            { finding: 2, mark: "helpful" },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_RETURN_STEP }) },
  );
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
    return fakeTurnResult(req);
  });
}

/** A boundary run whose review found one technical issue and one plan note. */
async function runReturnFlow(caps?: { resume: boolean }) {
  const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
  const harness = new FakeHarness({ id: "fake", ...(caps ? { caps } : {}) });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(planPath, "# Plan\n\n- alpha\n", "utf8");
  const returnSessions: (SessionRef | undefined)[] = [];
  scriptPlanReturnFlow(harness, planPath, (session) =>
    returnSessions.push(session),
  );
  return { repo, runtime, returnSessions };
}

function registerPlanReturnSessionPart1(): void {
  it("continues the architect's compacted session on the plan return", async () => {
    const { repo, runtime, returnSessions } = await runReturnFlow();
    try {
      await runBoundary(runtime, { relaunch: false });

      const architect = (await runtime.store.listRecords())
        .filter((record) => record.step === "architect")
        .at(-1);
      expect(architect?.session?.compacted).toBe(true);
      expect(returnSessions).toHaveLength(1);
      expect(returnSessions[0]?.id).toBe(architect?.session?.id);
      expect(returnSessions[0]?.compacted).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerPlanReturnSessionPart2(): void {
  it("logs the miss and starts the plan return de novo when the harness cannot resume", async () => {
    const { repo, runtime, returnSessions } = await runReturnFlow({
      resume: false,
    });
    try {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnings.push(msg);
      try {
        await runBoundary(runtime, { relaunch: false });
      } finally {
        console.warn = originalWarn;
      }

      expect(returnSessions).toEqual([undefined]);
      const miss = warnings.find((warning) =>
        warning.includes('the plan return for "plan.md"'),
      );
      expect(miss).toContain("starts de novo");
      expect(miss).toContain('harness "fake" cannot resume a session');
      // The miss costs the context, never the turn: the marks still land.
      const returned = (await runtime.store.listRecords()).find(
        (record) => record.step === PLAN_RETURN_STEP,
      );
      expect(returned?.outcome?.planReviewMarks).toHaveLength(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}
