/** The chain's accumulated result: attempts, usage, served splits and the no-live-tier cause. */

import type { TurnResult } from "../../harness/types.js";
import { addUsage, reportsUsage, zeroUsage } from "../../harness/usage.js";
import { noLiveTierCause } from "../flow-context.js";
import type { KernelRuntime } from "../types.js";
import type { AgentTurnSpec, ChainResult, ChainState } from "./types.js";

export function absorbChainCall(
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

/**
 * The turn no longer has a live tier: every pool latched after the target was
 * resolved. No harness call may run; the record carries the same cause the
 * resolver would have named.
 */
function noLiveTierResult(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
): TurnResult {
  return {
    stop: {
      kind: "infra",
      cause: "unavailable",
      details: noLiveTierCause(runtime, spec.target.alias, spec.target.tiers),
    },
    text: "",
    usage: zeroUsage(),
    model: spec.target.model,
    attempts: [],
  };
}

/** The chain's result, with the no-live-tier cause when no tier ran. */
export function chainOutcome(
  runtime: KernelRuntime,
  spec: AgentTurnSpec,
  state: ChainState,
  index: number,
  result: TurnResult | undefined,
): ChainResult {
  if (result === undefined) {
    result = noLiveTierResult(runtime, spec);
    absorbChainCall(state, result, spec.target.harness.id);
  }
  return {
    result,
    endIndex: index,
    attempts: state.attempts,
    usage: state.usage!,
    ...(state.servedOpen && state.served.length > 0
      ? { served: state.served }
      : {}),
  };
}
