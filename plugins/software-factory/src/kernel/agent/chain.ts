/** Pack measurement, fallback chains and opaque-turn delivery. */

import { portable } from "../../harness/types.js";
import type {
  ServedUsage,
  SessionRef,
  Stop,
  TurnResult,
  Usage,
} from "../../harness/types.js";
import { addUsage, reportsUsage, zeroUsage } from "../../harness/usage.js";
import { tierPoolKey } from "../flow-context.js";
import { markPoolExhausted, poolResetAt } from "../quota-pools.js";
import type { KernelRuntime } from "../types.js";
import type { AgentTurnSpec, ChainResult, ChainState, Tier } from "./types.js";

/**
 * Bound on the detector's one settle re-read of the outcome path: a tool
 * call's write can land just after the harness returns. A turn that wrote
 * nothing waits this once, never once per repair round.
 */
export const OUTCOME_SETTLE_MS = 500;

/** Boundary steps that run on the iteration's pack; only they measure it. */
const PACK_STEPS = new Set(["architect", "pm", "subarchitect"]);

/**
 * The pack is the boundary consult's shared context: the architect reads it,
 * the PM derives tasks from the plan it produced in the same iteration. The
 * measurement is the rendered artifact's byte size.
 */
export async function measurePack(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
): Promise<{ bytes: number } | undefined> {
  if (!PACK_STEPS.has(spec.meta.step)) return undefined;
  const pack = await runtime.store.iterations.read(
    spec.meta.iteration,
    "context-pack.md",
  );
  if (pack === null) return undefined;
  return {
    bytes: Buffer.byteLength(pack, "utf8"),
  };
}

/** Overflow is the one infra stop a fresh session with the same prompt can cure. */
export function overflowed(stop: Stop): boolean {
  return stop.kind === "infra" && stop.cause === "overflow";
}

/**
 * The product each turn must deliver, named in the repair ask and the failure
 * cause. A step's process config owns the wording; a turn that names none
 * delivers its expectation's product.
 */
export function deliverableOf(spec: AgentTurnSpec): string {
  return (
    spec.target.deliverable ??
    (spec.expectation === "review"
      ? "verdict"
      : spec.expectation === "qa"
        ? "qa verdict"
        : "outcome")
  );
}

export function missingOutcomeFinding(
  deliverable: string,
  afterRepair: boolean,
): string {
  const base = afterRepair
    ? "no outcome after repair"
    : "no outcome written to the outcome path and no fenced YAML block in the final message";
  return deliverable === "outcome"
    ? base
    : `${base} (missing deliverable: ${deliverable})`;
}

/**
 * One agent step: outcome path in the prompt (LOG D6), file first, fenced-block
 * fallback, up to `reminders` same-session repair turns, then an invalid
 * outcome is `failed`. The end record is written only after `settle`
 * (mechanical commit), so a crash leaves an orphan that `derive` redispatches.
 */
async function turnWithTimeout(
  harness: import("../../harness/types.js").Harness,
  request: import("../../harness/types.js").TurnRequest,
): Promise<import("../../harness/types.js").TurnResult> {
  const wallMs = request.timeouts.wallMs;
  // The kernel owns the wall bound: when it fires, the harness child is
  // aborted so it cannot write past the bound, and the race resolves with the
  // synthesized timeout. A turn that resolves first is never aborted.
  const controller = new AbortController();
  const req = { ...request, signal: controller.signal };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult: import("../../harness/types.js").TurnResult = {
    stop: {
      kind: "infra",
      cause: "timeout",
      details: `wall clock ${wallMs}ms exceeded`,
    },
    text: "",
    usage: {
      in: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      out: 0,
      reasoningOut: 0,
    },
    session: request.session,
    model: request.model,
    attempts: [],
  };
  const timeoutPromise = new Promise<
    import("../../harness/types.js").TurnResult
  >((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(timeoutResult);
    }, wallMs);
  });
  try {
    return await Promise.race([harness.turn(req), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The tier's opaque options plus this turn's own. Objects merge, so a steered
 * architect's agent definitions ride along with an acpx tier's config instead
 * of replacing it; a non-object on either side wins over the merge.
 */
function turnOpaque(tier: unknown, turn: unknown): unknown {
  if (turn === undefined) return tier;
  if (
    tier !== null &&
    turn !== null &&
    typeof tier === "object" &&
    typeof turn === "object" &&
    !Array.isArray(tier) &&
    !Array.isArray(turn)
  ) {
    return { ...tier, ...turn };
  }
  return turn;
}

/** Union per-model splits across calls, summing a model that served twice. */
export function mergeServed(
  total: readonly ServedUsage[],
  next: readonly ServedUsage[],
): ServedUsage[] {
  const byModel = new Map<string, Usage>();
  for (const entry of [...total, ...next]) {
    byModel.set(
      entry.model.id,
      addUsage(byModel.get(entry.model.id) ?? zeroUsage(), entry.usage),
    );
  }
  return [...byModel].map(([id, usage]) => ({ model: { id }, usage }));
}

/** One tier runs one harness call; a session crosses only when portable. */
async function runChainTier(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
  tier: Tier,
  ask: string,
  current: SessionRef | undefined,
  outcomePath: string,
  timeouts: { idleMs: number; wallMs: number },
): Promise<TurnResult> {
  return turnWithTimeout(tier.harness, {
    model: tier.model,
    ...(tier.effort ? { effort: tier.effort } : {}),
    cwd: spec.cwd,
    prompt: ask,
    ...(current &&
    portable(current.harness, tier.harness.id, runtime.configs.run.portability)
      ? { session: current }
      : {}),
    outcomePath,
    timeouts,
    opaque: turnOpaque(tier.opaque, spec.opaque),
    ...(spec.onLive ? { onLive: spec.onLive } : {}),
  });
}

function absorbChainCall(
  state: ChainState,
  result: TurnResult,
  harnessId: string,
): void {
  for (const attempt of result.attempts ?? []) {
    state.attempts.push({ ...attempt, harness: harnessId });
  }
  state.usage = state.usage
    ? addUsage(state.usage, result.usage)
    : result.usage;
  if (result.served && (result.attempts?.length ?? 0) <= 1) {
    state.served.push(...result.served);
  } else if (result.served || reportsUsage(result.usage)) {
    // A split covers one call's usage; with retried calls in the same harness
    // turn their usage is outside it, so the aggregate stays. A call that
    // measured tokens without a split makes the launch unsplittable.
    state.servedOpen = false;
  }
}

/** A quota stop records its pool in the launch's exhausted set. */
async function markTierQuota(
  runtime: KernelRuntime,
  tier: Tier,
  result: TurnResult,
): Promise<void> {
  if (result.stop.kind !== "infra" || result.stop.cause !== "quota") return;
  await markPoolExhausted({
    paths: runtime.paths,
    pools: runtime.exhaustedPools,
    pool: tierPoolKey(tier),
    resetAt: poolResetAt(runtime.configs.run, Date.now(), result.stop.details),
  });
}

/**
 * Walks the alias's tiers from `fromIndex`: one harness call per tier, each
 * with its own model, effort and opaque config, advancing on infrastructure
 * stops the tier's own retries could not cure. Every attempt is stamped with
 * the harness that ran it.
 */
export async function callChain(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
  outcomePath: string,
  timeouts: { idleMs: number; wallMs: number },
  fromIndex: number,
  ask: string,
  chainSession: SessionRef | undefined,
): Promise<ChainResult> {
  let index = fromIndex;
  let current = chainSession;
  const state: ChainState = {
    attempts: [],
    served: [],
    servedOpen: true,
    usage: undefined,
  };
  let result: TurnResult | undefined;
  for (;;) {
    const tier = spec.target.tiers[index]!;
    result = await runChainTier(
      runtime,
      spec,
      tier,
      ask,
      current,
      outcomePath,
      timeouts,
    );
    absorbChainCall(state, result, tier.harness.id);
    current = result.session;
    await markTierQuota(runtime, tier, result);
    if (result.stop.kind !== "infra" || index + 1 >= spec.target.tiers.length) {
      break;
    }
    index += 1;
  }
  return {
    result: result!,
    endIndex: index,
    attempts: state.attempts,
    usage: state.usage!,
    ...(state.servedOpen && state.served.length > 0
      ? { served: state.served }
      : {}),
  };
}

const HALTING_STOPS: ReadonlySet<Stop["kind"]> = new Set([
  "infra",
  "refusal",
  "cancelled",
]);

/** A stop that ends the turn before delivery: no reminder may run after it. */
export function isHalted(stop: Stop): boolean {
  return HALTING_STOPS.has(stop.kind);
}
