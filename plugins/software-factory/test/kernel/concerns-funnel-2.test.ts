import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { readHolds } from "../../src/kernel/mailbox.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { cause, task } from "./helpers.js";
import { editPlan, writeHold } from "./steer-holds-helpers.js";
import {
  amendWithMark,
  CONCERN_ID,
  CONCERN_TEXT,
  heldWave,
  markedBoundary,
  mergedStatuses,
  parkedWave,
  runStall,
  scriptTask,
  STALE_ID,
  stallLeave,
  stallWithConcern,
} from "./concerns-funnel-helpers.js";

function registerMarkedAmendment(): void {
  it("keeps a marked task out of the wave the same stall turn resumes", async () => {
    const { repo, runtime, harness } = await parkedWave();
    try {
      harness.script(amendWithMark(runtime), {
        when: whenTurn({ step: "pm" }),
      });
      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(dispatched.allReadyHeld).toBe(true);
      expect(dispatched.cause).toEqual(
        cause(`steer: concern ${CONCERN_ID} holds alpha`),
      );
      // The amended slug resumed dispatch, but the mark withheld it.
      expect(await mergedStatuses(runtime)).toEqual([
        "alpha:ready",
        "beta:merged",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerHeldDispatch(): void {
  it("keeps a task a blocking concern names out of dispatch and runs the rest", async () => {
    const { repo, runtime, harness } = await heldWave();
    try {
      writeHold(runtime, CONCERN_ID, ["alpha"]);
      scriptTask(harness, "gamma");
      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(dispatched.allReadyHeld).toBe(true);
      expect(dispatched.cause).toEqual(
        cause(`steer: concern ${CONCERN_ID} holds alpha`),
      );
      expect(await mergedStatuses(runtime)).toEqual([
        "alpha:ready",
        "beta:merged",
        "gamma:merged",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("releases the task once the concern it names is no longer raised", async () => {
    const { repo, runtime, harness } = await heldWave();
    try {
      writeHold(runtime, STALE_ID, ["alpha"]);
      scriptTask(harness, "alpha");
      scriptTask(harness, "gamma");
      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.allReadyHeld).toBe(false);
      expect(await mergedStatuses(runtime)).toEqual([
        "alpha:merged",
        "beta:merged",
        "gamma:merged",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerBoundaryRelease(): void {
  it("releases a concern's mark after the architect read it at the boundary", async () => {
    const { repo, runtime, harness } = await markedBoundary();
    try {
      harness.script(
        (req, ctx) => {
          editPlan(runtime);
          ctx.writeOutcome(
            outcome({ summary: "ruled on the concern", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "architect" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 1,
      });
      expect(boundary.decision).toBe("continue");
      const file = path.join(runtime.store.mailbox.holds, `${CONCERN_ID}.yaml`);
      expect(fs.existsSync(file)).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerPassedMarkSurvives(): void {
  it("keeps a passed-on concern judged across a boundary consult", async () => {
    const { repo, runtime, harness, state } = await stallWithConcern();
    try {
      harness.script(stallLeave(runtime), { when: whenTurn({ step: "pm" }) });
      await runStall(runtime, state);
      const file = path.join(runtime.store.mailbox.holds, `${CONCERN_ID}.yaml`);
      expect(fs.existsSync(file)).toBe(true);
      withKernelRoleFallbacks(harness);
      harness.script(
        (req, ctx) => {
          editPlan(runtime);
          ctx.writeOutcome(
            outcome({ summary: "ruled on the concern", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "architect" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 1,
      });
      expect(boundary.decision).toBe("continue");
      // The pass record is what keeps the concern judged, so it outlives the
      // consult; only a mark that withheld work is released.
      const passed = (await readHolds(runtime.store)).holds.find(
        (hold) => hold.steer === CONCERN_ID,
      );
      expect(passed).toEqual({ steer: CONCERN_ID, slugs: [], goal: false });
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("open concerns: `none`");
          return stallLeave(runtime)(req, ctx);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      expect((await runStall(runtime, state)).left).toEqual(["alpha"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** A beta turn that ships and leaves the open risk concern the PM must judge. */
function scriptConcernedBeta(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta.txt\n", "utf8");
      ctx.writeOutcome(
        outcome({
          summary: "beta implemented with a risk",
          concerns: [
            {
              kind: "risk",
              calibration: "architect",
              text: CONCERN_TEXT,
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "beta approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "review" }) },
  );
}

function registerParklessBlockingConcern(): void {
  it("lets the PM judge forwarded concerns when dispatch exhausts with no park present and stops held ready work", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    try {
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Milestone 1\n\n- beta — Beta.\n- delta — Delta.\n- alpha — Alpha.\n",
        "utf8",
      );
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await writeTask(
        runtime,
        task("alpha", { deps: ["delta"], scope: ["alpha.txt"] }),
      );
      // Wave 1: beta ships and leaves an open concern; alpha waits on missing delta.
      scriptConcernedBeta(harness);
      // Wave-end PM runs without any park and marks the concern blocking alpha.
      let checkerPrompt = "";
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("stalled parks: `none`");
          expect(req.prompt).toContain(
            `- ${CONCERN_ID} [risk/architect]: ${CONCERN_TEXT}`,
          );
          writeHold(runtime, CONCERN_ID, ["alpha"]);
          ctx.writeOutcome(
            outcome({ summary: "marked concern blocking alpha" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      // Checker sees the PM's hold mark on open_concerns and restores delta.
      harness.script(
        (req, ctx) => {
          checkerPrompt = req.prompt;
          ctx.writeOutcome(
            outcome({
              summary: "delta is missing",
              planCheck: {
                verdict: "progress",
                evidence: [],
                followUps: [
                  {
                    kind: "missing-dep",
                    slug: "alpha",
                    dep: "delta",
                    reason: "delta is missing",
                  },
                ],
                concerns: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );
      // Plan-check follow-up PM writes delta.md.
      harness.script(
        (req, ctx) => {
          awaitDeltaWrite(runtime);
          ctx.writeOutcome(
            outcome({
              summary: "wrote missing dep delta",
              planCheckRoutes: [
                { slug: "alpha", action: "continue", reason: "added delta" },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      scriptTask(harness, "delta");
      // Second wave end after delta merges: alpha is ready and held; stop for architect.
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "alpha held by concern",
              planCheck: {
                verdict: "architect",
                evidence: [],
                followUps: [],
                concerns: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(checkerPrompt).toContain(
        `- ${CONCERN_ID} [risk/architect]: ${CONCERN_TEXT} · holds alpha — beta implement r1`,
      );
      expect(dispatched.reason).toBe("boundary");
      expect(dispatched.allReadyHeld).toBe(true);
      expect(dispatched.cause).toEqual(
        cause(`steer: concern ${CONCERN_ID} holds alpha`),
      );
      expect(await mergedStatuses(runtime)).toEqual([
        "alpha:ready",
        "beta:merged",
        "delta:merged",
      ]);
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "park")).toEqual([]);
      expect(records.filter((r) => r.step === "stall-routes")).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerSameWaveConcernStop(): void {
  it("reports the mark a parkless wave-end PM wrote at that wave's boundary", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      },
    });
    const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    try {
      fs.writeFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "# Milestone 1\n\n- beta — Beta.\n- alpha — Alpha.\n",
        "utf8",
      );
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await writeTask(
        runtime,
        task("alpha", { deps: ["delta"], scope: ["alpha.txt"] }),
      );
      scriptConcernedBeta(harness);
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("stalled parks: `none`");
          writeHold(runtime, CONCERN_ID, ["alpha"]);
          ctx.writeOutcome(
            outcome({ summary: "marked concern blocking alpha" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain(
            `- ${CONCERN_ID} [risk/architect]: ${CONCERN_TEXT} · holds alpha`,
          );
          ctx.writeOutcome(
            outcome({
              summary: "the held work has no missing dependency to restore",
              planCheck: {
                verdict: "architect",
                evidence: [],
                followUps: [],
                concerns: [],
              },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: PLAN_CHECK_STEP }) },
      );

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(dispatched.allReadyHeld).toBe(true);
      expect(dispatched.cause).toEqual(
        cause(`steer: concern ${CONCERN_ID} holds alpha`),
      );
      expect(await mergedStatuses(runtime)).toEqual([
        "alpha:pending",
        "beta:merged",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function awaitDeltaWrite(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
): void {
  fs.writeFileSync(
    path.join(runtime.store.tasksDir, "delta.md"),
    [
      "---",
      "slug: delta",
      "title: Create delta",
      "type: development",
      "deps: []",
      'source: "plan-check: 1"',
      "---",
      "",
      "Create delta.txt.",
      "Done when: delta.txt exists.",
      "",
    ].join("\n"),
    "utf8",
  );
}

describe("concerns funnel in dispatch and at the boundary", () => {
  registerMarkedAmendment();
  registerHeldDispatch();
  registerBoundaryRelease();
  registerPassedMarkSurvives();
  registerParklessBlockingConcern();
  registerSameWaveConcernStop();
});
