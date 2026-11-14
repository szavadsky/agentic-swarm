import { runWithFallbacks, type RetryPolicy } from "../fallback.js";
import type {
  Caps,
  Harness,
  ModelRef,
  TurnAttempt,
  TurnRequest,
  TurnResult,
} from "../types.js";
import { resolveAcpxCommand, resolveAgyBinary } from "./command.js";
import { runAcpxTurn } from "./turn.js";
import { ACPX_EFFORT, type AcpxAgent, type AcpxHarnessOptions } from "./types.js";

export type { AcpxAgent, AcpxHarnessOptions } from "./types.js";

/**
 * pi, codex and agy through acpx: one named acpx session per turn chain, model
 * via the global flag, effort via the per-agent session config option (agy
 * carries it in the model id, which the adapter splits). opencode and omp keep
 * native adapters because acpx's built-in opencode route resolves the wrong
 * version (probe §0).
 */
export class AcpxHarness implements Harness {
  readonly id: AcpxAgent;
  private readonly runtime: ReturnType<typeof runtimeOf>;
  private readonly retry: Partial<RetryPolicy>;

  constructor(opts: AcpxHarnessOptions) {
    this.id = opts.agent;
    this.runtime = runtimeOf(opts);
    this.retry = opts.retry ?? {};
  }

  async caps(_model: ModelRef): Promise<Caps> {
    const effort = ACPX_EFFORT[this.id];
    return {
      resume: true,
      compact: "none",
      fork: false,
      subagents: "none",
      structuredOutput: "none",
      effort: [...effort.levels],
      usage: { cache: this.id === "codex" || this.id === "agy", cost: false },
    };
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const result = await runWithFallbacks({
      primary: req.model,
      fallbacks: req.fallbacks,
      retry: this.retry,
      run: async (model) => {
        const value = await runAcpxTurn(this.runtime, req, model);
        return { stop: value.stop, usage: value.usage, value, attempts: value.attempts };
      },
    });

    const value = result.outcome.value;
    const attempts: TurnAttempt[] = result.attempts;
    return { ...value, attempts };
  }
}

function runtimeOf(opts: AcpxHarnessOptions) {
  return {
    agent: opts.agent,
    command: resolveAcpxCommand(opts.binary),
    agyBinary: resolveAgyBinary(opts.agyBinary),
  };
}
