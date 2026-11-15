import fs from "node:fs";
import type {
  ModelRef,
  SessionRef,
  Stop,
  TurnAttempt,
} from "../harness/types.js";
import { addUsage } from "../harness/usage.js";
import { pricedUsage } from "./pricing.js";
import { missingPlanFinding, snapshotPlan } from "./architect-session.js";
import { contextPackRelPath } from "./context-pack.js";
import type { RoleTarget } from "./flow-context.js";
import {
  failedOutcome,
  type OutcomeExpectation,
  OutcomeInvalidError,
  readDeliveredOutcome,
  validateExpectation,
} from "./outcome.js";
import { renderRolePrompt } from "./prompts.js";
import { appendPark } from "./record.js";
import {
  DEFAULT_TIMEOUTS,
  type KernelRuntime,
  type Outcome,
  type RecordEnd,
  type RecordStart,
  type StepRecord,
} from "./types.js";

export { DEFAULT_TIMEOUTS } from "./types.js";

export interface AgentTurnSpec {
  target: RoleTarget;
  cwd: string;
  /** iteration/slug/step/round/taskHash/base; actor, alias, model come from the target. */
  meta: Omit<RecordStart, "actor" | "alias" | "model">;
  vars: Record<string, string>;
  expectation: OutcomeExpectation;
  session?: SessionRef;
  timeouts?: { idleMs: number; wallMs: number };
  /** Outcome-repair turns after the first attempt; defaults to REPAIR_TURNS. */
  repairTurns?: number;
  /**
   * Item budget before this turn. The first attempt spends one turn, so the
   * loop caps repairs at `limit - used - 1`. Steps without an item leave it
   * unset and repair up to `repairTurns`.
   */
  itemBudget?: { used: number; limit: number };
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
}

export interface AgentTurnResult {
  record: StepRecord;
  /** Absent when an infra/refusal/cancelled stop ended the turn before delivery. */
  outcome?: Outcome;
  text: string;
}

/**
 * Outcome-repair turns after the first attempt. A constant, not a config knob;
 * a task file's `repairTurns` overrides it for that task's turns only.
 */
export const REPAIR_TURNS = 3;

/** Roles that run the boundary consult; only they see the iteration's pack. */
const PACK_ROLES = new Set(["architect", "pm"]);

/**
 * The pack is the boundary consult's shared context: the architect reads it,
 * the PM derives tasks from the plan it produced in the same iteration. The
 * measurement is the rendered artifact's byte size.
 */
async function measurePack(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
): Promise<{ bytes: number } | undefined> {
  if (!PACK_ROLES.has(spec.target.role)) return undefined;
  const pack = await runtime.store.readFile(
    contextPackRelPath(spec.meta.iteration),
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
 * The product each role's turn must deliver, named in the repair ask and the
 * failure cause. The PM ladder and the front post-checks own file validity;
 * the guard names their deliverable when the outcome itself goes missing.
 */
function deliverableFor(role: string): string {
  switch (role) {
    case "architect":
      return "plan edit or stop decision";
    case "reviewer":
      return "verdict";
    case "pm":
      return "task files";
    case "front":
      return "class, task, and pack";
    default:
      return "outcome";
  }
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
 * fallback, up to REPAIR_TURNS same-session repair turns, then an invalid
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

export async function runAgentTurn(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
): Promise<AgentTurnResult> {
  const {
    alias,
    harness,
    model,
    effort,
    fallbacks,
    timeouts: aliasTimeouts,
  } = spec.target;
  const started = await runtime.store.startRecord({
    ...spec.meta,
    actor: "agent",
    alias,
    model,
  });
  const outcomePath = started.outcomePath;
  const prompt = renderRolePrompt(
    runtime.prompts,
    runtime.configs.process,
    spec.target.role,
    {
      ...spec.vars,
      outcome_path: outcomePath,
    },
  );
  // The rendered role prompt is the cost driver; a repair ask is small and
  // replaces it in the same session, so the record carries the first ask.
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const pack = await measurePack(runtime, spec);
  const timeouts = spec.timeouts ?? aliasTimeouts ?? DEFAULT_TIMEOUTS;

  const request = {
    model,
    effort,
    cwd: spec.cwd,
    prompt,
    session: spec.session,
    outcomePath,
    timeouts,
    fallbacks: fallbacks?.map((id) => ({ id, effort })),
  };
  // The plan snapshot is taken once before the first attempt, so the repair
  // turn compares against the pre-turn plan, not the first attempt's.
  const planBefore =
    spec.target.role === "architect" ? snapshotPlan(spec.vars.plan_path) : null;
  const result = await turnWithTimeout(harness, request);
  let lastResult = result;
  let attempts = [...(result.attempts ?? [])];
  let stop: Stop = result.stop;
  let usage = result.usage;
  let session = result.session;
  let text = result.text;
  let outcome: Outcome | null = null;
  let findings: string[] = [];

  // A resumed session can overflow on its own history. The prompt is self-
  // contained, so retry once de novo instead of spending a review round; a
  // second overflow is terminal because the prompt itself does not fit.
  if (spec.session && overflowed(stop)) {
    // A half-delivered outcome from the failed attempt is not the retry's.
    fs.rmSync(outcomePath, { force: true });
    const retry = await turnWithTimeout(harness, {
      ...request,
      session: undefined,
    });
    lastResult = retry;
    attempts = [...attempts, ...(retry.attempts ?? [])];
    stop = retry.stop;
    usage = addUsage(usage, retry.usage);
    session = retry.session;
    text = retry.text;
  }

  const deliverable = deliverableFor(spec.target.role);

  const assess = (afterRepair: boolean): void => {
    outcome = null;
    findings = [];
    try {
      const delivered = readDeliveredOutcome(outcomePath, text);
      if (delivered) {
        outcome = delivered.outcome;
        findings = validateExpectation(outcome, spec.expectation);
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
    if (!halted && spec.target.role === "architect") {
      const planFinding = missingPlanFinding(
        spec.vars.plan_path,
        outcome?.decision,
        planBefore,
      );
      if (planFinding) findings.push(planFinding);
    }
  };
  assess(false);

  const haltedNow = (): boolean =>
    stop.kind === "infra" ||
    stop.kind === "refusal" ||
    stop.kind === "cancelled";
  // The first attempt spent one turn of the item budget; repairs spend the rest.
  const requestedRepairs = spec.repairTurns ?? REPAIR_TURNS;
  const budgetRepairs = spec.itemBudget
    ? Math.max(0, spec.itemBudget.limit - spec.itemBudget.used - 1)
    : requestedRepairs;
  const maxRepairs = Math.min(
    Math.max(0, Math.floor(requestedRepairs)),
    Math.max(0, Math.floor(budgetRepairs)),
  );
  const needsRepair = findings.length > 0 && !haltedNow();
  let repairs = 0;
  while (findings.length > 0 && !haltedNow() && repairs < maxRepairs) {
    const repair = await turnWithTimeout(harness, {
      ...request,
      // One in-session repair ask, rendered from the process-config prompt
      // template so repos can reword it; a bare status:done only delivers
      // when no verdict or decision is required.
      prompt: runtime.prompts.render("delivery-repair", {
        role: spec.target.role,
        deliverable,
        done_allowed: spec.expectation === "any" ? "true" : "false",
        findings: findings.map((f) => `- ${f}`).join("\n"),
        outcome_path: outcomePath,
      }),
      session,
    });
    repairs += 1;
    lastResult = repair;
    attempts = [...attempts, ...(repair.attempts ?? [])];
    stop = repair.stop;
    usage = addUsage(usage, repair.usage);
    session = repair.session ?? session;
    text = repair.text;
    assess(true);
  }
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
  const prices = runtime.configs.run.prices ?? {};
  const pricedAttempts: TurnAttempt[] = attempts.map((attempt) => ({
    ...attempt,
    usage: pricedUsage(attempt.usage, attempt.model.id, prices, {
      cachedPrefix,
    }).usage,
  }));
  const pricedTop = pricedUsage(usage, actualModel?.id, prices, {
    cachedPrefix,
  }).usage;
  const record = await started.finish({
    ...settled,
    promptBytes,
    ...(pack ? { packBytes: pack.bytes } : {}),
    ...(actualModel ? { model: actualModel } : {}),
    ...(cachedPrefix ? { cachedPrefix } : {}),
    stop,
    usage: pricedTop,
    ...(pricedAttempts.length > 0 ? { attempts: pricedAttempts } : {}),
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
      },
      "overflow",
    );
  }
  return { record, outcome: outcome ?? undefined, text };
}
