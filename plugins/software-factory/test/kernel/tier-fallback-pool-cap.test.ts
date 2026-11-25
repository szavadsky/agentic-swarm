import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  twoPartyBarrier,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const BASE_ALIASES = {
  architect: { harness: "a", model: "ma-arch" },
  pm: { harness: "a", model: "ma-pm" },
  reviewer: { harness: "b", model: "mb-review" },
  steward: { harness: "a", model: "ma-steward" },
};

const POOL_FALLBACK_IMPLEMENTER = {
  harness: "a",
  model: "ma",
  subscription: "pool-a",
  fallbacks: [{ harness: "b", model: "mb", subscription: "pool-b" }],
};

const approveTurn: FakeTurnHandler = (req, ctx) => {
  ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
  return fakeTurnResult(req);
};

function scriptFallbackTiers(
  harness: FakeHarness,
  implement: FakeTurnHandler,
): void {
  harness.script(implement, {
    when: whenTurn({ step: "implement" }),
    fallback: true,
  });
  harness.script(approveTurn, {
    when: whenTurn({ step: "review" }),
    fallback: true,
  });
}

function implementAfterBarrier(barrier: () => Promise<void>): FakeTurnHandler {
  return async (req, ctx) => {
    await barrier();
    fs.writeFileSync(
      path.join(req.cwd!, `${path.basename(req.cwd!)}.txt`),
      "done\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "implemented" }));
    return fakeTurnResult(req);
  };
}

function implementModelIds(
  calls: Parameters<FakeHarness["turn"]>[0][],
): string[] {
  return calls
    .filter((call) => fakeTurnIdentity(call).step === "implement")
    .map((call) => call.model.id)
    .sort();
}

function poolCappedRepo() {
  return setupFlowRepo({
    limits: {
      concurrency: {
        overall: 2,
        perSubscription: { "pool-a": 1, "pool-b": 1 },
      },
    },
    aliases: { ...BASE_ALIASES, implementer: POOL_FALLBACK_IMPLEMENTER },
  });
}

async function twoTasksOnBothPools(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
): Promise<{ runtime: KernelRuntime; a: FakeHarness; b: FakeHarness }> {
  const a = new FakeHarness({ id: "a" });
  const b = new FakeHarness({ id: "b" });
  // Both implement turns wait for the peer: a task that waits on the primary's
  // full pool never arrives and the barrier times out.
  const implement = implementAfterBarrier(twoPartyBarrier(2_000));
  scriptFallbackTiers(a, implement);
  scriptFallbackTiers(b, implement);
  const runtime = await makeRuntime(repo, goal, { a, b });
  await writeTask(runtime, task("alpha", { scope: ["alpha-area"] }));
  await writeTask(runtime, task("beta", { scope: ["beta-area"] }));
  return { runtime, a, b };
}

async function runOnIdlePoolFallback(): Promise<void> {
  const { repo, goal } = poolCappedRepo();
  try {
    const { runtime, a, b } = await twoTasksOnBothPools(repo, goal);

    const result = await runDispatch(runtime, { iteration: 1 });

    expect(result.reason).toBe("boundary");
    expect(implementModelIds([...a.calls, ...b.calls])).toEqual(["ma", "mb"]);
    const state = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    expect(state.tasks.alpha!.status).toBe("merged");
    expect(state.tasks.beta!.status).toBe("merged");
  } finally {
    cleanupFlowRepo(repo);
  }
}

interface HeldPools {
  implement: FakeTurnHandler;
  bothHeld: () => Promise<void>;
  release: () => void;
  ranWhileBothHeld: () => boolean;
}

/** Alpha and beta hold the two capped pools until the test releases them. */
function heldPools(): HeldPools {
  let holding = 0;
  let ranWhileBothHeld = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const implement: FakeTurnHandler = async (req, ctx) => {
    const slug = path.basename(req.cwd!);
    if (slug === "gamma") {
      // Both capped tiers are still occupied: no admission may start it.
      if (holding >= 2) ranWhileBothHeld = true;
    } else {
      holding += 1;
      await gate;
      holding -= 1;
    }
    fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), "done\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "implemented" }));
    return fakeTurnResult(req);
  };
  return {
    implement,
    bothHeld: async () => {
      const deadline = Date.now() + 10_000;
      while (holding < 2) {
        if (Date.now() > deadline) {
          throw new Error("alpha and beta never occupied both capped pools");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    release: () => release(),
    ranWhileBothHeld: () => ranWhileBothHeld,
  };
}

async function gammaStartedAfterAPoolFreed(
  runtime: KernelRuntime,
): Promise<boolean> {
  const records = await runtime.store.listRecords();
  const gamma = records.find(
    (record) => record.slug === "gamma" && record.step === "implement",
  );
  const firstEnd = Math.min(
    ...records
      .filter(
        (record) =>
          (record.slug === "alpha" || record.slug === "beta") &&
          record.step === "implement",
      )
      .map((record) => Date.parse(record.endedAt!)),
  );
  return gamma !== undefined && Date.parse(gamma.startedAt) >= firstEnd;
}

async function waitsWhileEveryPoolIsCapped(): Promise<void> {
  const { repo, goal } = setupFlowRepo({
    limits: {
      concurrency: {
        overall: 3,
        perSubscription: { "pool-a": 1, "pool-b": 1 },
      },
    },
    aliases: { ...BASE_ALIASES, implementer: POOL_FALLBACK_IMPLEMENTER },
  });
  try {
    const a = new FakeHarness({ id: "a" });
    const b = new FakeHarness({ id: "b" });
    const held = heldPools();
    scriptFallbackTiers(a, held.implement);
    scriptFallbackTiers(b, held.implement);
    const runtime = await makeRuntime(repo, goal, { a, b });
    for (const slug of ["alpha", "beta", "gamma"]) {
      await writeTask(runtime, task(slug, { scope: [`${slug}-area`] }));
    }

    const dispatch = runDispatch(runtime, { iteration: 1 });
    await held.bothHeld();
    // Give the dispatch loop time to try gamma while both pools are full.
    await new Promise((resolve) => setTimeout(resolve, 500));
    held.release();
    const result = await dispatch;

    expect(result.reason).toBe("boundary");
    expect(held.ranWhileBothHeld()).toBe(false);
    expect(await gammaStartedAfterAPoolFreed(runtime)).toBe(true);
  } finally {
    cleanupFlowRepo(repo);
  }
}

describe("pool-cap fallback tiers", () => {
  it(
    "starts a task on an idle fallback pool when the primary pool is at its concurrency cap",
    runOnIdlePoolFallback,
    60_000,
  );

  it(
    "waits while every pool in the chain is at its concurrency cap",
    waitsWhileEveryPoolIsCapped,
    60_000,
  );
});
