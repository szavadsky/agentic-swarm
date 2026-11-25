import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import {
  ConfigError,
  loadConfigs,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import {
  DEFAULT_POOL_RESET_MINUTES,
  loadPoolResets,
  markPoolExhausted,
  poolExhausted,
  poolResetAt,
  poolResetMinutes,
  quotaPoolsPath,
  settlePoolProbe,
  takePoolCall,
} from "../../src/kernel/quota-pools.js";
import {
  cleanupFlowRepo,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

const implementerVars = {
  task_path: "/g/tasks/a.md",
  report_path: "",
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  baseline_checks: "none",
  findings: "",
};

describe("quota config", () => {
  it("reads a pool's own retry interval and refuses a non-positive one", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-config-"));
    try {
      fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
      const run = path.join(root, ".factory/run.yaml");
      fs.writeFileSync(
        run,
        "quota: { resetMinutes: 45, maxResetMinutes: 600, perSubscription: { pool-go: 60 } }\n",
      );
      expect(loadConfigs(root).run.quota).toEqual({
        resetMinutes: 45,
        maxResetMinutes: 600,
        perSubscription: { "pool-go": 60 },
      });

      fs.writeFileSync(run, "quota: { perSubscription: { pool-go: 0 } }\n");
      expect(() => loadConfigs(root)).toThrow(ConfigError);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("pool retry interval", () => {
  const now = 1_000_000;

  it("gives each pool its own interval, and the stated reset still wins", () => {
    const run = {
      quota: { resetMinutes: 45, perSubscription: { "pool-a": 10 } },
    };
    expect(poolResetMinutes(run, "pool-a")).toBe(10);
    expect(poolResetMinutes(run, "pool-b")).toBe(45);
    expect(poolResetMinutes({}, "pool-a")).toBe(DEFAULT_POOL_RESET_MINUTES);
    expect(poolResetAt(run, now, undefined, "pool-a")).toBe(now + 10 * 60_000);
    expect(poolResetAt(run, now, undefined, "pool-b")).toBe(now + 45 * 60_000);
    // A provider-stated reset overrides the configured interval.
    expect(poolResetAt(run, now, "Resets in 33m53s.", "pool-a")).toBe(
      now + 33 * 60_000,
    );
  });
});

function tempPoolPaths(): { sessionsDir: string; goalDir: string } {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "quota-pools-"));
  return { sessionsDir, goalDir: path.join(sessionsDir, "demo") };
}

describe("pool latch claim", () => {
  it("replaces a probe's claim, so a stated reset shorter than the interval wins", async () => {
    const paths = tempPoolPaths();
    try {
      const now = Date.now();
      const pools = new Map([["pool-a", { resetAt: now - 60_000 }]]);
      const call = takePoolCall(pools, "pool-a", now);
      expect(call.kind).toBe("probe");

      await markPoolExhausted({
        paths,
        pools,
        pool: "pool-a",
        resetAt: now + 33 * 60_000,
      });
      expect(pools.get("pool-a")?.resetAt).toBe(now + 33 * 60_000);
      expect(poolExhausted(pools, "pool-a", now)).toBe(true);
    } finally {
      fs.rmSync(paths.sessionsDir, { recursive: true, force: true });
    }
  });
});

describe("pool probe", () => {
  const now = 1_000_000;

  it("lets exactly one call probe a due pool and keeps the others off it", () => {
    const pools = new Map([["pool-a", { resetAt: now - 1 }]]);

    const first = takePoolCall(pools, "pool-a", now);
    expect(first.kind).toBe("probe");
    expect(poolExhausted(pools, "pool-a", now)).toBe(true);
    // The claim is in memory before any call, so a concurrent leg sees it.
    expect(takePoolCall(pools, "pool-a", now)).toEqual({ kind: "latched" });

    if (first.kind !== "probe") throw new Error("unreachable");
    settlePoolProbe(pools, "pool-a", first.claim, true);
    expect(poolExhausted(pools, "pool-a", now)).toBe(false);
    expect(takePoolCall(pools, "pool-a", now)).toEqual({ kind: "free" });
  });

  it("leaves an inconclusive probe due, and a latched pool refuses every call", () => {
    const pools = new Map([["pool-a", { resetAt: now - 1 }]]);
    const call = takePoolCall(pools, "pool-a", now);
    if (call.kind !== "probe") throw new Error("expected a probe");

    settlePoolProbe(pools, "pool-a", call.claim, false);
    expect(poolExhausted(pools, "pool-a", now)).toBe(false);
    expect(takePoolCall(pools, "pool-a", now).kind).toBe("probe");

    const latched = new Map([["pool-b", { resetAt: now + 60_000 }]]);
    expect(takePoolCall(latched, "pool-b", now)).toEqual({ kind: "latched" });
    expect(poolExhausted(latched, "pool-b", now)).toBe(true);
  });

  it("never drops a latch another leg stored while the probe ran", () => {
    const pools = new Map([["pool-a", { resetAt: now - 1 }]]);
    const call = takePoolCall(pools, "pool-a", now);
    if (call.kind !== "probe") throw new Error("expected a probe");

    pools.set("pool-a", { resetAt: now + 60_000 });
    expect(settlePoolProbe(pools, "pool-a", call.claim, true)).toBe(false);
    expect(pools.get("pool-a")?.resetAt).toBe(now + 60_000);
  });
});

function registerLatchAcrossGoals(): void {
  it("carries a latch from one goal into another goal's launch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const configs = loadConfigs(repo.dir);
      const paths = resolveGoalPaths(configs, repo.dir, goal);
      const otherGoal = resolveGoalPaths(configs, repo.dir, "other-goal");
      await markPoolExhausted({
        paths,
        pools: new Map(),
        pool: "a+ma",
        resetAt: Date.now() + 60 * 60_000,
      });

      const reloaded = await loadPoolResets(otherGoal);
      expect(poolExhausted(reloaded, "a+ma")).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerTwoPoolIntervals(): void {
  it("resets two pools on their own configured intervals", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: TWO_POOL_ALIASES });
    try {
      const a = new FakeHarness({ id: "a" });
      const b = new FakeHarness({ id: "b" });
      const runtime = await makeRuntime(repo, goal, { a, b });
      runtime.configs.run.quota = {
        resetMinutes: 45,
        perSubscription: { "pool-a": 10 },
      };
      a.scriptResult({ stop: { kind: "infra", cause: "quota" } });
      b.scriptResult({ stop: { kind: "infra", cause: "quota" } });

      const before = Date.now();
      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      const after = Date.now();

      expect(result.record.stop).toEqual({ kind: "infra", cause: "quota" });
      const poolA = runtime.exhaustedPools.get("pool-a")!.resetAt;
      const poolB = runtime.exhaustedPools.get("pool-b")!.resetAt;
      // pool-a's own 10-minute interval, pool-b's default 45.
      expect(poolA).toBeGreaterThanOrEqual(before + 10 * 60_000);
      expect(poolA).toBeLessThanOrEqual(after + 10 * 60_000);
      expect(poolB).toBeGreaterThanOrEqual(before + 45 * 60_000);
      expect(poolB).toBeLessThanOrEqual(after + 45 * 60_000);

      const stored = yaml.parse(
        fs.readFileSync(quotaPoolsPath(runtime.paths), "utf8"),
      );
      expect(Date.parse(stored.pools["pool-a"].resetAt)).toBe(poolA);
      expect(Date.parse(stored.pools["pool-b"].resetAt)).toBe(poolB);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

const TWO_POOL_ALIASES: FlowRepoOptions["aliases"] = {
  architect: { harness: "a", model: "ma-arch" },
  pm: { harness: "a", model: "ma-pm" },
  reviewer: { harness: "b", model: "mb-review" },
  steward: { harness: "a", model: "ma-steward" },
  implementer: {
    harness: "a",
    model: "ma",
    subscription: "pool-a",
    fallbacks: [{ harness: "b", model: "mb", subscription: "pool-b" }],
  },
};

async function probesDuePoolOncePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const a = new FakeHarness({ id: "a" });
  const b = new FakeHarness({ id: "b" });
  const runtime = await makeRuntime(repo, goal, { a, b });
  // pool-a's interval passed: its next call is the one probe.
  runtime.exhaustedPools.set("pool-a", { resetAt: Date.now() - 60_000 });

  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sawProbe = (): void => {};
  const probing = new Promise<void>((resolve) => {
    sawProbe = resolve;
  });
  a.script(async (req, ctx) => {
    sawProbe();
    await gate;
    ctx.writeOutcome(outcome({ summary: "served on the probed pool" }));
    return fakeTurnResult(req);
  });
  b.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "served on the fallback pool" }));
    return fakeTurnResult(req);
  });

  const probe = runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: repo.dir,
    meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
  await probing;
  // The claim landed before the call: every other leg reads a latch.
  expect(poolExhausted(runtime.exhaustedPools, "pool-a")).toBe(true);

  return { runtime, a, probe, release };
}

async function probesDuePoolOncePart2(
  scope: Awaited<ReturnType<typeof probesDuePoolOncePart1>>,
) {
  const { runtime, a, probe, release } = scope;
  const repo = runtime.repo.mainRoot;
  const other = await runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: repo,
    meta: { iteration: 1, slug: "b", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
  expect(other.record.model?.id).toBe("mb");
  expect(a.calls).toHaveLength(1);

  release();
  expect((await probe).record.model?.id).toBe("ma");
  // The probe served: the pool is live in memory and in the store, so the
  // next launch does not probe it again.
  expect(runtime.exhaustedPools.has("pool-a")).toBe(false);
  expect((await loadPoolResets(runtime.paths)).has("pool-a")).toBe(false);
}

async function probesDuePoolOncePart3(
  scope: Awaited<ReturnType<typeof probesDuePoolOncePart1>>,
) {
  const { runtime, a } = scope;
  a.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "served on the recovered pool" }));
    return fakeTurnResult(req);
  });
  const later = await runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: runtime.repo.mainRoot,
    meta: { iteration: 1, slug: "c", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
  expect(later.record.model?.id).toBe("ma");
  expect(a.calls).toHaveLength(2);
}

function registerDuePoolProbe(): void {
  it("probes a due pool once: another turn falls back while the probe is in flight", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: TWO_POOL_ALIASES });
    try {
      const scope1 = await probesDuePoolOncePart1(repo, goal);
      await probesDuePoolOncePart2(scope1);
      await probesDuePoolOncePart3(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerProbeRelatch(): void {
  it("relatches a pool whose probe answers quota, for the stated reset", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        architect: { harness: "a", model: "ma-arch" },
        pm: { harness: "a", model: "ma-pm" },
        reviewer: { harness: "b", model: "mb-review" },
        steward: { harness: "a", model: "ma-steward" },
        implementer: {
          harness: "a",
          model: "ma",
          subscription: "pool-a",
          fallbacks: [{ harness: "b", model: "mb" }],
        },
      },
    });
    try {
      const a = new FakeHarness({ id: "a" });
      const b = new FakeHarness({ id: "b" });
      const runtime = await makeRuntime(repo, goal, { a, b });
      runtime.configs.run.quota = { resetMinutes: 45, perSubscription: {} };
      runtime.exhaustedPools.set("pool-a", { resetAt: Date.now() - 60_000 });
      // A stated reset shorter than the 45-minute interval must win over a
      // probe's claimed interval.
      a.scriptResult({
        stop: {
          kind: "infra",
          cause: "quota",
          details: "Resets in 33m53s.",
        },
      });
      b.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "done on b" }));
        return fakeTurnResult(req);
      });

      const before = Date.now();
      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(result.outcome?.status).toBe("done");
      const resetAt = runtime.exhaustedPools.get("pool-a")!.resetAt;
      expect(resetAt).toBeGreaterThanOrEqual(before + 33 * 60_000);
      expect(resetAt).toBeLessThanOrEqual(Date.now() + 33 * 60_000);
      expect(poolExhausted(runtime.exhaustedPools, "pool-a")).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("pool latches and probes", () => {
  registerLatchAcrossGoals();
  registerTwoPoolIntervals();
  registerDuePoolProbe();
  registerProbeRelatch();
});
