import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { makeCause } from "../../src/kernel/cause.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import {
  PLAN_RETURN_STEP,
  PLAN_REVIEW_STEP,
} from "../../src/kernel/plan-review.js";
import { scriptMeta } from "../../src/kernel/record.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { simpleTask } from "./e2e-helpers.js";
import { ALIASES } from "./plan-review-fixtures.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

const RULE =
  "task file is immutable outside amend; cancel and re-slug, or continue via `base`";

/** The review fixtures plus the boundary roles a second iteration runs. */
const ALIASES_WITH_PACK = {
  ...ALIASES,
  digest: { harness: "fake", model: "fake-digest" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

interface Fixture {
  repo: ReturnType<typeof setupFlowRepo>["repo"];
  runtime: KernelRuntime;
  harness: FakeHarness;
  planPath: string;
}

/** A goal whose first boundary derives `alpha` and stores the bullet baseline. */
async function derivedGoal(): Promise<Fixture> {
  const { repo, goal } = setupFlowRepo({ aliases: ALIASES_WITH_PACK });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        planPath,
        "# Plan\n\n- alpha — Create alpha.\n  - order: at once.\n",
      );
      ctx.writeOutcome(
        outcome({ summary: "planned alpha", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "alpha.md"),
        simpleTask("alpha", "alpha.txt"),
      );
      ctx.writeOutcome(outcome({ summary: "filed alpha" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  const first = await runBoundary(runtime, { relaunch: false });
  expect(first.decision).toBe("continue");
  expect(
    fs.existsSync(
      path.join(runtime.store.goalDir, "iterations/1/plan-bullets.json"),
    ),
  ).toBe(true);
  return { repo, runtime, harness, planPath };
}

/** Runs a second boundary whose architect rewrites the plan with `edit`. */
async function secondBoundary(
  fixture: Fixture,
  edit: (plan: string) => string,
  returnPrompt?: (prompt: string) => void,
): Promise<Fixture> {
  const { runtime, harness, planPath } = fixture;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "plan holds",
          planCheck: { verdict: "progress", evidence: [], followUps: [] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        planPath,
        edit(fs.readFileSync(planPath, "utf8")),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({ summary: "edited the plan", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      returnPrompt?.(req.prompt);
      ctx.writeOutcome(
        outcome({
          summary: "answered the finding",
          planReviewMarks: [{ finding: 1, mark: "helpful" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_RETURN_STEP }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "the plan stands" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  const result = await runBoundary(runtime, { relaunch: false });
  expect(result.decision).toBe("continue");
  return fixture;
}

function returns(fixture: Fixture): string[] {
  return fixture.harness.calls
    .filter((call) => fakeTurnIdentity(call).step === PLAN_RETURN_STEP)
    .map((call) => call.prompt);
}

describe("an open task's bullet edited in place", () => {
  it("carries the immutability rule on the plan-return finding list", async () => {
    const fixture = await derivedGoal();
    try {
      let prompt = "";
      await secondBoundary(
        fixture,
        (plan) => plan.replace("order: at once.", "order: after beta."),
        (text) => {
          prompt = text;
        },
      );
      expect(returns(fixture)).toHaveLength(1);
      expect(prompt).toContain(RULE);
      expect(prompt).toContain('"alpha"');
      expect(prompt).toContain("plan.md");
    } finally {
      cleanupFlowRepo(fixture.repo);
    }
  });

  it("reports a bullet removed from the plan while its task is open", async () => {
    const fixture = await derivedGoal();
    try {
      let prompt = "";
      await secondBoundary(
        fixture,
        (plan) => plan.replace("- alpha — Create alpha.\n", ""),
        (text) => {
          prompt = text;
        },
      );
      expect(returns(fixture)).toHaveLength(1);
      expect(prompt).toContain(RULE);
      expect(prompt).toContain("removed");
    } finally {
      cleanupFlowRepo(fixture.repo);
    }
  });
});

/** Runs the second boundary and asserts it raised no plan-return finding. */
async function expectNoReturn(
  edit: (plan: string) => string,
  before?: (runtime: KernelRuntime) => Promise<unknown>,
): Promise<void> {
  const fixture = await derivedGoal();
  try {
    await before?.(fixture.runtime);
    await secondBoundary(fixture, edit);
    // The review ran on the changed plan; the bullet check is what stayed quiet.
    expect(
      fixture.harness.calls.some(
        (call) => fakeTurnIdentity(call).step === PLAN_REVIEW_STEP,
      ),
    ).toBe(true);
    expect(returns(fixture)).toHaveLength(0);
  } finally {
    cleanupFlowRepo(fixture.repo);
  }
}

describe("bullets the plan return does not report", () => {
  it("reports nothing for an unchanged bullet", async () => {
    await expectNoReturn((plan) => `${plan}\n## note\nPlan stands.\n`);
  });

  it("reports nothing for a new bullet", async () => {
    await expectNoReturn((plan) => `${plan}\n- beta — Create beta.\n`);
  });
});

describe("bullets that are history or a sanctioned leave", () => {
  it("reports nothing for a merged bullet that collapses to its history line", async () => {
    await expectNoReturn(
      (plan) =>
        plan.replace(
          "- alpha — Create alpha.\n  - order: at once.\n",
          "- alpha — merged.\n",
        ),
      (runtime) =>
        runtime.store.appendRecord(scriptMeta(1, "merge", { slug: "alpha" }), {
          ok: true,
          commit: "abc123",
        }),
    );
  });

  it("reports nothing for a cancelled bullet", async () => {
    await expectNoReturn(
      (plan) =>
        `${plan.replace("Create alpha.", "Create alpha later.")}cancelled: alpha — spent\n`,
      (runtime) =>
        runtime.store.appendRecord(scriptMeta(1, "cancel", { slug: "alpha" }), {
          ok: true,
          cause: makeCause("note", "spent"),
        }),
    );
  });

  it("reports nothing once the plan cancels the slug for a re-slug", async () => {
    await expectNoReturn(
      (plan) =>
        `${plan.replace("Create alpha.", "Create alpha later.")}cancelled: alpha — replaced by alpha-v2\n- alpha-v2 — Continue the work.\n`,
    );
  });
});
