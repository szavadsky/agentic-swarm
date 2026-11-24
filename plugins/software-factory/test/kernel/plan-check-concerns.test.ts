import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { recordedConcernId } from "../../src/core/concerns.js";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import {
  formatOpenConcern,
  forwardedConcerns,
  openConcerns,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive, openDebts } from "../../src/kernel/derive.js";
import {
  PLAN_CHECK_STEP,
  runPlanCheck,
  validatePlanCheck,
} from "../../src/kernel/plan-check.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";
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

const CONCERN_TEXT = "the retry window drops head names";
const CONCERN = {
  kind: "risk" as const,
  calibration: "architect" as const,
  text: CONCERN_TEXT,
};
const CONCERN_ID = recordedConcernId(CONCERN);

/** One task turn raising the concern every filtering test works with. */
function concernRaised(seq: number) {
  return rec(seq, {
    slug: "beta",
    step: "implement",
    outcome: outcome({
      summary: "beta shipped with a risk",
      concerns: [CONCERN],
    }),
  });
}

/** One checker report answering the concern the way the test names. */
function concernAnswered(
  seq: number,
  entry: {
    action: "resolve" | "task";
    slug?: string;
    reason: string;
  },
) {
  return rec(seq, {
    slug: undefined,
    step: PLAN_CHECK_STEP,
    outcome: outcome({
      planCheck: {
        verdict: "architect",
        evidence: [],
        followUps: [],
        concerns: [{ id: CONCERN_ID, ...entry }],
      },
    }),
  });
}

function registerConcernFiltering(): void {
  it("keeps a checker-resolved concern out of the pack and an unresolved one once", () => {
    const open = forwardedConcerns([concernRaised(1), concernRaised(2)]);
    expect(open.map((concern) => concern.id)).toEqual([CONCERN_ID]);
    expect(open[0]?.occurrences).toBe(2);

    const resolved = concernAnswered(3, {
      action: "resolve",
      reason: "the retry window is on the head",
    });
    expect(
      forwardedConcerns([concernRaised(1), concernRaised(2), resolved]),
    ).toEqual([]);
  });

  it("retires a task-answered concern only once its follow-up merged, and reopens a later raise", () => {
    const tasked = concernAnswered(2, {
      action: "task",
      slug: "beta-2",
      reason: "beta-2 widens the window",
    });
    expect(
      forwardedConcerns([concernRaised(1), tasked]).map(
        (concern) => concern.id,
      ),
    ).toEqual([CONCERN_ID]);

    const merged = script(3, { slug: "beta-2", step: "merge", ok: true });
    expect(forwardedConcerns([concernRaised(1), tasked, merged])).toEqual([]);

    // The answer retires the raises before it; a later raise is open again.
    expect(
      forwardedConcerns([
        concernRaised(1),
        tasked,
        merged,
        concernRaised(4),
      ]).map((concern) => concern.id),
    ).toEqual([CONCERN_ID]);
  });

  it("formats the open concern line with the id the checker names", () => {
    const [concern] = openConcerns([concernRaised(1)]);
    expect(formatOpenConcern(concern!)).toBe(
      `- ${CONCERN_ID} [risk/architect]: ${CONCERN_TEXT} — beta implement r1`,
    );
  });
}

const DEBT = {
  kind: "debt" as const,
  calibration: "architect" as const,
  text: "the shim hides the retry clock",
  id: "00001#1",
};
const DEBT_ID = recordedConcernId(DEBT);

/** The goal pack over beta's records: the forwarded list and the debt register. */
function packFor(records: StepRecord[]): string {
  const tasks = [task("beta")];
  return renderContextPack({
    goal: "demo",
    iteration: 2,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/demo",
    integrationBranch: "factory/demo",
    headHash: "abcdef1234567890",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks,
    state: derive(tasks, records),
    steers: [],
    setup: [],
    gates: [],
    forwarded: forwardedConcerns(records),
    debts: openDebts(records),
  });
}

const DEBT_ANSWER = {
  verdict: "architect" as const,
  evidence: [],
  followUps: [],
  concerns: [
    {
      id: DEBT_ID,
      action: "resolve" as const,
      reason: "the shim is on the head",
    },
  ],
};

const DEBT_RAISED = rec(1, {
  slug: "beta",
  step: "implement",
  outcome: outcome({
    summary: "beta left a shim",
    concerns: [CONCERN, DEBT],
  }),
});

function registerDebtKindPack(): void {
  it("keeps a debt-kind concern in the debt register and out of the checker's list", () => {
    const open = [DEBT_RAISED];
    expect(forwardedConcerns(open).map((concern) => concern.id)).toEqual([
      CONCERN_ID,
    ]);
    expect(openConcerns(open).map((concern) => concern.id)).toEqual([
      CONCERN_ID,
    ]);
    expect(openDebts(open).map((debt) => debt.text)).toEqual([DEBT.text]);

    // A checker answer cannot retire the debt: only the register can close it.
    const answered = rec(2, {
      slug: undefined,
      step: PLAN_CHECK_STEP,
      outcome: outcome({ planCheck: DEBT_ANSWER }),
    });
    const records = [DEBT_RAISED, answered];
    expect(openDebts(records).map((debt) => debt.text)).toEqual([DEBT.text]);

    const pack = packFor(records);
    expect(pack).toContain("## Forwarded concerns");
    expect(pack).toContain("- 00001#1 [architect]");
    expect(pack).not.toContain(DEBT_ID);
    // Once, in the register; the forwarded section never repeats it.
    expect(pack.split(DEBT.text)).toHaveLength(2);
    expect(pack.indexOf(DEBT.text)).toBeGreaterThan(
      pack.indexOf("## Debt register"),
    );
  });
}

function registerDebtKindValidation(): void {
  it("refuses a checker entry naming a debt-kind concern", () => {
    const plan = "# Plan\n\n- beta — Beta.\n";
    expect(
      validatePlanCheck(
        [plan],
        outcome({ planCheck: DEBT_ANSWER }),
        new Set([CONCERN_ID]),
      ),
    ).toEqual([
      `concern id "${DEBT_ID}" is not an open concern; name an id from the brief's concern list`,
    ]);
  });
}

function registerDebtKindConcerns(): void {
  registerDebtKindPack();
  registerDebtKindValidation();
}

function registerConcernValidation(): void {
  const plan = "# Plan\n\n- beta — Beta.\n";
  const check = (entry: {
    id?: string;
    action: "resolve" | "task";
    slug?: string;
    reason?: string;
  }) =>
    outcome({
      planCheck: {
        verdict: "progress",
        evidence: [],
        followUps: [{ kind: "amend", slug: "beta", reason: "retry" }],
        concerns: [{ id: CONCERN_ID, reason: "checked", ...entry }],
      },
    });
  const open = new Set([CONCERN_ID]);

  it("accepts a resolve and a task entry naming an open concern", () => {
    expect(
      validatePlanCheck([plan], check({ action: "resolve" }), open),
    ).toEqual([]);
    expect(
      validatePlanCheck([plan], check({ action: "task", slug: "beta" }), open),
    ).toEqual([]);
  });

  it("refuses an unknown concern id, a task with no follow-up, and a resolve with a slug", () => {
    expect(
      validatePlanCheck(
        [plan],
        check({ action: "resolve", id: "c-ghost" }),
        open,
      ),
    ).toEqual([
      'concern id "c-ghost" is not an open concern; name an id from the brief\'s concern list',
    ]);
    expect(
      validatePlanCheck([plan], check({ action: "task", slug: "gamma" }), open),
    ).toEqual([
      `concern ${CONCERN_ID} names slug "gamma" that no follow-up carries`,
    ]);
    expect(validatePlanCheck([plan], check({ action: "task" }), open)).toEqual([
      `concern ${CONCERN_ID} action task needs the slug of a follow-up it relies on`,
    ]);
    expect(
      validatePlanCheck(
        [plan],
        check({ action: "resolve", slug: "beta" }),
        open,
      ),
    ).toEqual([
      `concern ${CONCERN_ID} action resolve takes no slug; drop "beta"`,
    ]);
  });
}

/** A goal with beta's task and the concern its implement turn raised. */
async function concernedCheckGoal(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- beta — Beta.\n",
    "utf8",
  );
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "beta",
      step: "implement",
      round: 1,
      actor: "agent",
    },
    {
      ok: true,
      outcome: outcome({
        summary: "beta shipped with a risk",
        concerns: [CONCERN],
      }),
    },
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  return { harness, runtime, state };
}

/** The checker's turn: it reads the concern and answers it in the same report. */
function resolveConcernTurn(
  onPrompt: (prompt: string) => void,
): FakeTurnHandler {
  return (req, ctx) => {
    onPrompt(req.prompt);
    ctx.writeOutcome(
      outcome({
        summary: "beta can continue",
        planCheck: {
          verdict: "progress",
          evidence: [],
          followUps: [
            { kind: "amend", slug: "beta", reason: "retry the turn" },
          ],
          concerns: [
            {
              id: CONCERN_ID,
              action: "resolve",
              reason: "the retry window is on the head",
            },
          ],
        },
      }),
    );
    return fakeTurnResult(req);
  };
}

function registerConcernsInCheckTurn(): void {
  it("briefs the checker with the open concern and accepts its resolution", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const { harness, runtime, state } = await concernedCheckGoal(repo, goal);
      let prompt = "";
      harness.script(
        resolveConcernTurn((text) => (prompt = text)),
        {
          when: whenTurn({ step: PLAN_CHECK_STEP }),
        },
      );

      const checked = await runPlanCheck(runtime, {
        iteration: 1,
        round: 1,
        state,
      });
      expect(checked.verdict).toBe("progress");
      expect(prompt).toContain(
        `- ${CONCERN_ID} [risk/architect]: ${CONCERN_TEXT}`,
      );
      expect(openConcerns(await runtime.store.listRecords())).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("plan checker: concerns", () => {
  registerConcernFiltering();
  registerDebtKindConcerns();
  registerConcernValidation();
  registerConcernsInCheckTurn();
});
