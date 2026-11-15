import { type RetryPolicy, runWithFallbacks } from "../fallback.js";
import type {
  Caps,
  Harness,
  ModelRef,
  TurnAttempt,
  TurnRequest,
  TurnResult,
} from "../types.js";
import { resolveAcpxCommand } from "./command.js";
import { runAcpxTurn } from "./turn.js";
import type { AcpxHarnessOptions } from "./types.js";

export type { AcpxHarnessOptions } from "./types.js";

/**
 * One named acpx session per turn chain, model via the global flag, effort via
 * the session config option; a run-config suffix map splits effort out of the
 * model id. opencode and omp keep native adapters because acpx's built-in
 * opencode route resolves the wrong version (probe §0).
 */
export class AcpxHarness implements Harness {
  readonly id: string;
  private readonly runtime: ReturnType<typeof runtimeOf>;
  private readonly retry: Partial<RetryPolicy>;

  constructor(opts: AcpxHarnessOptions) {
    this.id = opts.id;
    this.runtime = runtimeOf(opts);
    this.retry = opts.retry ?? {};
  }

  async caps(_model: ModelRef): Promise<Caps> {
    return {
      resume: true,
      compact: "none",
      subagents: "none",
      structuredOutput: "none",
      effort: [...(this.runtime.acpx.effort?.levels ?? [])],
      usage: { cache: this.runtime.acpx.usage?.cache ?? false, cost: false },
    };
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const result = await runWithFallbacks({
      primary: req.model,
      fallbacks: req.fallbacks,
      retry: this.retry,
      run: async (model) => {
        const value = await runAcpxTurn(this.runtime, req, model);
        return {
          stop: value.stop,
          usage: value.usage,
          value,
          attempts: value.attempts,
        };
      },
    });

    const value = result.outcome.value;
    const attempts: TurnAttempt[] = result.attempts;
    return { ...value, attempts };
  }
}

function runtimeOf(opts: AcpxHarnessOptions) {
  return {
    id: opts.id,
    command: resolveAcpxCommand(opts.binary),
    acpx: opts.acpx,
  };
}
