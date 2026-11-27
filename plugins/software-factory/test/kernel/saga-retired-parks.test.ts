import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { outcome, pmScopeOf } from "./e2e-helpers.js";
import { cause, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome as typedOutcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  ALPHA_PLAN,
  BETA_PLAN,
  GOAL_PLAN,
  iterationOf,
  passOf,
} from "./saga-helpers.js";

async function setupRetiredParkBoundary(opts: { retired: boolean }) {
  const { repo, goal } = setupFlowRepo({
    process: { hierarchy: { depth: 2 } },
  });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const alphaPlan = path.join(runtime.store.goalDir, "epics/alpha.md");
  const betaPlan = path.join(runtime.store.goalDir, "epics/beta.md");

  fs.mkdirSync(path.dirname(alphaPlan), { recursive: true });
  fs.writeFileSync(planPath, GOAL_PLAN, "utf8");
  fs.writeFileSync(alphaPlan, ALPHA_PLAN, "utf8");
  fs.writeFileSync(betaPlan, BETA_PLAN, "utf8");

  await writeTask(
    runtime,
    task("alpha.park", { epic: "alpha", scope: ["alpha.txt"] }),
  );
  if (opts.retired) {
    await writeTask(
      runtime,
      task("alpha.next", {
        epic: "alpha",
        base: "alpha.park",
        scope: ["alpha.txt"],
      }),
    );
  }
  await writeTask(
    runtime,
    task("beta.build", { epic: "beta", scope: ["beta.txt"] }),
  );

  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "architect",
      round: 1,
      actor: "agent",
      architect: "main",
    },
    {
      ok: true,
      outcome: typedOutcome({ summary: "i1 planned", decision: "continue" }),
    },
  );
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "subarchitect",
      round: 1,
      actor: "agent",
      architect: "alpha",
    },
    {
      ok: true,
      outcome: typedOutcome({ summary: "alpha planned", decision: "done" }),
    },
  );
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "subarchitect",
      round: 1,
      actor: "agent",
      architect: "beta",
    },
    {
      ok: true,
      outcome: typedOutcome({ summary: "beta planned", decision: "continue" }),
    },
  );
  await runtime.store.appendRecord(
    scriptMeta(1, "park", { slug: "alpha.park" }),
    { ok: true, cause: cause("gates: unit") },
  );
  if (opts.retired) {
    await runtime.store.appendRecord(
      scriptMeta(1, "merge", { slug: "alpha.next" }),
      { ok: true, commit: "deadbeef" },
    );
  }

  if (!opts.retired) {
    harness.script(
      (req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "alpha still holds a live park",
            decision: "continue",
          }),
        );
        return fakeTurnResult(req);
      },
      {
        when: (req) =>
          req.prompt.includes("- epic: `alpha`") && passOf(req) === "report",
      },
    );
  }
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "beta still open", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        req.prompt.includes("- epic: `beta`") && passOf(req) === "report",
    },
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        planPath,
        [
          "# Milestone 1",
          "",
          "## Architect register",
          "",
          "- epic `alpha` | architect `subarchitect` | plan `epics/alpha.md` | scope `alpha.txt` | opened i1 | closed i2: retired park settled",
          "- epic `beta` | architect `subarchitect` | plan `epics/beta.md` | scope `beta.txt` | opened i1 | active",
          "",
        ].join("\n"),
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "closed alpha, continue beta",
          decision: "continue",
          epicConsults: ["beta"],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-architect-") },
  );
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(betaPlan, "\n- hold direction.\n", "utf8");
      ctx.writeOutcome(
        outcome({ summary: "beta takes direction", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        req.prompt.includes("- epic: `beta`") && passOf(req) === "direction",
    },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no new tasks" }));
      return fakeTurnResult(req);
    },
    { fallback: true, when: (req) => pmScopeOf(req) !== undefined },
  );

  return { repo, runtime, harness, planPath };
}

describe("saga boundary closing an epic with a retired park", () => {
  it("proceeds when an epic holding a retired park closes its register row", async () => {
    const { repo, runtime, harness } = await setupRetiredParkBoundary({
      retired: true,
    });
    try {
      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(boundary.decision).toBe("continue");
      expect(
        harness.calls.some(
          (call) =>
            call.prompt.includes("- epic: `beta`") &&
            passOf(call) === "direction",
        ),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("blocks when an epic holding an unretired park closes its register row", async () => {
    const { repo, runtime } = await setupRetiredParkBoundary({
      retired: false,
    });
    try {
      const boundary = await runBoundary(runtime, {
        relaunch: false,
        iteration: 2,
      });
      expect(boundary.decision).toBe("blocked");
      expect(boundary.cause).toContain('task "alpha.park"');
      expect(boundary.cause).toContain('closed epic "alpha"');
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
