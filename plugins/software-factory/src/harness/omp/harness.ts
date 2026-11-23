import fs from "node:fs";
import type { RetryPolicy } from "../fallback.js";
import { runWithFallbacks } from "../fallback.js";
import type {
  Caps,
  CompactResult,
  Harness,
  ModelProbe,
  ModelRef,
  SessionRef,
  TurnAttempt,
  TurnRequest,
  TurnResult,
} from "../types.js";
import { actualModel, OmpRuntime } from "./runtime.js";
import { runOmpTurn } from "./turn.js";
import { isOmpAlias, OMP_ID, type OmpHarnessOptions } from "./types.js";

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

  async caps(_model: ModelRef): Promise<Caps> {
    return {
      resume: true,
      compact: "server",
      subagents: (await this.runtime.supportsSteering()) ? "steer" : "spawn",
      structuredOutput: "none",
      usage: { cache: true, cost: true },
    };
  }

  /** Answers from `models --json`, alias names resolved against the CLI. */
  async probe(model: ModelRef): Promise<ModelProbe> {
    const models = await this.runtime.models();
    if (isOmpAlias(model.id)) return aliasProbe(models);
    const found = models.find((entry) => matchesId(entry, model.id));
    if (found) return foundProbe(found);
    const selectors = new Set<string>();
    for (const entry of models) {
      if (entry.selector) selectors.add(entry.selector);
      if (entry.provider && entry.id)
        selectors.add(`${entry.provider}/${entry.id}`);
      if (entry.id) selectors.add(entry.id);
    }
    return {
      listed: false,
      available: [...selectors].sort((a, b) => a.localeCompare(b)),
      effort: null,
    };
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const result = await runWithFallbacks({
      primary: req.model,
      fallbacks: req.fallbacks,
      retry: this.retry,
      pool: req.pool,
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

type ModelEntry = Awaited<ReturnType<OmpRuntime["models"]>>[number];

function matchesId(entry: ModelEntry, id: string): boolean {
  return (
    entry.selector === id ||
    `${entry.provider}/${entry.id}` === id ||
    entry.id === id
  );
}

/**
 * An alias's effort surface from the CLI alone: `models --json` has no
 * per-alias list, so the alias accepts the union of every catalogued list
 * (plus `auto`, the enum level no model list carries).
 */
function aliasProbe(models: readonly ModelEntry[]): ModelProbe {
  const union = new Set<string>();
  for (const entry of models) {
    if (Array.isArray(entry.thinking)) {
      for (const level of entry.thinking) union.add(level);
    }
  }
  union.add("auto");
  return {
    listed: true,
    available: [],
    effort: [...union].sort((a, b) => a.localeCompare(b)),
  };
}

function foundProbe(found: ModelEntry): ModelProbe {
  if (!Array.isArray(found.thinking)) {
    return { listed: true, available: [], effort: null };
  }
  // The CLI parses `--thinking auto` for every model even though no
  // per-model list carries it.
  const levels = new Set<string>(found.thinking);
  levels.add("auto");
  return {
    listed: true,
    available: [],
    effort: [...levels].sort((a, b) => a.localeCompare(b)),
  };
}
