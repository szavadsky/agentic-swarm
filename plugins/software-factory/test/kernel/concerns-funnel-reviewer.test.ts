import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import {
  forwardedConcerns,
  openConcerns,
} from "../../src/kernel/context-pack.js";
import {
  knownDebtIds,
  materialOpenDebts,
  openDebts,
} from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { formatReviewFindings } from "../../src/kernel/record.js";
import {
  concernLines,
  ownerRemarkableLines,
} from "../../src/kernel/summary/tables.js";
import type { StepRecord } from "../../src/kernel/types.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const IMPL_CONCERN = "helper duplicates existing parser";
const QA_CONCERN = "concurrency timeout is untested under load";

function scriptAlphaTask(harness: FakeHarness): {
  getReviewerPrompt: () => string;
} {
  let reviewerPrompt = "";
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(
        outcome({
          summary: "alpha implemented",
          concerns: [
            {
              kind: "risk",
              calibration: "architect",
              text: IMPL_CONCERN,
              evidence: "alpha.txt",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "alpha accepted",
          qa: { verdict: "accept" },
          concerns: [
            { kind: "uncertainty", calibration: "architect", text: QA_CONCERN },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "qa" }) },
  );
  harness.script(
    (req, ctx) => {
      reviewerPrompt = req.prompt;
      ctx.writeOutcome(
        outcome({
          summary: "approved; dismissed immaterial implementer concern",
          verdict: "approve",
          concerns: [
            {
              kind: "risk",
              calibration: "architect",
              text: IMPL_CONCERN,
              evidence: "alpha.txt",
              dismiss: "immaterial",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );
  return { getReviewerPrompt: () => reviewerPrompt };
}

function scriptStalledBeta(harness: FakeHarness): {
  getPmPrompt: () => string;
} {
  let pmPrompt = "";
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ status: "blocked", summary: "beta blocked" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      pmPrompt = req.prompt;
      ctx.writeOutcome(
        outcome({
          summary: "left beta for architect",
          stallRoutes: [{ slug: "beta", action: "leave", reason: "blocked" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  return { getPmPrompt: () => pmPrompt };
}

async function runFunnelScenario(): Promise<void> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1, perSubscription: {}, perModel: {} } },
  });
  try {
    const harness = new FakeHarness({ id: "fake" });
    const { getReviewerPrompt } = scriptAlphaTask(harness);
    const { getPmPrompt } = scriptStalledBeta(harness);
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
    await writeTask(
      runtime,
      task("beta", { deps: ["alpha"], scope: ["b.txt"] }),
    );
    expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
      "boundary",
    );

    const reviewerPrompt = getReviewerPrompt();
    expect(reviewerPrompt).toContain(IMPL_CONCERN);
    expect(reviewerPrompt).toContain("implement r1");
    expect(reviewerPrompt).toContain(QA_CONCERN);
    expect(reviewerPrompt).toContain("qa r1");
    expect(getPmPrompt()).not.toContain(IMPL_CONCERN);
    expect(getPmPrompt()).toContain(QA_CONCERN);

    const records = await runtime.store.listRecords();
    expect(openConcerns(records).map((c) => c.text)).toEqual([QA_CONCERN]);
    expect(forwardedConcerns(records).map((c) => c.text)).toEqual([QA_CONCERN]);
  } finally {
    cleanupFlowRepo(repo);
  }
}

function dedupeFixtureRecords(): StepRecord[] {
  return [
    rec(1, {
      slug: "alpha",
      step: "implement",
      round: 1,
      outcome: outcome({
        summary: "r1",
        concerns: [
          {
            kind: "risk",
            calibration: "architect",
            text: IMPL_CONCERN,
            evidence: "a.txt",
          },
        ],
      }),
    }),
    rec(2, {
      slug: "alpha",
      step: "review",
      round: 1,
      outcome: outcome({
        summary: "1. fix bug",
        verdict: "changes",
        concerns: [
          {
            kind: "risk",
            calibration: "architect",
            text: IMPL_CONCERN,
            dismiss: "immaterial",
          },
        ],
      }),
    }),
    rec(3, {
      slug: "beta",
      step: "implement",
      round: 1,
      outcome: outcome({
        summary: "beta r1",
        concerns: [
          {
            kind: "risk",
            calibration: "architect",
            text: IMPL_CONCERN,
            evidence: "a.txt",
          },
        ],
      }),
    }),
  ];
}

async function runDedupeAndIsolationTest(): Promise<void> {
  const { repo, goal } = setupFlowRepo();
  try {
    const runtime = await makeRuntime(repo, goal, {
      fake: new FakeHarness({ id: "fake" }),
    });
    const flow = runtime.configs.process.flows["implement-review"]!;
    const alpha = task("alpha", { scope: ["a.txt"] });
    const records = dedupeFixtureRecords();

    const alphaR2 = promptVars(runtime, alpha, "/wt/alpha", records, 2, flow);
    expect(alphaR2.prior_concerns).toBe("");
    expect(formatReviewFindings(records[1]!.outcome!)).not.toContain(
      IMPL_CONCERN,
    );
    expect(openConcerns(records).map((c) => c.source)).toEqual([
      "beta implement r1",
    ]);

    const reraised = [
      ...records,
      rec(4, {
        slug: "alpha",
        step: "implement",
        round: 2,
        outcome: outcome({
          summary: "r2",
          concerns: [
            {
              kind: "risk",
              calibration: "architect",
              text: IMPL_CONCERN,
              evidence: "a.txt",
            },
          ],
        }),
      }),
    ];
    const reopened = promptVars(runtime, alpha, "/wt/alpha", reraised, 2, flow);
    expect(reopened.prior_concerns).toContain(IMPL_CONCERN);
  } finally {
    cleanupFlowRepo(repo);
  }
}

function scriptLastCallDebtDismissal(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "a.txt"), "a\n", "utf8");
      ctx.writeOutcome(
        outcome({
          summary: "done",
          concerns: [
            {
              kind: "debt",
              calibration: "owner",
              text: "temporary adapter in a.ts",
              evidence: "a.ts",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "last-call approve after dismissing debt",
          verdict: "approve",
          concerns: [
            {
              kind: "debt",
              calibration: "owner",
              text: "temporary adapter in a.ts",
              evidence: "a.ts",
              dismiss: "immaterial",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );
}

async function runDebtDismissalTest(): Promise<void> {
  const { repo, goal } = setupFlowRepo({
    process: {
      flows: {
        "implement-review": {
          steps: [
            { id: "implement", prompt: "implementer", alias: "implementer" },
            {
              id: "review",
              prompt: "reviewer",
              alias: "reviewer",
              review: true,
              changeRequests: 0,
            },
          ],
        },
      },
    },
  });
  try {
    const harness = new FakeHarness({ id: "fake" });
    scriptLastCallDebtDismissal(harness);
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    await writeTask(runtime, task("alpha", { scope: ["a.txt"] }));
    await runDispatch(runtime, { iteration: 1 });

    const records = await runtime.store.listRecords();
    expect(records.filter((r) => r.step === "debt")).toEqual([]);
    expect(openDebts(records)).toEqual([]);
    expect(materialOpenDebts(records)).toEqual([]);
    expect(knownDebtIds(records).size).toBe(0);
    expect(concernLines(records, "debt")).toEqual([]);
    expect(ownerRemarkableLines(records)).toEqual([]);
  } finally {
    cleanupFlowRepo(repo);
  }
}

describe("reviewer concerns funnel", () => {
  it(
    "funnels implementer and QA concerns to the reviewer and stops dismissed ones before the PM",
    runFunnelScenario,
    60_000,
  );
  it(
    "hides already-dismissed concerns on later review rounds unless re-raised, and isolates tasks",
    runDedupeAndIsolationTest,
  );
  it(
    "stops dismissed debt and owner concerns from reaching debt register, summary or last-call appendDebt",
    runDebtDismissalTest,
    60_000,
  );
});
