import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { z } from "zod";
import {
  type LiveAgents,
  type ModelRef,
  portable,
  type ServedUsage,
  type SessionRef,
  type Stop,
  type TurnAttempt,
  type TurnResult,
  type Usage,
} from "../harness/types.js";
import { addUsage, reportsUsage, zeroUsage } from "../harness/usage.js";
import { missingPlanFinding, snapshotPlan } from "./architect-session.js";
import { makeCause } from "./cause.js";
import { type TurnTarget, tierPoolKey } from "./flow-context.js";
import { launchKindOf } from "./metrics.js";
import { loadPriceTable } from "./openrouter.js";
import {
  failedOutcome,
  type OutcomeExpectation,
  OutcomeInvalidError,
  type OutcomeSource,
  readDeliveredOutcome,
  validateExpectation,
} from "./outcome.js";
import { pricedServed, pricedUsage } from "./pricing.js";
import { outcomeRepairSchemaVar } from "./prompt-schema.js";
import { markPoolExhausted, poolResetAt } from "./quota-pools.js";
import { appendPark } from "./record.js";
import { statusSource, writeStatus } from "./status.js";
import {
  DEFAULT_TIMEOUTS,
  type KernelRuntime,
  type LaunchKind,
  type Outcome,
  outcomeSchema,
  type RecordEnd,
  type RecordStart,
  type StepRecord,
  type TurnRecord,
} from "./types.js";

export { DEFAULT_TIMEOUTS } from "./types.js";

/**
 * Bound on the detector's one settle re-read of the outcome path: a tool
 * call's write can land just after the harness returns. A turn that wrote
 * nothing waits this once, never once per repair round.
 */
export const OUTCOME_SETTLE_MS = 500;

export interface AgentTurnSpec {
  target: TurnTarget;
  cwd: string;
  /** iteration/slug/step/round/taskHash/base; actor, alias, model come from the target. */
  meta: Omit<RecordStart, "actor" | "alias" | "model">;
  vars: Record<string, string>;
  expectation: OutcomeExpectation;
  /**
   * The step's contract beyond the outcome schema: findings that send the
   * delivered outcome back for repair, like a schema failure.
   */
  validate?: (outcome: Outcome) => string[];
  /**
   * The task type's output schema; defaults to the kernel outcome schema for
   * kernel turns and legacy tasks.
   */
  outcomeSchema?: z.ZodType<Outcome>;
  /** Review steps only: the last call refuses a `changes` verdict. */
  lastCall?: boolean;
  session?: SessionRef;
  timeouts?: { idleMs: number; wallMs: number };
  /** Outcome reminders after the first attempt; defaults to process `reminders`. */
  repairTurns?: number;
  /**
   * Per-turn adapter options that override the tier's. The omp hierarchy uses
   * it for the transient subarchitect agent definitions; every other adapter
   * ignores keys it does not know.
   */
  opaque?: unknown;
  /** Steerable harnesses only: the live children handle is passed through. */
  onLive?: (agents: LiveAgents) => void;
  /**
   * Runs after the turn and before the end record commits. `settle` sees the
   * accepted outcome and the live session, so it can compact and return the
   * compacted ref that must be stored (mechanical commits ignore the extras).
   */
  settle?: (
    record: StepRecord,
    outcome: Outcome | undefined,
    session: SessionRef | undefined,
  ) => Promise<RecordEnd>;
  /**
   * Sleeps out the detector's one settle re-read of the outcome path. Tests
   * inject a recorder instead of waiting.
   */
  sleep?: (ms: number) => Promise<void>;
}

export interface AgentTurnResult {
  record: StepRecord;
  /** Absent when an infra/refusal/cancelled stop ended the turn before delivery. */
  outcome?: Outcome;
  text: string;
}

/** Boundary steps that run on the iteration's pack; only they measure it. */
const PACK_STEPS = new Set(["architect", "pm", "subarchitect"]);

/**
 * The pack is the boundary consult's shared context: the architect reads it,
 * the PM derives tasks from the plan it produced in the same iteration. The
 * measurement is the rendered artifact's byte size.
 */
async function measurePack(
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
function overflowed(stop: Stop): boolean {
  return stop.kind === "infra" && stop.cause === "overflow";
}

/**
 * The product each turn must deliver, named in the repair ask and the failure
 * cause. A step's process config owns the wording; a turn that names none
 * delivers its expectation's product.
 */
function deliverableOf(spec: AgentTurnSpec): string {
  return (
    spec.target.deliverable ??
    (spec.expectation === "review"
      ? "verdict"
      : spec.expectation === "qa"
        ? "qa verdict"
        : "outcome")
  );
}

function missingOutcomeFinding(
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
  harness: import("../harness/types.js").Harness,
  request: import("../harness/types.js").TurnRequest,
): Promise<import("../harness/types.js").TurnResult> {
  const wallMs = request.timeouts.wallMs;
  // The kernel owns the wall bound: when it fires, the harness child is
  // aborted so it cannot write past the bound, and the race resolves with the
  // synthesized timeout. A turn that resolves first is never aborted.
  const controller = new AbortController();
  const req = { ...request, signal: controller.signal };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult: import("../harness/types.js").TurnResult = {
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
  const timeoutPromise = new Promise<import("../harness/types.js").TurnResult>(
    (resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(timeoutResult);
      }, wallMs);
    },
  );
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
function mergeServed(
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

type Tier = TurnTarget["tiers"][number];

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

interface ChainState {
  attempts: TurnAttempt[];
  served: ServedUsage[];
  servedOpen: boolean;
  usage: Usage | undefined;
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

interface ChainResult {
  result: TurnResult;
  endIndex: number;
  attempts: TurnAttempt[];
  usage: Usage;
  served?: ServedUsage[];
}

/**
 * Walks the alias's tiers from `fromIndex`: one harness call per tier, each
 * with its own model, effort and opaque config, advancing on infrastructure
 * stops the tier's own retries could not cure. Every attempt is stamped with
 * the harness that ran it.
 */
async function callChain(
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
function isHalted(stop: Stop): boolean {
  return HALTING_STOPS.has(stop.kind);
}

interface AgentTurnState {
  runtime: KernelRuntime;
  spec: AgentTurnSpec;
  started: TurnRecord;
  outcomePath: string;
  prompt: string;
  promptBytes: number;
  pack: Awaited<ReturnType<typeof measurePack>>;
  timeouts: { idleMs: number; wallMs: number };
  planWho: string;
  planBefore: string | null;
  deliverable: string;
  repairPrompt: string;
  maxRepairs: number;
  repairs: number;
  outcomeSettled: boolean;
  repairFindings: string[];
  lastResult: TurnResult;
  attempts: TurnAttempt[];
  stop: Stop;
  usage: Usage;
  served: ServedUsage[];
  servedOpen: boolean;
  session: SessionRef | undefined;
  text: string;
  tierIndex: number;
  outcome: Outcome | null;
  findings: string[];
}

interface TurnPreparation {
  prompt: string;
  promptBytes: number;
  pack: Awaited<ReturnType<typeof measurePack>>;
  timeouts: { idleMs: number; wallMs: number };
  planWho: string;
  planBefore: string | null;
}

/** Renders the first prompt and snapshots the plan it must compare against. */
async function prepareTurn(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
  started: TurnRecord,
): Promise<TurnPreparation> {
  const { timeouts: aliasTimeouts } = spec.target;
  const prompt = runtime.prompts.render(spec.target.prompt, {
    ...spec.vars,
    outcome_path: started.outcomePath,
  });
  // The rendered step prompt is the cost driver; a repair ask is small and
  // replaces it in the same session, so the record carries the first ask.
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const pack = await measurePack(runtime, spec);
  const timeouts = spec.timeouts ?? aliasTimeouts ?? DEFAULT_TIMEOUTS;
  // The plan snapshot is taken once before the first attempt, so the repair
  // turn compares against the pre-turn plan, not the first attempt's.
  const planWho =
    spec.meta.step === "subarchitect" ? "subarchitect" : "architect";
  const planBefore =
    spec.expectation === "architect" ? snapshotPlan(spec.vars.plan_path) : null;
  return { prompt, promptBytes, pack, timeouts, planWho, planBefore };
}

async function startTurnState(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
  started: TurnRecord,
): Promise<AgentTurnState> {
  const prep = await prepareTurn(runtime, spec, started);
  const first = await callChain(
    runtime,
    spec,
    started.outcomePath,
    prep.timeouts,
    0,
    prep.prompt,
    spec.session,
  );
  const requestedRepairs =
    spec.repairTurns ?? runtime.configs.process.reminders ?? 1;
  return {
    runtime,
    spec,
    started,
    outcomePath: started.outcomePath,
    ...prep,
    deliverable: deliverableOf(spec),
    repairPrompt:
      spec.target.repairPrompt ??
      runtime.configs.process.repairPrompt ??
      "delivery-repair",
    maxRepairs: Math.max(0, Math.floor(requestedRepairs)),
    repairs: 0,
    outcomeSettled: false,
    repairFindings: [],
    lastResult: first.result,
    attempts: first.attempts,
    stop: first.result.stop,
    usage: first.usage,
    served: first.served ?? [],
    servedOpen: first.served !== undefined || !reportsUsage(first.usage),
    session: first.result.session,
    text: first.result.text,
    tierIndex: first.endIndex,
    outcome: null,
    findings: [],
  };
}

function absorbServed(
  state: AgentTurnState,
  call: { usage: Usage; served?: ServedUsage[] },
): void {
  if (!state.servedOpen) return;
  if (call.served) state.served = mergeServed(state.served, call.served);
  else if (reportsUsage(call.usage)) state.servedOpen = false;
}

/** A resumed session that overflowed retries once de novo. */
async function retryOverflow(state: AgentTurnState): Promise<void> {
  if (!state.spec.session || !overflowed(state.stop)) return;
  // A half-delivered outcome from the failed attempt is not the retry's.
  fs.rmSync(state.outcomePath, { force: true });
  const retry = await callChain(
    state.runtime,
    state.spec,
    state.outcomePath,
    state.timeouts,
    state.tierIndex,
    state.prompt,
    undefined,
  );
  state.lastResult = retry.result;
  state.attempts = [...state.attempts, ...retry.attempts];
  state.stop = retry.result.stop;
  state.usage = addUsage(state.usage, retry.usage);
  absorbServed(state, retry);
  state.session = retry.result.session;
  state.text = retry.result.text;
  state.tierIndex = retry.endIndex;
}

/** One settled read per turn; a missing outcome waits the bound once. */
async function readTurnOutcome(
  state: AgentTurnState,
): Promise<OutcomeSource | null> {
  const read = () =>
    readDeliveredOutcome(
      state.outcomePath,
      state.text,
      state.spec.outcomeSchema ?? outcomeSchema,
    );
  const delivered = read();
  if (delivered !== null || state.outcomeSettled) return delivered;
  if (isHalted(state.stop)) return delivered;
  state.outcomeSettled = true;
  await (state.spec.sleep ?? sleep)(OUTCOME_SETTLE_MS);
  return read();
}

async function assessTurn(
  state: AgentTurnState,
  afterRepair: boolean,
): Promise<void> {
  state.outcome = null;
  state.findings = [];
  try {
    const delivered = await readTurnOutcome(state);
    if (delivered) {
      state.outcome = delivered.outcome;
      // A closure cites an id ingest assigned to an earlier record, so the
      // check needs the record tree; without a closure there is nothing to
      // resolve and no reason to read it.
      const records = state.outcome.debtClosed?.length
        ? await state.runtime.store.listRecords()
        : undefined;
      state.findings = [
        ...validateExpectation(state.outcome, state.spec.expectation, {
          lastCall: state.spec.lastCall,
          ...(records
            ? {
                records,
                excludeRecordId: path.basename(state.started.dir),
              }
            : {}),
        }),
        ...(state.spec.validate?.(state.outcome) ?? []),
      ];
    }
  } catch (err) {
    if (!(err instanceof OutcomeInvalidError)) throw err;
    state.findings = err.findings;
  }
  if (state.findings.length === 0 && !state.outcome && !isHalted(state.stop)) {
    state.findings = [missingOutcomeFinding(state.deliverable, afterRepair)];
  }
  if (!isHalted(state.stop) && state.spec.expectation === "architect") {
    const planFinding = missingPlanFinding(
      state.spec.vars.plan_path,
      state.outcome?.decision,
      state.planBefore,
      state.planWho,
    );
    if (planFinding) state.findings.push(planFinding);
  }
}

/** One in-session repair ask, rendered from the step's configured template. */
function renderRepairPrompt(state: AgentTurnState): string {
  return state.runtime.prompts.render(state.repairPrompt, {
    role: state.spec.target.prompt,
    deliverable: state.deliverable,
    done_allowed: state.spec.expectation === "any" ? "true" : "false",
    findings: state.findings.map((f) => `- ${f}`).join("\n"),
    outcome_path: state.outcomePath,
    // The repair shows only the fields this turn can deliver, so a bare done
    // is never asked for a verdict or decision.
    outcome_schema: outcomeRepairSchemaVar(
      state.spec.target.prompt,
      state.spec.expectation,
      state.spec.outcomeSchema ?? outcomeSchema,
    ),
  });
}

/** Bounded reminders: each repair ask re-reads the outcome it produced. */
async function repairLoop(state: AgentTurnState): Promise<void> {
  while (
    state.findings.length > 0 &&
    !isHalted(state.stop) &&
    state.repairs < state.maxRepairs
  ) {
    state.repairFindings.push(...state.findings);
    const repair = await callChain(
      state.runtime,
      state.spec,
      state.outcomePath,
      state.timeouts,
      state.tierIndex,
      renderRepairPrompt(state),
      state.session,
    );
    state.repairs += 1;
    state.lastResult = repair.result;
    state.attempts = [...state.attempts, ...repair.attempts];
    state.stop = repair.result.stop;
    state.usage = addUsage(state.usage, repair.usage);
    absorbServed(state, repair);
    state.session = repair.result.session ?? state.session;
    state.text = repair.result.text;
    state.tierIndex = repair.endIndex;
    await assessTurn(state, true);
  }
}

interface TurnPricing {
  actualModel: ModelRef;
  cachedPrefix: boolean | undefined;
  pricedAttempts: TurnAttempt[];
  pricedSplit: ReturnType<typeof pricedServed> | undefined;
  pricedTop: Usage;
  pricedCompact: Usage | undefined;
}

/** Prices the aggregate, the per-model split and the compaction input. */
async function priceTurn(
  state: AgentTurnState,
  settled: RecordEnd,
): Promise<TurnPricing> {
  const actualModel =
    (state.lastResult as TurnResult & { model?: ModelRef }).model ??
    state.spec.target.model;
  // A resumed turn whose harness did not split the cache priced its prefix.
  const cachedPrefix = state.spec.session ? true : undefined;
  const prices = await loadPriceTable(state.runtime.priceSource);
  const priceIds = state.runtime.configs.run.priceIds;
  const pricedAttempts = state.attempts.map((attempt) => ({
    ...attempt,
    usage: pricedUsage(attempt.usage, attempt.model.id, prices, {
      cachedPrefix,
      priceIds,
    }).usage,
  }));
  // A complete split prices each served model at its own row and replaces the
  // aggregate, which would otherwise charge every token to one model.
  const pricedSplit =
    state.servedOpen && state.served.length > 0
      ? pricedServed(state.served, prices, { cachedPrefix, priceIds })
      : undefined;
  const pricedTop =
    pricedSplit?.usage ??
    pricedUsage(state.usage, actualModel?.id, prices, {
      cachedPrefix,
      priceIds,
    }).usage;
  // The settle ran while the cache was hot, so an unsplit compaction input is
  // the cached transcript, priced at the cached rate.
  const pricedCompact = settled.compactUsage
    ? pricedUsage(settled.compactUsage, actualModel?.id, prices, {
        cachedPrefix: true,
        priceIds,
      }).usage
    : undefined;
  return {
    actualModel,
    cachedPrefix,
    pricedAttempts,
    pricedSplit,
    pricedTop,
    pricedCompact,
  };
}

function turnRecordEnd(
  state: AgentTurnState,
  settled: RecordEnd,
  pricing: TurnPricing,
): RecordEnd {
  const launchKind: LaunchKind | undefined = launchKindOf({
    stop: state.stop,
    outcome: state.outcome ?? undefined,
    attempts: state.attempts,
    repairFindings: state.repairFindings,
  });
  // The final outcome passed the same checks the reminders named, so every
  // finding that triggered one is closed.
  const repairFindingsResolved =
    state.repairFindings.length > 0 &&
    state.outcome !== null &&
    state.findings.length === 0;
  return {
    ...settled,
    promptBytes: state.promptBytes,
    ...(state.pack ? { packBytes: state.pack.bytes } : {}),
    ...(pricing.actualModel ? { model: pricing.actualModel } : {}),
    ...(pricing.cachedPrefix ? { cachedPrefix: true } : {}),
    stop: state.stop,
    usage: pricing.pricedTop,
    ...(pricing.pricedCompact ? { compactUsage: pricing.pricedCompact } : {}),
    ...(pricing.pricedAttempts.length > 0
      ? { attempts: pricing.pricedAttempts }
      : {}),
    ...(pricing.pricedSplit ? { served: pricing.pricedSplit.served } : {}),
    ...(state.repairFindings.length > 0
      ? { repairFindings: state.repairFindings }
      : {}),
    ...(repairFindingsResolved ? { repairFindingsResolved: true } : {}),
    ...(launchKind ? { launchKind } : {}),
    ...(state.lastResult.transcript
      ? { transcript: state.lastResult.transcript }
      : {}),
    session: settled.session ?? state.session,
    outcome: state.outcome ?? undefined,
  };
}

async function finalizeTurn(state: AgentTurnState): Promise<AgentTurnResult> {
  const halted = isHalted(state.stop);
  if (state.findings.length > 0 && !halted) {
    if (state.findings.length > 0 || !state.outcome) {
      state.outcome = failedOutcome(
        state.findings.length > 0
          ? state.findings
          : ["no outcome after repair"],
      );
    }
  }

  const settled = state.spec.settle
    ? await state.spec.settle(
        state.started.meta,
        state.outcome ?? undefined,
        state.session,
      )
    : {};
  const pricing = await priceTurn(state, settled);
  const record = await state.started.finish(
    turnRecordEnd(state, settled, pricing),
  );
  // An overflow that survived the de-novo retry cannot succeed on this item:
  // park it so a later launch does not burn another attempt.
  if (overflowed(state.stop) && state.spec.meta.slug) {
    await appendPark(
      state.runtime.store,
      {
        iteration: state.spec.meta.iteration,
        slug: state.spec.meta.slug,
        round: state.spec.meta.round,
        revision: state.spec.meta.revision ?? 0,
        architect: state.spec.meta.architect,
      },
      makeCause("overflow", ""),
    );
  }
  await writeStatus(statusSource(state.runtime));
  return { record, outcome: state.outcome ?? undefined, text: state.text };
}

export async function runAgentTurn(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
): Promise<AgentTurnResult> {
  const { alias, model } = spec.target;
  const started = await runtime.store.startRecord({
    ...spec.meta,
    actor: "agent",
    alias,
    model,
  });
  await writeStatus(statusSource(runtime));
  // Every tier is exhausted: no call may run. The record names the cause so
  // dispatch defers the slug and the launch reports why, instead of probing a
  // tier already known dead.
  if (spec.target.unavailable !== undefined) {
    const record = await started.finish({
      stop: {
        kind: "infra",
        cause: "unavailable",
        details: spec.target.unavailable,
      },
    });
    await writeStatus(statusSource(runtime));
    return { record, outcome: undefined, text: "" };
  }
  const state = await startTurnState(runtime, spec, started);
  await retryOverflow(state);
  await assessTurn(state, false);
  await repairLoop(state);
  return finalizeTurn(state);
}
