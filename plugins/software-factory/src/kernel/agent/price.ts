/** Pricing and closing the turn's record. */

import type { ModelRef, TurnResult } from "../../harness/types.js";
import { makeCause } from "../cause.js";
import { launchKindOf } from "../metrics.js";
import { loadPriceTable } from "../openrouter.js";
import { failedOutcome } from "../outcome.js";
import { pricedServed, pricedUsage } from "../pricing.js";
import { appendPark } from "../record.js";
import { statusSource, writeStatus } from "../status.js";
import type { LaunchKind, RecordEnd } from "../types.js";
import type { AgentTurnResult, AgentTurnState, TurnPricing } from "./types.js";
import { isHalted, overflowed } from "./chain.js";

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
    ...(state.asks.length > 0 ? { asks: state.asks } : {}),
    ...(repairFindingsResolved ? { repairFindingsResolved: true } : {}),
    ...(launchKind ? { launchKind } : {}),
    ...(state.lastResult.transcript
      ? { transcript: state.lastResult.transcript }
      : {}),
    session: settled.session ?? state.session,
    outcome: state.outcome ?? undefined,
  };
}

export async function finalizeTurn(
  state: AgentTurnState,
): Promise<AgentTurnResult> {
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
