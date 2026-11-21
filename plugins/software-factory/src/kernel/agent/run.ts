/** The agent turn entry point. */

import { statusSource, writeStatus } from "../status.js";
import type { KernelRuntime } from "../types.js";
import type { AgentTurnResult, AgentTurnSpec } from "./types.js";
import {
  assessTurn,
  repairLoop,
  retryOverflow,
  startTurnState,
} from "./turn.js";
import { finalizeTurn } from "./price.js";

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
