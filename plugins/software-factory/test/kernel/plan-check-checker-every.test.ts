import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { scriptMeta } from "../../src/kernel/record.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
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

/** A goal whose only task already merged: nothing is open for the checker. */
async function nothingOpenGoal(runtime: KernelRuntime): Promise<void> {
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await runtime.store.appendRecord(scriptMeta(1, "merge", { slug: "alpha" }), {
    ok: true,
    commit: "deadbeef",
  });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- alpha — Alpha.\n",
    "utf8",
  );
}

/** The architect's terminal turn; the pack preparer uses its registered fallback. */
function scriptArchitectDone(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
}

/** The checker's clean report: a plan that still holds, no follow-up. */
function scriptCleanCheck(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "plan is complete",
          planCheck: { verdict: "architect", evidence: [], followUps: [] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
}

function registerCheckerPrecedesArchitect(): void {
  it("nothing open → checker turn precedes the architect turn", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await nothingOpenGoal(runtime);
      scriptCleanCheck(harness);
      scriptArchitectDone(harness);

      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(boundary.decision).toBe("done");
      const steps = harness.calls.map((call) => fakeTurnIdentity(call).step);
      const checkerIdx = steps.indexOf(PLAN_CHECK_STEP);
      const architectIdx = steps.indexOf("architect");
      expect(checkerIdx).toBeGreaterThanOrEqual(0);
      expect(architectIdx).toBeGreaterThanOrEqual(0);
      expect(checkerIdx).toBeLessThan(architectIdx);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerInfraCheckerReason(): void {
  it("all checker tiers unavailable → record states reason, pack contains it, architect still runs", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await nothingOpenGoal(runtime);
      runtime.exhaustedPools.set("fake+fake-check", Date.now() + 60 * 60_000);
      scriptArchitectDone(harness);

      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(boundary.decision).toBe("done");

      const records = await runtime.store.listRecords();
      const checkRecord = records.find(
        (r) => r.step === PLAN_CHECK_STEP && r.endedAt,
      );
      expect(checkRecord).toBeDefined();
      const stop = checkRecord!.stop;
      expect(stop?.kind).toBe("infra");
      expect(stop?.kind === "infra" ? stop.cause : undefined).toBe(
        "unavailable",
      );
      expect(stop?.kind === "infra" ? stop.details : undefined).toContain(
        'alias "plan-checker" has no live tier',
      );

      const pack = await runtime.store.readFile(
        contextPackRelPath(boundary.iteration),
      );
      expect(pack).toContain("## Plan check");
      expect(pack).toContain("checker did not run");
      expect(pack).toContain('alias "plan-checker" has no live tier');

      const archSteps = harness.calls
        .map((call) => fakeTurnIdentity(call).step)
        .filter((step) => step === "architect");
      expect(archSteps).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerCleanCheckerRecord(): void {
  it("checker with no findings writes a clean record", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await nothingOpenGoal(runtime);
      scriptCleanCheck(harness);
      scriptArchitectDone(harness);

      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(boundary.decision).toBe("done");

      const pack = await runtime.store.readFile(
        contextPackRelPath(boundary.iteration),
      );
      expect(pack).toContain("## Plan check");
      expect(pack).toContain("verdict architect");
      expect(pack).toContain("- no evidence recorded");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

describe("plan checker every consult", () => {
  registerCheckerPrecedesArchitect();
  registerInfraCheckerReason();
  registerCleanCheckerRecord();
});
