import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { resolveTurn, tierPoolKey } from "../../src/kernel/flow-context.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const implementerVars = {
  task_path: "/g/tasks/a.md",
  report_path: "",
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  base_gates: "not recorded",
  findings: "",
};

const BASE_ALIASES = {
  architect: { harness: "a", model: "ma-arch" },
  pm: { harness: "a", model: "ma-pm" },
  reviewer: { harness: "b", model: "mb-review" },
  steward: { harness: "a", model: "ma-steward" },
};

type AliasSpec = NonNullable<FlowRepoOptions["aliases"]>[string];

async function tierRuntime(
  implementer: AliasSpec,
  extraAliases: Record<string, AliasSpec> = {},
): Promise<{
  repo: TmpRepo;
  runtime: KernelRuntime;
  a: FakeHarness;
  b: FakeHarness;
}> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 2 } },
    aliases: { ...BASE_ALIASES, ...extraAliases, implementer },
  });
  const a = new FakeHarness({ id: "a" });
  const b = new FakeHarness({ id: "b" });
  const runtime = await makeRuntime(repo, goal, { a, b });
  return { repo, runtime, a, b };
}

function quota() {
  return { stop: { kind: "infra", cause: "quota" } as const };
}

/** Latch a pool as if it answered quota a moment ago. */
function latchPool(runtime: KernelRuntime, pool: string): void {
  runtime.exhaustedPools.set(pool, Date.now() + 60_000);
}

async function skipsExhaustedPoolRestDispatchPart1(
  repo: TmpRepo,
  goal: string,
) {
  const a = new FakeHarness({ id: "a" });
  const b = new FakeHarness({ id: "b" });
  a.script((req) => fakeTurnResult(req, quota()), {
    when: whenTurn({ step: "implement" }),
  });
  for (let i = 0; i < 2; i += 1) {
    b.script(
      (req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, `${path.basename(req.cwd!)}.txt`),
          "done\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "implement" }) },
    );
    b.script(
      (req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "review" }) },
    );
  }
  const runtime = await makeRuntime(repo, goal, { a, b });
  await writeTask(runtime, task("alpha", { scope: ["alpha-area"] }));
  await writeTask(runtime, task("beta", { scope: ["beta-area"] }));

  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");

  // Alpha's implement fell back to b; beta's started there. QA shares the
  // reviewer's binding, so it ran on b for both tasks too.
  expect(a.calls).toHaveLength(1);
  expect(b.calls).toHaveLength(6);

  return { runtime };
}

async function skipsExhaustedPoolRestDispatchPart2(
  scope: Awaited<ReturnType<typeof skipsExhaustedPoolRestDispatchPart1>>,
) {
  const { runtime } = scope;
  expect(resolveTurn(runtime, "implementer", "implementer").harness.id).toBe(
    "b",
  );
}

function registerAliasFallbackTiersPart9(): void {
  it("marks an alias with every tier exhausted unavailable instead of retrying the last tier", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      t.a.scriptResult(quota());
      t.b.scriptResult(quota());

      const spec = {
        target: resolveTurn(t.runtime, "implementer", "implementer"),
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any" as const,
      };
      const first = await runAgentTurn(t.runtime, spec);
      expect(first.record.stop).toEqual({ kind: "infra", cause: "quota" });
      expect(t.runtime.exhaustedPools.has("a+ma")).toBe(true);
      expect(t.runtime.exhaustedPools.has("b+mb")).toBe(true);

      // Every tier is exhausted: the target names the dead pools and carries
      // no tier to call, instead of selecting the last dead one again.
      const target = resolveTurn(t.runtime, "implementer", "implementer");
      expect(target.tiers).toEqual([]);
      expect(target.tierOffset).toBe(2);
      expect(target.unavailable).toContain(
        'alias "implementer" has no live tier',
      );
      expect(target.unavailable).toContain("a+ma resets at");
      expect(target.unavailable).toContain("b+mb resets at");

      const second = await runAgentTurn(t.runtime, { ...spec, target });
      expect(second.record.stop).toEqual({
        kind: "infra",
        cause: "unavailable",
        details: target.unavailable,
      });
      // No harness was called on either tier for the unavailable turn.
      expect(t.a.calls).toHaveLength(1);
      expect(t.b.calls).toHaveLength(1);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerAliasFallbackTiersPart10(): void {
  it("defers a task whose alias has no live tier and names the cause", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const fake = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake });
      const resetAt = Date.now() + 60 * 60_000;
      runtime.exhaustedPools.set("fake+fake-impl", resetAt);
      await writeTask(runtime, task("alpha", { scope: ["alpha-area"] }));

      const result = await runDispatch(runtime, { iteration: 1 });

      expect(result.reason).toBe("infra");
      expect(result.taskTurnsStarted).toBe(0);
      expect(causeText(result.cause)).toContain("alpha:");
      expect(causeText(result.cause)).toContain(
        'alias "implementer" has no live tier',
      );
      expect(causeText(result.cause)).toContain(
        `fake+fake-impl resets at ${new Date(resetAt).toISOString()}`,
      );
      expect(fake.calls).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registerAliasFallbackTiersPart11(): void {
  it("skips the exhausted pool for the rest of the dispatch", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      aliases: {
        ...BASE_ALIASES,
        implementer: {
          harness: "a",
          model: "ma",
          fallbacks: [{ harness: "b", model: "mb" }],
        },
      },
    });
    try {
      const scope1 = await skipsExhaustedPoolRestDispatchPart1(repo, goal);
      await skipsExhaustedPoolRestDispatchPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAliasFallbackTiersPart12(): void {
  it("expands a fallback that names another alias and keeps its pools and effort", async () => {
    const t = await tierRuntime(
      {
        harness: "a",
        model: "ma",
        subscription: "outer",
        fallbacks: [{ alias: "backup" }],
      },
      {
        backup: {
          harness: "b",
          model: "mb",
          effort: "high",
          subscription: "inner",
          fallbacks: [{ model: "mb2", sharesPool: true }],
        },
      },
    );
    try {
      const target = resolveTurn(t.runtime, "implementer", "implementer");
      expect(
        target.tiers.map((tier) => [
          tier.harness.id,
          tier.model.id,
          tier.effort,
          tier.subscription,
        ]),
      ).toEqual([
        ["a", "ma", undefined, "outer"],
        ["b", "mb", "high", "inner"],
        ["b", "mb2", "high", "inner"],
      ]);

      // One pool covers the named alias's whole ladder: both its tiers drop.
      latchPool(t.runtime, "inner");
      const withoutInner = resolveTurn(t.runtime, "implementer", "implementer");
      expect(withoutInner.harness.id).toBe("a");
      expect(withoutInner.tiers.map((tier) => tier.model.id)).toEqual(["ma"]);

      latchPool(t.runtime, "outer");
      const withoutPools = resolveTurn(t.runtime, "implementer", "implementer");
      expect(withoutPools.tiers).toEqual([]);
      expect(withoutPools.tierOffset).toBe(3);
      expect(withoutPools.unavailable).toContain('alias "implementer"');
      expect(withoutPools.unavailable).toContain("outer resets at");
      expect(withoutPools.unavailable).toContain("inner resets at");
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerAliasFallbackTiersPart13(): void {
  it("runs a named alias's ladder and exhausts only the pool that answered quota", async () => {
    const t = await tierRuntime(
      {
        harness: "a",
        model: "ma",
        subscription: "outer",
        fallbacks: [{ alias: "backup" }],
      },
      { backup: { harness: "b", model: "mb", subscription: "inner" } },
    );
    try {
      t.a.scriptResult(quota());
      t.b.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "done on backup" }));
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(t.runtime, {
        target: resolveTurn(t.runtime, "implementer", "implementer"),
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(
        result.record.attempts?.map((attempt) => [
          attempt.harness,
          attempt.model.id,
          attempt.stop.kind,
        ]),
      ).toEqual([
        ["a", "ma", "infra"],
        ["b", "mb", "done"],
      ]);
      // Quota latches the tier's own subscription, not the alias naming it.
      expect(t.runtime.exhaustedPools.has("outer")).toBe(true);
      expect(t.runtime.exhaustedPools.has("inner")).toBe(false);
      expect(
        resolveTurn(t.runtime, "implementer", "implementer").harness.id,
      ).toBe("b");
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerAliasFallbackTiersPart14(): void {
  it("keys a changed fallback by harness+model unless it declares its pool or sharing", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      subscription: "claude",
      fallbacks: [
        { harness: "b", model: "mb" },
        { harness: "b", model: "mb-own", subscription: "go" },
        { harness: "b", model: "mb-shared", sharesPool: true },
        { model: "ma", effort: "high" },
      ],
    });
    try {
      const target = resolveTurn(t.runtime, "implementer", "implementer");
      // The unchanged tier keeps the Claude pool; a changed tier with neither
      // declaration is keyed harness+model, never the alias's subscription.
      expect(target.tiers.map(tierPoolKey)).toEqual([
        "claude",
        "b+mb",
        "go",
        "claude",
        "claude",
      ]);
      expect(target.tiers[1]!.subscription).toBeUndefined();
      expect(target.tiers[2]!.subscription).toBe("go");
      expect(target.tiers[3]!.subscription).toBe("claude");
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerAliasFallbackTiersPart15(): void {
  it("latches a changed fallback on its own key, not the alias pool", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      subscription: "claude",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      // The primary's pool is dead: the fallback is the only live tier and must
      // not be dropped with the Claude pool it no longer draws on.
      latchPool(t.runtime, "claude");
      const target = resolveTurn(t.runtime, "implementer", "implementer");
      expect(target.tiers.map((tier) => tier.model.id)).toEqual(["mb"]);
      expect(target.subscription).toBeUndefined();

      t.b.scriptResult(quota());
      const result = await runAgentTurn(t.runtime, {
        target,
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(result.record.stop).toEqual({ kind: "infra", cause: "quota" });
      expect(t.a.calls).toHaveLength(0);
      expect(t.runtime.exhaustedPools.has("b+mb")).toBe(true);

      const after = resolveTurn(t.runtime, "implementer", "implementer");
      expect(after.tiers).toEqual([]);
      expect(after.unavailable).toContain("claude resets at");
      expect(after.unavailable).toContain("b+mb resets at");
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerAliasFallbackTiersPart17(): void {
  it("makes no call when every tier's pool latches after the target was resolved", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      subscription: "claude",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      const target = resolveTurn(t.runtime, "implementer", "implementer");
      expect(target.tiers).toHaveLength(2);
      // Another leg latches both pools between resolution and the first call.
      latchPool(t.runtime, "claude");
      latchPool(t.runtime, "b+mb");

      const result = await runAgentTurn(t.runtime, {
        target,
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      const stop = result.record.stop;
      if (stop === undefined) throw new Error("expected a stop");
      expect(stop.kind).toBe("infra");
      if (stop.kind !== "infra") throw new Error("expected an infra stop");
      expect(stop.cause).toBe("unavailable");
      expect(stop.details).toContain('alias "implementer" has no live tier');
      expect(stop.details).toContain("claude resets at");
      expect(stop.details).toContain("b+mb resets at");
      expect(t.a.calls).toHaveLength(0);
      expect(t.b.calls).toHaveLength(0);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

describe("alias fallback tiers", () => {
  registerAliasFallbackTiersPart9();

  registerAliasFallbackTiersPart10();

  registerAliasFallbackTiersPart11();

  registerAliasFallbackTiersPart12();

  registerAliasFallbackTiersPart13();

  registerAliasFallbackTiersPart14();

  registerAliasFallbackTiersPart15();

  registerAliasFallbackTiersPart17();
});
