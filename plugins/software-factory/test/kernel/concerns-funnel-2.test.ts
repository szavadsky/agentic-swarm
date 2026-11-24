import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { fakeTurnResult } from "../../src/harness/fake/index.js";
import { readHolds } from "../../src/kernel/mailbox.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { cleanupFlowRepo, outcome, whenTurn } from "./s2-helpers.js";
import { cause } from "./helpers.js";
import { editPlan, writeHold } from "./steer-holds-helpers.js";
import {
  amendWithMark,
  CONCERN_ID,
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

describe("concerns funnel in dispatch and at the boundary", () => {
  registerMarkedAmendment();
  registerHeldDispatch();
  registerBoundaryRelease();
  registerPassedMarkSurvives();
});
