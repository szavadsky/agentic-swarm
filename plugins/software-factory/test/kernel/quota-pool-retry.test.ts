import { describe, expect, it } from "bun:test";
import { runWithFallbacks } from "../../src/harness/fallback.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { Stop, TurnRequest, TurnResult } from "../../src/harness/types.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { loadPoolResets } from "../../src/kernel/quota-pools.js";
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

const RETRY_ALIASES: FlowRepoOptions["aliases"] = {
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

/**
 * A fake harness that runs its scripts through the real retry loop, so the
 * router's pool latch is read before every retry the way an adapter reads it.
 * Sleeps are recorded, not taken.
 */
class RetryingFakeHarness extends FakeHarness {
  readonly sleeps: number[] = [];

  override async turn(req: TurnRequest): Promise<TurnResult> {
    const { outcome, attempts } = await runWithFallbacks({
      primary: req.model,
      retry: { retries: 2, maxDelayMs: 8_000 },
      ...(req.pool ? { pool: req.pool } : {}),
      sleep: async (ms) => {
        this.sleeps.push(ms);
      },
      run: async (model) => {
        const result = await super.turn({ ...req, model });
        return { stop: result.stop, usage: result.usage, value: result };
      },
    });
    return { ...outcome.value, stop: outcome.stop, attempts };
  }
}

/** A repo, a due pool and the two harnesses the retry cases share. */
async function retryScope() {
  const { repo, goal } = setupFlowRepo({ aliases: RETRY_ALIASES });
  const a = new RetryingFakeHarness({ id: "a" });
  const b = new FakeHarness({ id: "b" });
  const runtime = await makeRuntime(repo, goal, { a, b });
  runtime.exhaustedPools.set("pool-a", { resetAt: Date.now() - 60_000 });
  b.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "served on the fallback pool" }));
    return fakeTurnResult(req);
  });
  return { repo, runtime, a, b };
}

type RetryScope = Awaited<ReturnType<typeof retryScope>>;

/** One turn on the due pool, through the retrying harness. */
async function retryTurn(scope: RetryScope) {
  const { repo, runtime } = scope;
  return runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: repo.dir,
    meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
}

/** Queues a first call that stops on `stop`, then a served call. */
function scriptProbeRetry(scope: RetryScope, stop: Stop): void {
  scope.a.scriptResult({ stop });
  scope.a.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "served on the recovered pool" }));
    return fakeTurnResult(req);
  });
}

function statedQuotaRetry(): void {
  it("sits out a stated quota wait inside the probe, retries once and clears the latch", async () => {
    const scope = await retryScope();
    try {
      scriptProbeRetry(scope, {
        kind: "infra",
        cause: "quota",
        details: "retry-after-ms=100",
      });
      const result = await retryTurn(scope);

      expect(result.outcome?.status).toBe("done");
      expect(result.record.model?.id).toBe("ma");
      expect(scope.a.calls).toHaveLength(2);
      expect(scope.a.sleeps).toEqual([100]);
      expect(scope.runtime.exhaustedPools.has("pool-a")).toBe(false);
      const stored = await loadPoolResets(scope.runtime.paths);
      expect(stored.has("pool-a")).toBe(false);
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
}

function transientBackoffRetry(): void {
  it("keeps the transient backoff inside the probe and clears the latch", async () => {
    const scope = await retryScope();
    try {
      scriptProbeRetry(scope, { kind: "infra", cause: "rate" });
      const result = await retryTurn(scope);

      expect(result.outcome?.status).toBe("done");
      expect(result.record.model?.id).toBe("ma");
      expect(scope.a.calls).toHaveLength(2);
      expect(scope.a.sleeps).toEqual([1_000]);
      expect(scope.runtime.exhaustedPools.has("pool-a")).toBe(false);
      const stored = await loadPoolResets(scope.runtime.paths);
      expect(stored.has("pool-a")).toBe(false);
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
}

function siblingLatchNoRetry(): void {
  it("makes no probe retry once another leg latches the pool mid-probe", async () => {
    const scope = await retryScope();
    try {
      const siblingReset = Date.now() + 30 * 60_000;
      scope.a.script((req) => {
        // A sibling leg's quota stop lands while this probe is on the wire.
        scope.runtime.exhaustedPools.set("pool-a", {
          resetAt: siblingReset,
        });
        return fakeTurnResult(req, {
          stop: {
            kind: "infra",
            cause: "quota",
            details: "retry-after-ms=100",
          },
        });
      });
      scope.a.script((req) => fakeTurnResult(req));
      const result = await retryTurn(scope);

      // The probe's quota stop is final: the turn lands on the other pool.
      expect(result.outcome?.status).toBe("done");
      expect(result.record.model?.id).toBe("mb");
      expect(scope.a.calls).toHaveLength(1);
      expect(scope.a.sleeps).toEqual([]);
      // The sibling's longer latch survives: the probe neither shortens nor
      // clears it.
      expect(scope.runtime.exhaustedPools.get("pool-a")!.resetAt).toBe(
        siblingReset,
      );
      const stored = await loadPoolResets(scope.runtime.paths);
      expect(stored.get("pool-a")!.resetAt).toBe(siblingReset);
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
}

describe("pool probe retries", () => {
  statedQuotaRetry();
  transientBackoffRetry();
  siblingLatchNoRetry();
});
