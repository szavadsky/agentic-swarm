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
 * model id. omp keeps a native adapter; every other harness is a route here.
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
      // ACP carries cost on `usage_update`; a silent agent leaves it unknown.
      usage: { cache: this.runtime.acpx.usage?.cache ?? false, cost: true },
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
