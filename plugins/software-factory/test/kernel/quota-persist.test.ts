import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import {
  DEFAULT_POOL_RESET_MINUTES,
  loadPoolResets,
  markPoolExhausted,
  poolExhausted,
  poolResetAt,
  quotaPoolsPath,
} from "../../src/kernel/quota-pools.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  simpleTask,
  writeTask as writeGoalTask,
  writePlan,
} from "./e2e-helpers.js";
import {
  cleanupFlowRepo,
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

const FIVE_HOURS_MS = 300 * 60_000;

// The recorded quota stops: a provider-stated reset in hours/minutes and the
// millisecond figure a 429 carries.
const RESET_IN_TEXT =
  "⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 129h55m29s.";
const RETRY_AFTER_TEXT =
  "429 Rate limit exceeded: free-models-per-day-high-balance. retry-after-ms=38240413";

describe("pool reset window", () => {
  const now = 1_000_000;

  it("takes the provider's stated reset in hours and minutes", () => {
    expect(poolResetAt({}, now, "Resets in 130h19m23s.")).toBe(
      now + (130 * 60 + 19) * 60_000,
    );
    expect(poolResetAt({}, now, "limit reached. Resets in 33m53s.")).toBe(
      now + 33 * 60_000,
    );
    expect(poolResetAt({}, now, RESET_IN_TEXT)).toBe(
      now + (129 * 60 + 55) * 60_000,
    );
  });

  it("takes a retry-after-ms header as the stated wait", () => {
    expect(poolResetAt({}, now, RETRY_AFTER_TEXT)).toBe(now + 38_240_413);
  });

  it("caps the stated reset at the run config's cap", () => {
    for (const text of [RESET_IN_TEXT, RETRY_AFTER_TEXT]) {
      expect(
        poolResetAt(
          { quota: { resetMinutes: 45, maxResetMinutes: 600 } },
          now,
          text,
        ),
      ).toBe(now + 600 * 60_000);
    }
  });

  it("falls back to the configured window when the text names no reset", () => {
    expect(poolResetAt({ quota: { resetMinutes: 45 } }, now)).toBe(
      now + 45 * 60_000,
    );
    expect(
      poolResetAt({ quota: { resetMinutes: 45 } }, now, "quota exceeded"),
    ).toBe(now + 45 * 60_000);
    expect(
      poolResetAt({ quota: { resetMinutes: 45 } }, now, "Resets in 0m"),
    ).toBe(now + 45 * 60_000);
    expect(
      poolResetAt({ quota: { resetMinutes: 45 } }, now, "retry-after-ms=0"),
    ).toBe(now + 45 * 60_000);
    expect(poolResetAt({}, now)).toBe(
      now + DEFAULT_POOL_RESET_MINUTES * 60_000,
    );
  });
});

describe("exhausted-pool persistence", () => {
  registerExhaustedPoolPersistencePart1();
  registerExhaustedPoolPersistencePart2();
  registerExhaustedPoolPersistencePart3();
});

function tempPoolPaths(): { sessionsDir: string; goalDir: string } {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "quota-pools-"));
  return { sessionsDir, goalDir: path.join(sessionsDir, "demo") };
}

describe("pool latch reset", () => {
  it("never shortens a stored reset", async () => {
    const paths = tempPoolPaths();
    try {
      const pools = new Map<string, number>();
      const now = Date.now();
      const long = now + 130 * 60 * 60_000;
      const short = now + 5 * 60 * 60_000;
      await markPoolExhausted({
        paths,
        pools,
        pool: "claude",
        resetAt: long,
      });
      await markPoolExhausted({
        paths,
        pools,
        pool: "claude",
        resetAt: short,
      });
      expect(pools.get("claude")).toBe(long);
      let stored = yaml.parse(fs.readFileSync(quotaPoolsPath(paths), "utf8"));
      expect(Date.parse(stored.pools.claude.resetAt)).toBe(long);

      const later = long + 60 * 60_000;
      await markPoolExhausted({
        paths,
        pools,
        pool: "claude",
        resetAt: later,
      });
      expect(pools.get("claude")).toBe(later);
      stored = yaml.parse(fs.readFileSync(quotaPoolsPath(paths), "utf8"));
      expect(Date.parse(stored.pools.claude.resetAt)).toBe(later);
    } finally {
      fs.rmSync(paths.sessionsDir, { recursive: true, force: true });
    }
  });
});

describe("pool latch visibility", () => {
  it("latches in memory before the store write, and both concurrent stops persist", async () => {
    const paths = tempPoolPaths();
    try {
      const pools = new Map<string, number>();
      const claude = Date.now() + 60_000;
      const go = Date.now() + 120_000;
      const first = markPoolExhausted({
        paths,
        pools,
        pool: "claude",
        resetAt: claude,
      });
      const second = markPoolExhausted({
        paths,
        pools,
        pool: "go",
        resetAt: go,
      });

      // A reader in another leg sees both latches before either write lands.
      expect(poolExhausted(pools, "claude")).toBe(true);
      expect(poolExhausted(pools, "go")).toBe(true);
      expect(fs.existsSync(quotaPoolsPath(paths))).toBe(false);

      await Promise.all([first, second]);
      const stored = yaml.parse(fs.readFileSync(quotaPoolsPath(paths), "utf8"));
      expect(Object.keys(stored.pools).sort()).toEqual(["claude", "go"]);
      expect(Date.parse(stored.pools.claude.resetAt)).toBe(claude);
      expect(Date.parse(stored.pools.go.resetAt)).toBe(go);
    } finally {
      fs.rmSync(paths.sessionsDir, { recursive: true, force: true });
    }
  });
});

async function skipsPoolRelaunchBeforeStoredResetPart1(
  goal: ReturnType<typeof makeGoal>,
  paths: ReturnType<typeof resolveGoalPaths>,
) {
  const first = new FakeHarness({ id: "fake" });
  first.script((req, ctx) => {
    writePlan(
      goal.goalDir,
      "# Milestone 1\n\n## alpha\nCreate alpha.txt.\nDone when: alpha.txt exists.\n",
    );
    ctx.writeOutcome(
      outcome({ summary: "planned alpha", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    writeGoalTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
    ctx.writeOutcome(outcome({ summary: "filed alpha" }));
    return fakeTurnResult(req);
  });
  first.scriptResult({
    stop: {
      kind: "infra",
      cause: "quota",
      details: RETRY_AFTER_TEXT,
    },
  });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha on the fallback tier" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha approved", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  const before = Date.now();
  await expectLaunch(3, goal.repo, first);

  // Launch 1 stored the provider's stated 38,240,413 ms, not the configured
  // 45-minute fallback.
  const stored = yaml.parse(fs.readFileSync(quotaPoolsPath(paths), "utf8"));
  const resetAt = Date.parse(stored.pools["fake+fake-impl"].resetAt);
  expect(resetAt).toBeGreaterThanOrEqual(before + 38_240_413);
  expect(resetAt).toBeLessThanOrEqual(Date.now() + 38_240_413);

  // Launch 2: a fresh process would read the session store; a fresh runtime does the same.
  const second = new FakeHarness({ id: "fake" });

  return { second };
}

async function skipsPoolRelaunchBeforeStoredResetPart2(
  goal: ReturnType<typeof makeGoal>,
  scope: Awaited<ReturnType<typeof skipsPoolRelaunchBeforeStoredResetPart1>>,
) {
  const { second } = scope;
  second.script((req, ctx) => {
    writePlan(
      goal.goalDir,
      "# Milestone 1\n\n## alpha\nCreate alpha.txt.\n\n## beta\nCreate beta.txt.\n",
    );
    ctx.writeOutcome(
      outcome({ summary: "plan carries both tasks", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    writeGoalTask(goal.goalDir, simpleTask("beta", "beta.txt"));
    ctx.writeOutcome(outcome({ summary: "filed beta" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    expect(req.model.id).toBe("fake-impl-2");
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta on the recovered tier" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  await expectLaunch(3, goal.repo, second);

  expect(second.calls.filter((call) => call.model.id === "fake-impl")).toEqual(
    [],
  );
  expect(
    second.calls.filter((call) => call.model.id === "fake-impl-2"),
  ).toHaveLength(1);
}

async function skipsPoolRelaunchBeforeStoredResetPart3(
  paths: ReturnType<typeof resolveGoalPaths>,
) {
  fs.writeFileSync(
    quotaPoolsPath(paths),
    yaml.stringify({
      pools: {
        "fake+fake-impl": {
          resetAt: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    }),
    "utf8",
  );
  const reloaded = await loadPoolResets(paths);
  expect(reloaded.has("fake+fake-impl")).toBe(false);
}

function registerExhaustedPoolPersistencePart1(): void {
  it("stores a quota stop with its reset time in the session store", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        architect: { harness: "a", model: "ma-arch" },
        pm: { harness: "a", model: "ma-pm" },
        reviewer: { harness: "b", model: "mb-review" },
        steward: { harness: "a", model: "ma-steward" },
        implementer: {
          harness: "a",
          model: "ma",
          fallbacks: [{ harness: "b", model: "mb" }],
        },
      },
    });
    try {
      const a = new FakeHarness({ id: "a" });
      const b = new FakeHarness({ id: "b" });
      const runtime = await makeRuntime(repo, goal, { a, b });
      const before = Date.now();
      a.scriptResult({ stop: { kind: "infra", cause: "quota" } });
      b.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "done on b" }));
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      const after = Date.now();

      expect(result.outcome?.status).toBe("done");
      expect(poolExhausted(runtime.exhaustedPools, "a+ma")).toBe(true);

      // The file sits beside the launch directories in the goal's session store.
      const file = quotaPoolsPath(runtime.paths);
      expect(path.relative(runtime.paths.sessionsDir, file)).toBe(
        path.join(goal, "quota-pools.yaml"),
      );
      const stored = yaml.parse(fs.readFileSync(file, "utf8"));
      expect(Object.keys(stored.pools)).toEqual(["a+ma"]);
      // No `quota` in the run config: the 300-minute default applies.
      const resetAt = Date.parse(stored.pools["a+ma"].resetAt);
      expect(resetAt).toBeGreaterThanOrEqual(before + FIVE_HOURS_MS);
      expect(resetAt).toBeLessThanOrEqual(after + FIVE_HOURS_MS);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registerExhaustedPoolPersistencePart2(): void {
  it("drops a stored reset that already passed and refuses a corrupt file", async () => {
    const { repo, goal } = setupFlowRepo();
    const paths = resolveGoalPaths(loadConfigs(repo.dir), repo.dir, goal);
    try {
      const file = quotaPoolsPath(paths);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const now = Date.now();
      fs.writeFileSync(
        file,
        yaml.stringify({
          pools: {
            past: { resetAt: new Date(now - 60_000).toISOString() },
            future: { resetAt: new Date(now + 60_000).toISOString() },
          },
        }),
        "utf8",
      );

      const resets = await loadPoolResets(paths);
      expect([...resets.keys()]).toEqual(["future"]);

      fs.writeFileSync(file, "pools: [\n", "utf8");
      await expect(loadPoolResets(paths)).rejects.toThrow(/not valid YAML/);

      fs.writeFileSync(file, "pools:\n  claude: {}\n", "utf8");
      await expect(loadPoolResets(paths)).rejects.toThrow(/is invalid/);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registerExhaustedPoolPersistencePart3(): void {
  it("skips the pool on a relaunch before its stored reset, then uses it again", async () => {
    const goal = makeGoal({
      runYaml: [
        "aliases:",
        "  architect: { harness: fake, model: fake-architect }",
        "  pm: { harness: fake, model: fake-pm }",
        "  digest: { harness: fake, model: fake-digest }",
        "  implementer: { harness: fake, model: fake-impl, fallbacks: [{ model: fake-impl-2 }] }",
        "  implementer-b: { harness: fake, model: fake-impl-b }",
        "  researcher: { harness: fake, model: fake-research }",
        "  reviewer: { harness: fake, model: fake-review }",
        "  qa: { harness: fake, model: fake-qa }",
        "  steward: { harness: fake, model: fake-steward }",
        "  plan-checker: { harness: fake, model: fake-check }",
        "  intent: { harness: fake, model: fake-intent }",
        "  plan-reviewer: { harness: fake, model: fake-plan-review }",
        "  pack-preparer: { harness: fake, model: fake-pack-prep }",
        "limits: { iterations: 1, concurrency: { overall: 1 } }",
        "quota: { resetMinutes: 45 }",
        "",
      ].join("\n"),
    });
    const paths = resolveGoalPaths(
      loadConfigs(goal.repo.dir),
      goal.repo.dir,
      "demo",
    );
    try {
      const scope1 = await skipsPoolRelaunchBeforeStoredResetPart1(goal, paths);
      await skipsPoolRelaunchBeforeStoredResetPart2(goal, scope1);
      await skipsPoolRelaunchBeforeStoredResetPart3(paths);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}
