import fs from "node:fs";
import type { RetryPolicy } from "../fallback.js";
import { runWithFallbacks } from "../fallback.js";
import type {
  Caps,
  CompactResult,
  Harness,
  ModelRef,
  SessionRef,
  TurnAttempt,
  TurnRequest,
  TurnResult,
} from "../types.js";
import { actualModel, OmpRuntime } from "./runtime.js";
import { runOmpTurn } from "./turn.js";
import { OMP_ID, type OmpHarnessOptions } from "./types.js";

export type { OmpHarnessOptions } from "./types.js";

/**
 * omp adapter (LOG D7): one RPC process per turn, explicit `compact`, resume by
 * SessionRef, per-launch overlay. Retries/fallbacks come from the shared policy.
 */
export class OmpHarness implements Harness {
  readonly id = OMP_ID;
  private readonly runtime: OmpRuntime;
  private readonly retry: Partial<RetryPolicy>;

  constructor(opts: OmpHarnessOptions) {
    this.runtime = new OmpRuntime(opts);
    this.retry = opts.retry ?? {};
  }

  async caps(model: ModelRef): Promise<Caps> {
    const models = await this.runtime.models();
    const found = models.find(
      (entry) =>
        entry.selector === model.id ||
        `${entry.provider}/${entry.id}` === model.id,
    );
    return {
      resume: true,
      compact: "server",
      subagents: (await this.runtime.supportsSteering()) ? "steer" : "spawn",
      structuredOutput: "none",
      effort: Array.isArray(found?.thinking) ? [...found.thinking] : [],
      usage: { cache: true, cost: true },
    };
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const result = await runWithFallbacks({
      primary: req.model,
      fallbacks: req.fallbacks,
      retry: this.retry,
      run: async (model) => {
        const value = await runOmpTurn(this.runtime, req, model);
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

  async compact(ref: SessionRef): Promise<CompactResult> {
    if (ref.harness !== this.id) {
      throw new Error(`OmpHarness cannot compact a ${ref.harness} session`);
    }
    const dirs = this.runtime.dirs();
    const overlayPath = await this.runtime.overlay();
    const home = ref.dir && fs.existsSync(ref.dir) ? ref.dir : dirs.sessions;
    const rpc = await this.runtime.launch(
      ref.model,
      ref.cwd,
      overlayPath,
      home,
      ref.id,
      [],
    );
    try {
      const response = await rpc.request("compact", {}, 180_000);
      if (!response.success) {
        const message = String(response.error ?? "unknown error");
        if (/nothing to compact/i.test(message)) return { session: ref };
        throw new Error(`omp compact failed: ${message}`);
      }
      const state = await rpc
        .request("get_state", {}, 10_000)
        .catch(() => undefined);
      // No usage: the RPC reports no tokens or cost for the compaction call.
      return {
        session: {
          ...ref,
          lastRequestStartedAt: new Date().toISOString(),
          compacted: true,
          model: actualModel(state?.data, ref.model),
        },
      };
    } finally {
      await rpc.close(2_000);
    }
  }
}
