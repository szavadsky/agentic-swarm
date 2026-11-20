// biome-ignore-all lint/complexity: split-rest
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

export async function runAgentTurn(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
): Promise<AgentTurnResult> {
  const { alias, model, tiers, timeouts: aliasTimeouts } = spec.target;
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
  const outcomePath = started.outcomePath;
  const prompt = runtime.prompts.render(spec.target.prompt, {
    ...spec.vars,
    outcome_path: outcomePath,
  });
  // The rendered step prompt is the cost driver; a repair ask is small and
  // replaces it in the same session, so the record carries the first ask.
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const pack = await measurePack(runtime, spec);
  const timeouts = spec.timeouts ?? aliasTimeouts ?? DEFAULT_TIMEOUTS;

  /**
   * Walks the alias's tiers from `fromIndex`: one harness call per tier, each
   * with its own model, effort and opaque config, advancing on infrastructure
   * stops the tier's own retries could not cure. A session crosses only to a
   * harness it is portable to; every attempt is stamped with the harness that
   * ran it. A tier that stops on quota records its pool in the launch's
   * exhausted set; transient stops do not exhaust the pool.
   */
  const callChain = async (
    fromIndex: number,
    ask: string,
    chainSession: SessionRef | undefined,
  ): Promise<{
    result: TurnResult;
    endIndex: number;
    attempts: TurnAttempt[];
    usage: Usage;
    served?: ServedUsage[];
  }> => {
    let index = fromIndex;
    let current = chainSession;
    const chainAttempts: TurnAttempt[] = [];
    const chainServed: ServedUsage[] = [];
    let servedOpen = true;
    let chainUsage: Usage | undefined;
    let result: TurnResult | undefined;
    for (;;) {
      const tier = tiers[index]!;
      result = await turnWithTimeout(tier.harness, {
        model: tier.model,
        ...(tier.effort ? { effort: tier.effort } : {}),
        cwd: spec.cwd,
        prompt: ask,
        ...(current &&
        portable(
          current.harness,
          tier.harness.id,
          runtime.configs.run.portability,
        )
          ? { session: current }
          : {}),
        outcomePath,
        timeouts,
        opaque: turnOpaque(tier.opaque, spec.opaque),
        ...(spec.onLive ? { onLive: spec.onLive } : {}),
      });
      for (const attempt of result.attempts ?? []) {
        chainAttempts.push({ ...attempt, harness: tier.harness.id });
      }
      chainUsage = chainUsage
        ? addUsage(chainUsage, result.usage)
        : result.usage;
      if (result.served && (result.attempts?.length ?? 0) <= 1) {
        chainServed.push(...result.served);
      } else if (result.served) {
        // A split covers one call's usage; with retried calls in the same
        // harness turn their usage is outside it, so the aggregate stays.
        servedOpen = false;
      } else if (reportsUsage(result.usage)) {
        // A call that measured tokens without a per-model split makes the
        // whole launch unsplittable: attributing its usage to one model would
        // be a guess, and dropping it would undercount the turn.
        servedOpen = false;
      }
      current = result.session;
      if (result.stop.kind === "infra" && result.stop.cause === "quota") {
        await markPoolExhausted({
          paths: runtime.paths,
          pools: runtime.exhaustedPools,
          pool: tierPoolKey(tier),
          resetAt: poolResetAt(
            runtime.configs.run,
            Date.now(),
            result.stop.details,
          ),
        });
      }
      if (result.stop.kind !== "infra" || index + 1 >= tiers.length) break;
      index += 1;
    }
    return {
      result: result!,
      endIndex: index,
      attempts: chainAttempts,
      usage: chainUsage!,
      ...(servedOpen && chainServed.length > 0 ? { served: chainServed } : {}),
    };
  };

  // The plan snapshot is taken once before the first attempt, so the repair
  // turn compares against the pre-turn plan, not the first attempt's. The epic
  // consult enforces the same rule on its own plan.
  const planWho =
    spec.meta.step === "subarchitect" ? "subarchitect" : "architect";
  const planBefore =
    spec.expectation === "architect" ? snapshotPlan(spec.vars.plan_path) : null;
  const first = await callChain(0, prompt, spec.session);
  let lastResult = first.result;
  let attempts = first.attempts;
  let stop: Stop = first.result.stop;
  let usage = first.usage;
  // Union of the per-model splits across every call; once a call reports
  // tokens without a split the launch keeps its aggregate and no model split.
  let served: ServedUsage[] = first.served ?? [];
  let servedOpen = first.served !== undefined || !reportsUsage(first.usage);
  const absorbServed = (call: {
    usage: Usage;
    served?: ServedUsage[];
  }): void => {
    if (!servedOpen) return;
    if (call.served) served = mergeServed(served, call.served);
    else if (reportsUsage(call.usage)) servedOpen = false;
  };
  let session = first.result.session;
  let text = first.result.text;
  let tierIndex = first.endIndex;
  let outcome: Outcome | null = null;
  let findings: string[] = [];

  // A resumed session can overflow on its own history. The prompt is self-
  // contained, so retry once de novo instead of spending a review round; a
  // second overflow is terminal because the prompt itself does not fit.
  if (spec.session && overflowed(stop)) {
    // A half-delivered outcome from the failed attempt is not the retry's.
    fs.rmSync(outcomePath, { force: true });
    const retry = await callChain(tierIndex, prompt, undefined);
    lastResult = retry.result;
    attempts = [...attempts, ...retry.attempts];
    stop = retry.result.stop;
    usage = addUsage(usage, retry.usage);
    absorbServed(retry);
    session = retry.result.session;
    text = retry.result.text;
    tierIndex = retry.endIndex;
  }

  const deliverable = deliverableOf(spec);
  const repairPrompt =
    spec.target.repairPrompt ??
    runtime.configs.process.repairPrompt ??
    "delivery-repair";

  /**
   * One settled read per turn: the file may land just after the harness
   * returns, so a missing outcome waits the bound once and looks again. A turn
   * that wrote nothing pays that bound once, never once per repair round.
   */
  let outcomeSettled = false;
  const readOutcome = async (): Promise<OutcomeSource | null> => {
    const read = () =>
      readDeliveredOutcome(
        outcomePath,
        text,
        spec.outcomeSchema ?? outcomeSchema,
      );
    const delivered = read();
    if (delivered !== null || outcomeSettled) return delivered;
    const halted =
      stop.kind === "infra" ||
      stop.kind === "refusal" ||
      stop.kind === "cancelled";
    if (halted) return delivered;
    outcomeSettled = true;
    await (spec.sleep ?? sleep)(OUTCOME_SETTLE_MS);
    return read();
  };

  const assess = async (afterRepair: boolean): Promise<void> => {
    outcome = null;
    findings = [];
    try {
      const delivered = await readOutcome();
      if (delivered) {
        outcome = delivered.outcome;
        // A closure cites an id ingest assigned to an earlier record, so the
        // check needs the record tree; without a closure there is nothing to
        // resolve and no reason to read it.
        const records = outcome.debtClosed?.length
          ? await runtime.store.listRecords()
          : undefined;
        findings = [
          ...validateExpectation(outcome, spec.expectation, {
            lastCall: spec.lastCall,
            ...(records
              ? {
                  records,
                  excludeRecordId: path.basename(started.dir),
                }
              : {}),
          }),
          ...(spec.validate?.(outcome) ?? []),
        ];
      }
    } catch (err) {
      if (!(err instanceof OutcomeInvalidError)) throw err;
      findings = err.findings;
    }
    const halted =
      stop.kind === "infra" ||
      stop.kind === "refusal" ||
      stop.kind === "cancelled";
    if (findings.length === 0 && !outcome && !halted) {
      findings = [missingOutcomeFinding(deliverable, afterRepair)];
    }
    if (!halted && spec.expectation === "architect") {
      const planFinding = missingPlanFinding(
        spec.vars.plan_path,
        outcome?.decision,
        planBefore,
        planWho,
      );
      if (planFinding) findings.push(planFinding);
    }
  };
  await assess(false);

  const haltedNow = (): boolean =>
    stop.kind === "infra" ||
    stop.kind === "refusal" ||
    stop.kind === "cancelled";
  // Repairs are bounded by the reminder count (the task may override it).
  const requestedRepairs =
    spec.repairTurns ?? runtime.configs.process.reminders ?? 1;
  const maxRepairs = Math.max(0, Math.floor(requestedRepairs));
  const needsRepair = findings.length > 0 && !haltedNow();
  let repairs = 0;
  const repairFindings: string[] = [];
  while (findings.length > 0 && !haltedNow() && repairs < maxRepairs) {
    repairFindings.push(...findings);
    // One in-session repair ask, rendered from the step's configured prompt
    // template so repos can reword it or vary its shape per role; a bare
    // status:done only delivers when no verdict or decision is required.
    const repair = await callChain(
      tierIndex,
      runtime.prompts.render(repairPrompt, {
        role: spec.target.prompt,
        deliverable,
        done_allowed: spec.expectation === "any" ? "true" : "false",
        findings: findings.map((f) => `- ${f}`).join("\n"),
        outcome_path: outcomePath,
        // The repair shows only the fields this turn can deliver, so a bare
        // done is never asked for a verdict or decision.
        outcome_schema: outcomeRepairSchemaVar(
          spec.target.prompt,
          spec.expectation,
          spec.outcomeSchema ?? outcomeSchema,
        ),
      }),
      session,
    );
    repairs += 1;
    lastResult = repair.result;
    attempts = [...attempts, ...repair.attempts];
    stop = repair.result.stop;
    usage = addUsage(usage, repair.usage);
    absorbServed(repair);
    session = repair.result.session ?? session;
    text = repair.result.text;
    tierIndex = repair.endIndex;
    await assess(true);
  }
  // The final outcome passed the same checks the reminders named, so every
  // finding that triggered one is closed. The marker keeps a done record from
  // reading as an open failure beside its own repair history.
  const repairFindingsResolved =
    repairFindings.length > 0 && outcome !== null && findings.length === 0;
  if (needsRepair) {
    if (!outcome && haltedNow()) {
      // An infrastructure interruption of the repair turn consumes no outcome.
    } else if (findings.length > 0 || !outcome) {
      outcome = failedOutcome(
        findings.length > 0 ? findings : ["no outcome after repair"],
      );
    }
  }

  const settled = spec.settle
    ? await spec.settle(started.meta, outcome ?? undefined, session)
    : {};
  const actualModel =
    (lastResult as typeof lastResult & { model?: ModelRef }).model ?? model;
  // Price at record time so every turn carries its priced cost and the
  // list-price equivalent; aggregation reprices idempotently for old records.
  // A resumed turn whose harness did not split the cache priced its prefix.
  const cachedPrefix = spec.session ? true : undefined;
  const prices = await loadPriceTable(runtime.priceSource);
  const priceIds = runtime.configs.run.priceIds;
  const pricedAttempts: TurnAttempt[] = attempts.map((attempt) => ({
    ...attempt,
    usage: pricedUsage(attempt.usage, attempt.model.id, prices, {
      cachedPrefix,
      priceIds,
    }).usage,
  }));
  // A complete split prices each served model at its own row and replaces the
  // aggregate, which would otherwise charge every token to one model.
  const pricedSplit =
    servedOpen && served.length > 0
      ? pricedServed(served, prices, { cachedPrefix, priceIds })
      : undefined;
  const pricedTop =
    pricedSplit?.usage ??
    pricedUsage(usage, actualModel?.id, prices, {
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
  const launchKind: LaunchKind | undefined = launchKindOf({
    stop,
    outcome: outcome ?? undefined,
    attempts,
    repairFindings,
  });
  const record = await started.finish({
    ...settled,
    promptBytes,
    ...(pack ? { packBytes: pack.bytes } : {}),
    ...(actualModel ? { model: actualModel } : {}),
    ...(cachedPrefix ? { cachedPrefix } : {}),
    stop,
    usage: pricedTop,
    ...(pricedCompact ? { compactUsage: pricedCompact } : {}),
    ...(pricedAttempts.length > 0 ? { attempts: pricedAttempts } : {}),
    ...(pricedSplit ? { served: pricedSplit.served } : {}),
    ...(repairFindings.length > 0 ? { repairFindings } : {}),
    ...(repairFindingsResolved ? { repairFindingsResolved: true } : {}),
    ...(launchKind ? { launchKind } : {}),
    ...(lastResult.transcript ? { transcript: lastResult.transcript } : {}),
    session: settled.session ?? session,
    outcome: outcome ?? undefined,
  });
  // An overflow that survived the de-novo retry cannot succeed on this item:
  // park it so a later launch does not burn another attempt.
  if (overflowed(stop) && spec.meta.slug) {
    await appendPark(
      runtime.store,
      {
        iteration: spec.meta.iteration,
        slug: spec.meta.slug,
        round: spec.meta.round,
        revision: spec.meta.revision ?? 0,
        architect: spec.meta.architect,
      },
      makeCause("overflow", ""),
    );
  }
  await writeStatus(statusSource(runtime));
  return { record, outcome: outcome ?? undefined, text };
}
