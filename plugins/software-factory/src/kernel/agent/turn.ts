/** Preparing, assessing and repairing one agent turn. */

import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { ServedUsage, Usage } from "../../harness/types.js";
import { addUsage, reportsUsage } from "../../harness/usage.js";
import { missingPlanFinding, snapshotPlan } from "../architect-session.js";
import {
  OutcomeInvalidError,
  readDeliveredOutcome,
  validateExpectation,
} from "../outcome.js";
import type { OutcomeSource } from "../outcome.js";
import { outcomeRepairSchemaVar } from "../prompt-schema.js";
import { DEFAULT_TIMEOUTS, outcomeSchema } from "../types.js";
import type { KernelRuntime, TurnRecord } from "../types.js";
import type {
  AgentTurnSpec,
  AgentTurnState,
  TurnPreparation,
} from "./types.js";
import {
  OUTCOME_SETTLE_MS,
  callChain,
  deliverableOf,
  isHalted,
  measurePack,
  mergeServed,
  missingOutcomeFinding,
  overflowed,
} from "./chain.js";

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

export async function startTurnState(
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
export async function retryOverflow(state: AgentTurnState): Promise<void> {
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

export async function assessTurn(
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
export async function repairLoop(state: AgentTurnState): Promise<void> {
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
