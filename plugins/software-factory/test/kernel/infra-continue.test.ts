import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import {
  INFRA_REDISPATCH_DELAYS_MS,
  runDispatch,
} from "../../src/kernel/dispatch.js";
import { PLAN_CHECK_STEP } from "../../src/kernel/plan-check.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptStallLeave,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const ALIASES: FlowRepoOptions["aliases"] = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  digest: { harness: "fake", model: "fake-digest" },
  implementer: {
    harness: "fake",
    model: "fake-a",
    fallbacks: [{ model: "fake-b" }],
  },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

const RESET = {
  kind: "infra",
  cause: "network",
  details: "fetch failed: ECONNRESET",
} as const;

describe("transient infra never ends a launch with dispatchable work left", () => {
  registerTransientInfraNeverEndsALaunchWithDispatchableWorkLeftPart1();
  registerTransientInfraNeverEndsALaunchWithDispatchableWorkLeftPart2();
  registerTransientInfraNeverEndsALaunchWithDispatchableWorkLeftPart3();
});

async function backsOffSkipsExhaustedPoolLandsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script((req) => fakeTurnResult(req, { stop: RESET }), {
    when: whenTurn({ slug: "alpha", step: "implement" }),
  });
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

  const sleeps: number[] = [];
  const result = await runDispatch(runtime, {
    iteration: 1,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  expect(result.reason).toBe("boundary");
  expect(sleeps).toEqual([INFRA_REDISPATCH_DELAYS_MS[0]!]);

  return { harness, runtime };
}

async function backsOffSkipsExhaustedPoolLandsPart2(
  scope: Awaited<ReturnType<typeof backsOffSkipsExhaustedPoolLandsPart1>>,
) {
  const { harness, runtime } = scope;
  expect(harness.calls.map((call) => call.model.id)).toEqual([
    "fake-a",
    "fake-b",
    "fake-b",
    "fake-review",
    "fake-review",
  ]);
  expect(runtime.exhaustedPools.has("fake+fake-a")).toBe(true);

  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  // The discarded attempt and its two tier hops cost no turn; the
  // delivered implement, QA and review do.
  expect(state.tasks.alpha!.turns).toBe(3);

  const records = await runtime.store.listRecords();
  const implementRecords = records.filter(
    (r) => r.slug === "alpha" && r.step === "implement",
  );
  expect(implementRecords).toHaveLength(2);
  expect(implementRecords[0]!.stop).toEqual(RESET);
  expect(implementRecords[0]!.outcome).toBeUndefined();
  expect(implementRecords[0]!.attempts?.map((attempt) => attempt.stop)).toEqual(
    [{ kind: "infra", cause: "quota" }, RESET],
  );
  expect(implementRecords[1]!.stop).toEqual({ kind: "done" });
  expect(implementRecords[1]!.model?.id).toBe("fake-b");
}

async function runsStewardStallPMPlanCheckBeforePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(
    (req) =>
      fakeTurnResult(req, {
        stop: {
          kind: "infra",
          cause: "auth",
          details: "invalid api key",
        },
      }),
    {
      when: whenTurn({ slug: "alpha", step: "implement" }),
      fallback: true,
    },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "runner crashed mid-turn" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  scriptStallLeave(harness, ["beta"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n## alpha\nDo alpha.\n\n## beta\nDo beta.\n",
    "utf8",
  );
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

  const sleeps: number[] = [];
  const result = await runDispatch(runtime, {
    iteration: 1,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  // Auth is fatal: no backoff, and the fault names the stop only after the
  // wave's recovery ran.
  expect(result.reason).toBe("infra");

  return { harness, runtime, sleeps, result };
}

async function runsStewardStallPMPlanCheckBeforePart2(
  scope: Awaited<ReturnType<typeof runsStewardStallPMPlanCheckBeforePart1>>,
) {
  const { result, sleeps, runtime, harness } = scope;
  expect(result.cause).toEqual({
    kind: "boundary",
    detail: "alpha: auth: invalid api key",
  });
  expect(sleeps).toEqual([]);

  const records = await runtime.store.listRecords();
  expect(
    records.some(
      (record) =>
        record.step === "steward" &&
        record.iteration === 1 &&
        causeText(record.cause) === "skipped: no conflicts",
    ),
  ).toBe(true);
  const stalls = records.filter(
    (record) => record.step === "stall-routes" && record.endedAt,
  );
  expect(stalls).toHaveLength(1);
  expect(stalls[0]!.outcome?.stallRoutes).toEqual([
    { slug: "beta", action: "leave", reason: "left for the architect" },
  ]);
  expect(
    harness.calls.some(
      (call) => fakeTurnIdentity(call).step === PLAN_CHECK_STEP,
    ),
  ).toBe(true);

  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("ready");
  expect(state.tasks.alpha!.turns).toBe(0);
  expect(state.tasks.beta!.status).toBe("parked");
}

function registerTransientInfraNeverEndsALaunchWithDispatchableWorkLeftPart1(): void {
  it("backs off, skips the exhausted pool and lands the task on the next attempt", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: ALIASES,
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await backsOffSkipsExhaustedPoolLandsPart1(repo, goal);
      await backsOffSkipsExhaustedPoolLandsPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerTransientInfraNeverEndsALaunchWithDispatchableWorkLeftPart2(): void {
  it("stops infra only after every bounded re-dispatch is spent", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        ...ALIASES,
        implementer: { harness: "fake", model: "fake-a" },
      },
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => fakeTurnResult(req, { stop: RESET }), {
        when: whenTurn({ slug: "alpha", step: "implement" }),
        fallback: true,
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      const sleeps: number[] = [];
      const result = await runDispatch(runtime, {
        iteration: 1,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });

      expect(result.reason).toBe("infra");
      expect(result.cause).toEqual({
        kind: "boundary",
        detail: "alpha: network: fetch failed: ECONNRESET",
      });
      expect(sleeps).toEqual([...INFRA_REDISPATCH_DELAYS_MS]);
      // One attempt plus one per delay: bounded, so a persistent fault cannot
      // spin the iteration.
      expect(harness.calls).toHaveLength(INFRA_REDISPATCH_DELAYS_MS.length + 1);
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.alpha!.turns).toBe(0);
      expect(state.tasks.alpha!.park).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerTransientInfraNeverEndsALaunchWithDispatchableWorkLeftPart3(): void {
  it("runs the steward, the stall PM and the plan check before an infra stop", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await runsStewardStallPMPlanCheckBeforePart1(repo, goal);
      await runsStewardStallPMPlanCheckBeforePart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
