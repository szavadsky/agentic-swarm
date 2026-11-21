import { describe, expect, it } from "bun:test";
import {
  forwardedConcerns,
  goalDebtRecords,
  recordsForAudience,
  renderContextPack,
  shallowCodeMap,
} from "../../src/kernel/context-pack.js";
import { derive, openDebts } from "../../src/kernel/derive.js";
import { rec, script, task } from "./helpers.js";

const tasks = [task("a"), task("b", { deps: ["a"] })];

function listsEveryOpenDebtIdDropsClosedOnePart1() {
  const debtRecord = (seq: number, text: string, id: string) =>
    rec(seq, {
      step: "review",
      outcome: {
        status: "done",
        summary: `r${seq}`,
        concerns: [
          {
            kind: "debt" as const,
            calibration:
              seq % 2 === 0 ? ("fyi" as const) : ("architect" as const),
            text,
            id,
          },
        ],
        forward: [],
        verdict: "approve",
      },
    });
  // 25 debts, past the old `slice(-20)` cap, plus one retired by id.
  const records = [
    ...Array.from({ length: 25 }, (_, i) =>
      debtRecord(
        i + 1,
        `debt number ${i + 1} needs a follow-up`,
        `00${String(i + 1).padStart(3, "0")}#1`,
      ),
    ),
    debtRecord(26, "retired shim", "00026#1"),
    rec(27, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "closed the shim",
        concerns: [],
        forward: [],
        debtClosed: [{ id: "00026#1", reason: "shim removed" }],
        decision: "continue",
      },
    }),
  ];
  const debts = openDebts(records);

  return { records, debts };
}

function listsEveryOpenDebtIdDropsClosedOnePart2(
  scope: ReturnType<typeof listsEveryOpenDebtIdDropsClosedOnePart1>,
) {
  const { debts, records } = scope;
  expect(debts).toHaveLength(25);
  const pack = renderContextPack({
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
    debts,
  });
  const register = pack.slice(pack.indexOf("## Debt register"));
  expect(register).toContain("own one by citing its id in a plan bullet");
  expect(register).toContain("`debtClosed: [{id, reason}]`");
  for (const debt of debts) {
    expect(register).toContain(`${debt.id} [${debt.calibration}] ${debt.text}`);
  }
  expect(register).not.toContain("retired shim");
  expect(register).not.toContain("00026#1");
}

function routesTaskDebtOnlyEpicSDebtPart1() {
  const chained = [
    task("alpha.build", { epic: "alpha" }),
    task("beta.build", { epic: "beta" }),
  ];
  const records = [
    rec(1, {
      slug: "alpha.build",
      step: "implement",
      outcome: {
        status: "done",
        summary: "alpha shipped",
        concerns: [
          {
            kind: "debt" as const,
            calibration: "architect" as const,
            text: "alpha-only debt",
          },
        ],
        forward: [],
      },
    }),
    rec(2, {
      slug: "beta.build",
      step: "implement",
      outcome: {
        status: "done",
        summary: "beta shipped",
        concerns: [
          {
            kind: "debt" as const,
            calibration: "architect" as const,
            text: "beta-only debt",
          },
        ],
        forward: [],
      },
    }),
  ];
  const state = derive(chained, records);

  return { chained, records, state };
}

function routesTaskDebtOnlyEpicSDebtPart2(
  scope: ReturnType<typeof routesTaskDebtOnlyEpicSDebtPart1>,
) {
  const { records, chained, state } = scope;
  const debtsFor = (epic?: string) =>
    openDebts(
      recordsForAudience(
        records,
        chained,
        epic ? { kind: "epic", epic } : { kind: "goal" },
      ),
    );
  const packFor = (epic?: string): string =>
    renderContextPack({
      goal: "demo",
      iteration: 2,
      ...(epic ? { epic } : {}),
      intentPath: "/goal/intent.md",
      planPath: epic ? `/goal/epics/${epic}.md` : "/goal/plan.md",
      checkout: "/wt/demo",
      integrationBranch: "factory/demo",
      headHash: "abcdef1234567890",
      recordsDir: "/goal/records",
      tasksDir: "/goal/tasks",
      tasks: epic ? chained.filter((task) => task.epic === epic) : chained,
      state,
      steers: [],
      setup: [],
      gates: [],
      forwarded: [],
      debts: debtsFor(epic),
    });

  const top = packFor();
  const alpha = packFor("alpha");
  expect(top).not.toContain("alpha-only debt");
  expect(top).not.toContain("beta-only debt");
  expect(alpha).toContain("alpha-only debt");
  expect(alpha).not.toContain("beta-only debt");
}

const FINISHED_EPIC_DEBT =
  "alpha finished with an open debt: the timeout path has no remover";

const FINISHED_EPIC_NOTE = "alpha note: rename the timeout helper";

const LIVE_EPIC_DEBT = "beta is still open: cache keys can collide";

/** A task record raising the given debts, with the ids ingest would assign. */
function epicDebtRecord(
  seq: number,
  slug: string,
  debts: { text: string; id: string; calibration: "architect" | "fyi" }[],
): ReturnType<typeof rec> {
  return rec(seq, {
    slug,
    step: "implement",
    outcome: {
      status: "done",
      summary: `${slug} shipped`,
      concerns: debts.map((debt) => ({
        kind: "debt" as const,
        calibration: debt.calibration,
        text: debt.text,
        id: debt.id,
      })),
      forward: [],
    },
  });
}

/** One epic's subarchitect turn: done finishes it, continue keeps it live. */
function epicDecision(
  seq: number,
  epic: string,
  value: "done" | "continue",
): ReturnType<typeof rec> {
  return rec(seq, {
    slug: undefined,
    step: "subarchitect",
    architect: epic,
    outcome: {
      status: "done",
      summary: `epic ${epic} ${value}`,
      concerns: [],
      forward: [],
      decision: value,
    },
  });
}

function escalatesFinishedEpicDebtPart1() {
  const chained = [
    task("alpha.build", { epic: "alpha" }),
    task("beta.build", { epic: "beta" }),
  ];
  const alphaDebtId = "00001-i1-alpha.build-implement-r1#1";
  const alphaNoteId = "00001-i1-alpha.build-implement-r1#2";
  const betaDebtId = "00002-i1-beta.build-implement-r1#1";
  const records = [
    epicDebtRecord(1, "alpha.build", [
      { text: FINISHED_EPIC_DEBT, id: alphaDebtId, calibration: "architect" },
      { text: FINISHED_EPIC_NOTE, id: alphaNoteId, calibration: "fyi" },
    ]),
    epicDebtRecord(2, "beta.build", [
      { text: LIVE_EPIC_DEBT, id: betaDebtId, calibration: "architect" },
    ]),
    script(3, { step: "merge", slug: "alpha.build", ok: true }),
    script(4, { step: "merge", slug: "beta.build", ok: true }),
    epicDecision(5, "alpha", "done"),
    epicDecision(6, "beta", "continue"),
  ];
  const state = derive(chained, records);

  return { chained, records, state, alphaDebtId, alphaNoteId };
}

function escalatesFinishedEpicDebtPart2(
  scope: ReturnType<typeof escalatesFinishedEpicDebtPart1>,
) {
  const { chained, records, state, alphaDebtId, alphaNoteId } = scope;
  expect(state.epics.alpha?.done).toBe(true);
  expect(state.epics.beta?.done).toBe(false);
  // The finished epic's blocking debt escalates; its fyi note and the live
  // epic's debt stay inside their own registers.
  expect(openDebts(goalDebtRecords(records, chained, state.epics))).toEqual([
    {
      id: alphaDebtId,
      text: FINISHED_EPIC_DEBT,
      calibration: "architect",
      source: "alpha.build implement r1",
      iteration: 1,
      seq: 1,
    },
  ]);
  // Escalating copies the record up; the epic's own register is unchanged.
  expect(
    openDebts(
      recordsForAudience(records, chained, { kind: "epic", epic: "alpha" }),
    ).map((debt) => debt.id),
  ).toEqual([alphaDebtId, alphaNoteId]);
}

function keepsEveryTaskReviewDebtListedPart1() {
  const taskDebt = {
    id: "00010-i1-a-implement-r1#1",
    text: "env allowlist v2 is dead config and needs a removal task",
  };
  const reviewDebt = {
    id: "00011-i1-a-review-r1#1",
    text: "quota reset text parsing duplicates the provider table",
  };

  return { taskDebt, reviewDebt };
}

function keepsEveryTaskReviewDebtListedPart2(
  scope: ReturnType<typeof keepsEveryTaskReviewDebtListedPart1>,
) {
  const { taskDebt, reviewDebt } = scope;
  const records = [
    rec(1, {
      step: "implement",
      outcome: {
        status: "done",
        summary: "shipped with a shim",
        concerns: [
          {
            kind: "debt" as const,
            calibration: "architect" as const,
            text: taskDebt.text,
            id: taskDebt.id,
          },
        ],
        forward: [],
      },
    }),
    rec(2, {
      step: "review",
      outcome: {
        status: "done",
        summary: "approved with debt",
        concerns: [
          {
            kind: "debt" as const,
            calibration: "architect" as const,
            text: reviewDebt.text,
            id: reviewDebt.id,
          },
        ],
        forward: [],
        verdict: "approve",
      },
    }),
  ];

  return { ...scope, records };
}

function keepsEveryTaskReviewDebtListedPart3(
  scope: ReturnType<typeof keepsEveryTaskReviewDebtListedPart2>,
) {
  const { records, taskDebt, reviewDebt } = scope;
  const registerFor = (debts: ReturnType<typeof openDebts>): string => {
    const pack = renderContextPack({
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
      debts,
    });
    return pack.slice(pack.indexOf("## Debt register"));
  };

  const open = openDebts(records);
  expect(open.map((debt) => debt.id)).toEqual([taskDebt.id, reviewDebt.id]);
  const listed = registerFor(open);
  expect(listed).toContain(`${taskDebt.id} [architect] ${taskDebt.text}`);
  expect(listed).toContain(`${reviewDebt.id} [architect] ${reviewDebt.text}`);

  const ownById = `- env-allowlist-v2 — Remove the dead allowlist (${taskDebt.id})`;
  const owned = openDebts(records, ownById);
  expect(owned.map((debt) => debt.id)).toEqual([reviewDebt.id]);
  const ownedRegister = registerFor(owned);
  expect(ownedRegister).not.toContain(taskDebt.id);
  expect(ownedRegister).toContain(reviewDebt.id);

  const ownByText = `- env-allowlist-v2 — ${taskDebt.text}`;
  expect(openDebts(records, ownByText).map((debt) => debt.id)).toEqual([
    reviewDebt.id,
  ]);

  return { ...scope, registerFor, ownById };
}

function keepsEveryTaskReviewDebtListedPart4(
  scope: ReturnType<typeof keepsEveryTaskReviewDebtListedPart3>,
) {
  const { records, reviewDebt, ownById, registerFor, taskDebt } = scope;
  const closedRecords = [
    ...records,
    rec(3, {
      slug: undefined,
      step: "architect",
      outcome: {
        status: "done",
        summary: "closed the table duplicate",
        concerns: [],
        forward: [`debt closed: ${reviewDebt.text}`],
        decision: "continue",
      },
    }),
  ];
  const closed = openDebts(closedRecords, ownById);
  expect(closed).toEqual([]);
  expect(registerFor(closed)).toContain("- none open");

  // Ownership is the current plan's, not a recorded claim: dropping the
  // bullet returns the debt to the register, while the forwarded close stays.
  expect(
    openDebts(closedRecords, "- later — nothing filed yet").map(
      (debt) => debt.id,
    ),
  ).toEqual([taskDebt.id]);
}

function registerContextPackPart7(): void {
  it("routes a task debt only to its epic's debt register", () => {
    const scope1 = routesTaskDebtOnlyEpicSDebtPart1();
    routesTaskDebtOnlyEpicSDebtPart2(scope1);
  });

  it("escalates a finished epic's debt to the goal register, not a live epic's", () => {
    const scope1 = escalatesFinishedEpicDebtPart1();
    escalatesFinishedEpicDebtPart2(scope1);
  });

  it("lists every open debt with its id and drops the closed one", () => {
    const scope1 = listsEveryOpenDebtIdDropsClosedOnePart1();
    listsEveryOpenDebtIdDropsClosedOnePart2(scope1);
  });

  it("keeps every task and review debt listed until a plan bullet owns it or a forward closes it", () => {
    const scope1 = keepsEveryTaskReviewDebtListedPart1();
    const scope2 = keepsEveryTaskReviewDebtListedPart2(scope1);
    const scope3 = keepsEveryTaskReviewDebtListedPart3(scope2);
    keepsEveryTaskReviewDebtListedPart4(scope3);
  });

  it("groups a repository listing into a shallow path index", () => {
    expect(
      shallowCodeMap([
        "src/kernel/boundary.ts",
        "src/kernel/pm.ts",
        "src/harness/types.ts",
        "package.json",
        ".gitignore",
        "node_modules/x/index.js",
      ]),
    ).toEqual([
      "(root) — 2 files",
      "src/harness/ — 1 file",
      "src/kernel/ — 2 files",
    ]);
  });
}

describe("context pack", () => {
  registerContextPackPart7();
});
