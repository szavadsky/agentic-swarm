/** Pack measurement, fallback chains and opaque-turn delivery. */

import { git } from "../../core/git/exec.js";
import type {
  PoolLatch,
  ServedUsage,
  SessionRef,
  Stop,
  TurnResult,
  Usage,
} from "../../harness/types.js";
import { portable } from "../../harness/types.js";
import { addUsage, zeroUsage } from "../../harness/usage.js";
import { resumeNote, tierPoolKey } from "../flow-context.js";
import {
  latchPool,
  markPoolExhausted,
  type PoolCall,
  type PoolReset,
  poolExhausted,
  poolResetAt,
  settlePoolProbe,
  takePoolCall,
  writePoolResets,
} from "../quota-pools.js";
import { semaphoresFor, turnSemaphoreNames } from "../semaphores.js";
import type { KernelRuntime } from "../types.js";
import { absorbChainCall, chainOutcome } from "./chain-result.js";
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

/** The stop the kernel reports when the turn's wall bound fires. */
export function wallTimeoutStop(wallMs: number): Stop {
  return {
    kind: "infra",
    cause: "timeout",
    details: `wall clock ${wallMs}ms exceeded`,
  };
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
    stop: wallTimeoutStop(wallMs),
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

/**
 * The tier's quota pool, read before every retry, fallback and tier call.
 * `dead()` latches in memory at once; the store write follows in
 * `markTierQuota`, so another leg's reader sees the decision first.
 *
 * A probe reports its own claim live: it is the call that finds out whether
 * the pool recovered, so the harness may still sit out a stated quota wait or
 * a transient backoff inside it. Any other latch — another leg's, or the
 * probe's own `dead()` replacement — reads dead.
 */
function tierPool(
  runtime: KernelRuntime,
  tier: Tier,
  call: PoolCall,
): PoolLatch {
  const pool = tierPoolKey(tier);
  const claim = call.kind === "probe" ? call.claim : undefined;
  return {
    live: () =>
      claim === undefined
        ? !poolExhausted(runtime.exhaustedPools, pool)
        : runtime.exhaustedPools.get(pool) === claim,
    dead: (stop) =>
      latchPool(
        runtime.exhaustedPools,
        pool,
        poolResetAt(
          runtime.configs.run,
          Date.now(),
          stop.kind === "infra" ? stop.details : undefined,
          pool,
        ),
      ),
  };
}

/** One tier runs one harness call; a session crosses only when portable. */
async function runChainTier(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
  tier: Tier,
  call: PoolCall,
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
    pool: tierPool(runtime, tier, call),
    ...(spec.onLive ? { onLive: spec.onLive } : {}),
  });
}

/** A quota stop records its pool in the launch's exhausted set. */
async function markTierQuota(
  runtime: KernelRuntime,
  tier: Tier,
  result: TurnResult,
): Promise<void> {
  if (result.stop.kind !== "infra" || result.stop.cause !== "quota") return;
  const pool = tierPoolKey(tier);
  await markPoolExhausted({
    paths: runtime.paths,
    pools: runtime.exhaustedPools,
    pool,
    resetAt: poolResetAt(
      runtime.configs.run,
      Date.now(),
      result.stop.details,
      pool,
    ),
  });
}

/** The worktree's HEAD and porcelain status before the first tier call. */
interface WorktreeState {
  head: string;
  status: string;
}

async function worktreeState(cwd: string): Promise<WorktreeState | undefined> {
  const [head, status] = await Promise.all([
    git(cwd, ["rev-parse", "HEAD"], { allowFail: true }),
    git(cwd, ["status", "--porcelain"], { allowFail: true }),
  ]);
  if (head.code !== 0 || status.code !== 0) return undefined;
  return { head: head.stdout.trim(), status: status.stdout };
}

/**
 * Whether a fallback tier continues work: the chain starts on a dirty tree,
 * the tree changed since the chain started, or the branch already carries
 * commits past the turn's base. A later chain in the same turn (repair,
 * rescue, overflow retry) starts after the earlier chain's edits, so its
 * starting dirt is continued work too.
 */
async function worktreeEdited(
  cwd: string,
  base: string | undefined,
  start: WorktreeState | undefined,
): Promise<boolean> {
  if (start === undefined) return false;
  if (start.status.trim() !== "") return true;
  const current = await worktreeState(cwd);
  if (current === undefined) return false;
  if (current.head !== start.head || current.status !== start.status)
    return true;
  return base !== undefined && current.head !== base;
}

/**
 * A fallback that continues edited work assesses the tree first. The note is
 * its own block so it never fuses with the ask's opening line; an ask that
 * already carries it (a relaunch) keeps its single copy.
 */
function fallbackAsk(
  prompts: KernelRuntime["prompts"],
  ask: string,
  edited: boolean,
): string {
  if (!edited) return ask;
  const note = resumeNote(prompts, "fallback").trim();
  return note !== "" && !ask.includes(note) ? `${note}\n\n${ask}` : ask;
}

/**
 * Settles a probe: a served one drops the latch from the store too, so the next
 * launch starts on a pool known to work; an inconclusive after a throw leaves
 * the pool due. A quota answer already replaced the claim, so nothing lands.
 */
async function settleProbe(
  runtime: KernelRuntime,
  pool: string,
  claim: PoolReset,
  served: boolean,
): Promise<void> {
  const settled = settlePoolProbe(runtime.exhaustedPools, pool, claim, served);
  if (settled && served)
    await writePoolResets(runtime.paths, runtime.exhaustedPools);
}

/**
 * One tier call with its pool decision: a latched pool makes no call, and a
 * probe is settled before the chain reads the next tier. A quota answer has
 * already replaced the claim with its own reset, so settling keeps it.
 */
async function runTierCall(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
  tier: Tier,
  call: PoolCall,
  tierAsk: string,
  current: SessionRef | undefined,
  outcomePath: string,
  timeouts: { idleMs: number; wallMs: number },
): Promise<TurnResult> {
  const pool = tierPoolKey(tier);
  const release =
    spec.semaphoresHeld === true
      ? undefined
      : await semaphoresFor(runtime.configs).acquire(
          turnSemaphoreNames(runtime.configs, spec.semaphores, tier),
        );
  let result: TurnResult;
  try {
    result = await runChainTier(
      runtime,
      spec,
      tier,
      call,
      tierAsk,
      current,
      outcomePath,
      timeouts,
    );
  } catch (err) {
    if (call.kind === "probe")
      await settleProbe(runtime, pool, call.claim, false);
    throw err;
  } finally {
    release?.();
  }
  await markTierQuota(runtime, tier, result);
  if (call.kind === "probe")
    await settleProbe(runtime, pool, call.claim, result.stop.kind !== "infra");
  return result;
}

/**
 * Walks the alias's tiers from `fromIndex`: one harness call per live tier,
 * each with its own model, effort and opaque config, advancing on
 * infrastructure stops the tier's own retries could not cure. A tier whose
 * pool is latched makes no call; every attempt is stamped with the harness
 * that ran it. A fallback that continues edited work gets the resume fragment
 * as its own block before the ask, unless the ask already carries it.
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
  let tierAsk = ask;
  const startState =
    spec.target.tiers.length > fromIndex + 1
      ? await worktreeState(spec.cwd)
      : undefined;
  const state: ChainState = {
    attempts: [],
    served: [],
    servedOpen: true,
    usage: undefined,
  };
  let result: TurnResult | undefined;
  for (;;) {
    const tier = spec.target.tiers[index]!;
    // A latch refuses the call; one whose interval passed yields this leg the
    // pool's single probe, and the claim keeps every other leg off it.
    const call = takePoolCall(runtime.exhaustedPools, tierPoolKey(tier));
    if (call.kind === "latched") {
      if (index + 1 >= spec.target.tiers.length) break;
      index += 1;
      continue;
    }
    result = await runTierCall(
      runtime,
      spec,
      tier,
      call,
      tierAsk,
      current,
      outcomePath,
      timeouts,
    );
    absorbChainCall(state, result, tier.harness.id);
    current = result.session;
    if (result.stop.kind !== "infra" || index + 1 >= spec.target.tiers.length) {
      break;
    }
    index += 1;
    tierAsk = fallbackAsk(
      runtime.prompts,
      ask,
      await worktreeEdited(spec.cwd, spec.meta.base, startState),
    );
  }
  return chainOutcome(runtime, spec, state, index, result);
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
