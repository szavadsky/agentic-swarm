import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { formatCause } from "../../src/kernel/cause.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { defaultParkRoute } from "../../src/kernel/park-route.js";
import { runStallPm } from "../../src/kernel/pm.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { parseTaskFile } from "../../src/kernel/tasks.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { cause, causeText, task } from "./helpers.js";
import {
  bumpRevision,
  expectMovedHeadAmend,
  scriptMovedHeadAmend,
  scriptMovedHeadTurns,
  scriptZetaAndReviews,
} from "./park-recover-moved-head.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/** One red gate, then the fix arm: the first red asks for a fix, the second parks. */
const process = {
  flows: {
    "implement-review": {
      steps: [
        {
          id: "implement",
          prompt: "implementer",
          alias: "implementer",
          alternates: ["implementer-alt"],
        },
        { id: "checks", changeRequests: 0 },
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
};

const aliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  digest: { harness: "fake", model: "fake-digest" },
  implementer: { harness: "fake", model: "fake-impl" },
  "implementer-alt": { harness: "fake", model: "fake-alt-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

const BETA_BODY = "Write beta.txt.\nDone when: beta.txt holds beta.";

describe("per-cause default routing", () => {
  it("leaves review rejections and design blockers to the architect", () => {
    // The task's named edge: a rejected premise or an impossible approach is
    // direction, not a retry.
    expect(
      defaultParkRoute(cause("review rejected: premise is wrong")).action,
    ).toBe("leave");
    expect(
      defaultParkRoute(cause("blocked: the API cannot express this")).action,
    ).toBe("leave");
    // The fixable classes keep the branch; the spike's table is the default.
    expect(defaultParkRoute(cause("gates: unit")).action).toBe("amend");
    expect(defaultParkRoute(cause("base-conflict: clash.txt")).action).toBe(
      "amend",
    );
    // Routing reads the kind, never the detail: every failed outcome keeps
    // the branch unless its own evidence says otherwise.
    expect(defaultParkRoute(cause("failed: no work")).action).toBe("amend");
    expect(defaultParkRoute(cause("anything else")).action).toBe("leave");
  });
});

describe("park recovery inside the running iteration", () => {
  registerParkRecoveryInsideTheRunningIterationPart1();
  registerParkRecoveryInsideTheRunningIterationPart2();
  registerParkRecoveryInsideTheRunningIterationPart3();
});

/** Scripts alpha's implement and both approvals for Part 1. */
function scriptAlphaAndReviews(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  const approve: FakeTurnHandler = (req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  };
  harness.script(approve, { when: whenTurn({ step: "review" }) });
  harness.script(approve, { when: whenTurn({ step: "review" }) });
}

/** Scripts beta's three implement turns: red gate, fix, then clear. */
function scriptBetaRetries(harness: FakeHarness, turns: { n: number }): void {
  // The first turn arms the gate, the gate-fix turn keeps the same red,
  // and the amended turn keeps the branch and clears it.
  const betaTurn: FakeTurnHandler = (req, ctx) => {
    turns.n += 1;
    if (turns.n === 1) {
      fs.writeFileSync(path.join(req.cwd!, "beta-red.txt"), "red\n", "utf8");
    } else if (turns.n === 2) {
      fs.writeFileSync(path.join(req.cwd!, "fix-1.txt"), "fix\n", "utf8");
    } else {
      expect(fs.existsSync(path.join(req.cwd!, "fix-1.txt"))).toBe(true);
      expect(fs.existsSync(path.join(req.cwd!, "beta-red.txt"))).toBe(true);
      fs.rmSync(path.join(req.cwd!, "beta-red.txt"), { force: true });
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    }
    ctx.writeOutcome(outcome({ summary: "beta implemented" }));
    return fakeTurnResult(req);
  };
  for (let i = 0; i < 3; i += 1)
    harness.script(betaTurn, {
      when: whenTurn({ slug: "beta", step: "implement" }),
    });
}

/** Scripts the PM's amend route for beta and returns its prompt. */
function scriptBetaAmendPm(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  onPrompt: (prompt: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      onPrompt(req.prompt);
      bumpRevision(runtime, "beta");
      ctx.writeOutcome(
        outcome({
          summary: "amend beta",
          stallRoutes: [
            {
              slug: "beta",
              action: "amend",
              reason: "the named gate is fixable on the kept branch",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

/** Asserts alpha merged, beta reran on its branch and the PM saw the evidence. */
function expectParkRecoveredInIteration(
  records: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>,
  state: ReturnType<typeof derive>,
  stallPrompt: string,
): void {
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  // One wave merged alpha and still parked beta; the PM decided the park
  // and beta reran on its branch before the boundary.
  expect(
    records.some(
      (r) =>
        r.slug === "alpha" &&
        r.step === "merge" &&
        r.ok === true &&
        r.iteration === 1,
    ),
  ).toBe(true);
  const routes = records.filter((r) => r.step === "stall-routes");
  expect(routes).toHaveLength(1);
  expect(routes[0]!.iteration).toBe(1);
  expect(routes[0]!.outcome?.stallRoutes).toEqual([
    {
      slug: "beta",
      action: "amend",
      reason: "the named gate is fixable on the kept branch",
    },
  ]);
  const betaTurnsRun = records
    .filter(
      (r) => r.slug === "beta" && r.step === "implement" && r.actor === "agent",
    )
    .sort((a, b) => a.seq - b.seq);
  expect(betaTurnsRun).toHaveLength(3);
  expect(betaTurnsRun.map((r) => r.revision)).toEqual([0, 0, 1]);
  // The amend restarts the round, and the failure class that parked it
  // sends the rerun to the step's next alternate.
  expect(betaTurnsRun[2]!.round).toBe(1);
  expect(betaTurnsRun[2]!.model!.id).toBe("fake-alt-impl");
  for (const record of records.filter((r) => r.slug === "beta")) {
    expect(record.iteration).toBe(1);
  }
  // The PM saw the park evidence, the kept branch and the cause's default.
  expect(stallPrompt).toContain("cause: gates: ready");
  expect(stallPrompt).toContain("factory-task/demo/beta");
  expect(stallPrompt).toContain("amends: 0 of 1");
  expect(stallPrompt).toContain("default: amend — fix the named gate");
}

function registerParkRecoveryInsideTheRunningIterationPart1(): void {
  it("amends a red-gate park in an iteration that merged another task, and the task reruns in-iteration", async () => {
    const { repo, goal } = setupFlowRepo({
      process,
      aliases,
      gates: [{ id: "ready", command: "test ! -f beta-red.txt" }],
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      let stallPrompt = "";
      const turns = { n: 0 };
      scriptAlphaAndReviews(harness);
      scriptBetaRetries(harness, turns);
      scriptBetaAmendPm(harness, runtime, (prompt) => {
        stallPrompt = prompt;
      });

      await writeTask(
        runtime,
        task("alpha", { scope: ["alpha.txt"], body: "Write alpha.txt." }),
      );
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], body: BETA_BODY }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expectParkRecoveredInIteration(records, state, stallPrompt);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** Seeds a park with one amend already spent for alpha. */
async function seedSpentAmend(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
): Promise<void> {
  await runtime.store.appendRecord(scriptMeta(1, "park", { slug: "alpha" }), {
    ok: true,
    cause: cause("gates: unit"),
  });
  await runtime.store.appendRecord(
    scriptMeta(1, "stall-routes", { round: 1 }),
    {
      ok: true,
      outcome: outcome({
        summary: "amended alpha",
        stallRoutes: [
          { slug: "alpha", action: "amend", reason: "fixed the gate" },
        ],
      }),
    },
  );
}

/** The PM refuses a second amend, then leaves the park. */
function scriptSecondAmendRefused(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  onBrief: (brief: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      onBrief(req.prompt);
      bumpRevision(runtime, "alpha");
      ctx.writeOutcome(
        outcome({
          summary: "amend alpha again",
          stallRoutes: [
            { slug: "alpha", action: "amend", reason: "try again" },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  // The bound refuses the first turn; the retry picks a decision the
  // budget allows.
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "leave the park for the architect",
          stallRoutes: [
            {
              slug: "alpha",
              action: "leave",
              reason: "the amend budget is spent",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

/** Asserts the refused amend rolled back and the brief showed the spent budget. */
function expectSecondAmendRefused(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  result: Awaited<ReturnType<typeof runStallPm>>,
  records: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>,
  brief: string,
): void {
  expect(result.continued).toEqual([]);
  expect(result.left).toEqual(["alpha"]);
  const validations = records.filter((r) => r.step === "pm-validate");
  expect(causeText(validations[0]!.cause)).toContain("limits.parkAmends");
  // The refused amend was rolled back: the retry left revision 0.
  const file = path.join(runtime.store.tasksDir, "alpha.md");
  expect(parseTaskFile(fs.readFileSync(file, "utf8"), "alpha").revision).toBe(
    0,
  );
  // The first PM turn saw the spent budget and the cause's default.
  expect(brief).toContain("amends: 1 of 1");
  expect(brief).toContain("amend refused");
  expect(brief).toContain("default: amend — fix the named gate");
}

function registerParkRecoveryInsideTheRunningIterationPart2(): void {
  it("refuses a second amend of one slug in an iteration and leaves the park", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("alpha", { scope: ["alpha.txt"], body: "Write alpha.txt." }),
      );
      await seedSpentAmend(runtime);
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      let brief = "";
      scriptSecondAmendRefused(harness, runtime, (prompt) => {
        brief = prompt;
      });

      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      const records = await runtime.store.listRecords();
      expectSecondAmendRefused(runtime, result, records, brief);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** Scripts beta's failed turn and its amended turn that settles the moved head. */
function registerParkRecoveryInsideTheRunningIterationPart3(): void {
  it("merges a moved head into an amended kept branch on its first turn and resolves it there", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      let amendedPrompt = "";
      let headAtAmend = "";
      scriptMovedHeadTurns(harness, (prompt) => {
        amendedPrompt = prompt;
      });
      scriptZetaAndReviews(harness);
      scriptMovedHeadAmend(harness, runtime, repo, (head) => {
        headAtAmend = head;
      });

      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt", "clash.txt"], body: BETA_BODY }),
      );
      await writeTask(
        runtime,
        task("zeta", { scope: ["zeta.txt", "clash.txt"], body: "Write zeta." }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expectMovedHeadAmend(records, state, repo, headAtAmend, amendedPrompt);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
