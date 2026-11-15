import path from "node:path";
import { type RetryPolicy, runWithFallbacks } from "../fallback.js";
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
import { findModel, OpencodeApi } from "./api.js";
import { runOpencodeTurn } from "./turn.js";
import type { OpencodeHarnessOptions, OpencodeRuntime } from "./types.js";

export type { OpencodeHarnessOptions } from "./types.js";

/**
 * opencode adapter: `opencode run --auto --archived --format json`, resume by
 * `-s`, compaction through the local API, transcript exported per turn.
 */
export class OpencodeHarness implements Harness {
  readonly id = "opencode";
  private readonly runtime: OpencodeRuntime;
  private readonly retry: Partial<RetryPolicy>;
  private modelsCache?: Promise<any[]>;

  constructor(opts: OpencodeHarnessOptions) {
    const binary =
      opts.binary ??
      process.env.OPENCODE_PATH ??
      Bun.which("opencode") ??
      "opencode";
    this.runtime = {
      binary,
      sessionDir: path.resolve(opts.sessionDir),
      api: new OpencodeApi(binary),
    };
    this.retry = opts.retry ?? {};
  }

  async caps(model: ModelRef): Promise<Caps> {
    const entry = findModel(await this.models(), model.id);
    return {
      resume: true,
      compact: "server",
      subagents: "spawn",
      structuredOutput: "none",
      effort: Array.isArray(entry?.variants) ? [...entry.variants] : [],
      usage: { cache: true, cost: true },
    };
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const result = await runWithFallbacks({
      primary: req.model,
      fallbacks: req.fallbacks,
      retry: this.retry,
      run: async (model) => {
        const value = await runOpencodeTurn(this.runtime, req, model);
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
      throw new Error(
        `OpencodeHarness cannot compact a ${ref.harness} session`,
      );
    }
    await this.runtime.api.compact(ref.id, ref.cwd);
    // No usage: the local API reports no tokens or cost for the call.
    return {
      session: {
        ...ref,
        compacted: true,
        lastRequestStartedAt: new Date().toISOString(),
      },
    };
  }

  private models(): Promise<any[]> {
    if (!this.modelsCache) {
      this.modelsCache = this.runtime.api.models(process.cwd());
      this.modelsCache.catch(() => {
        this.modelsCache = undefined;
      });
    }
    return this.modelsCache;
  }
}
