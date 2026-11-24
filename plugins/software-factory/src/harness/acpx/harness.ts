import path from "node:path";
import { promptGroupIsLive, waitForPromptGroupExit } from "./liveness.js";
import { type RetryPolicy, runWithFallbacks } from "../fallback.js";
import type {
  Caps,
  CompactResult,
  Harness,
  ModelRef,
  ModelProbe,
  SessionRef,
  TurnAttempt,
  TurnRequest,
  TurnResult,
} from "../types.js";
import { resolveAcpxCommand } from "./command.js";
import { acpxArgs, acpxEnv } from "./options.js";
import { probeAcpxModel } from "./probe.js";
import {
  type AcpxRuntime,
  readAcpxSessionUsage,
  runAcpxCommand,
  runAcpxTurn,
} from "./turn.js";
import { turnUsageFromTotals } from "./usage.js";
import type { AcpxHarnessOptions, AcpxTurnSummary } from "./types.js";

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

  /** Whether the prompt child recorded for this session still has a live group. */
  isLive(session?: SessionRef): boolean {
    return promptGroupIsLive(this.runtime.activePids, session);
  }

  /** Polls the session's prompt group until it exits or the caller's bound ends. */
  async waitExit(session?: SessionRef, timeoutMs = 0): Promise<void> {
    await waitForPromptGroupExit(this.runtime.activePids, session, timeoutMs);
  }

  async caps(_model: ModelRef): Promise<Caps> {
    return {
      resume: true,
      compact: this.runtime.acpx.compact === true ? "server" : "none",
      subagents: "none",
      structuredOutput: "none",
      // ACP carries cost on `usage_update`; a silent agent leaves it unknown.
      usage: { cache: this.runtime.acpx.usage?.cache ?? false, cost: true },
    };
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const result = await runWithFallbacks({
      primary: req.model,
      fallbacks: req.fallbacks,
      retry: this.retry,
      pool: req.pool,
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

  /** Opens one no-prompt ACP session and reads that model's live options. */
  async probe(model: ModelRef): Promise<ModelProbe> {
    return await probeAcpxModel(this.runtime, this.runtime.acpx, model);
  }

  /**
   * Session-end compaction over acpx's `/compact` adapter command. ACP has no
   * compaction method, so the command must be the whole prompt; the config flag
   * only marks agents verified to accept it (config/acpx-verify.md). A small
   * session answers ACP -32603 "Nothing to compact" and stays usable.
   * Every other failure throws, and the kernel's `compactSession` contains it
   * so the turn that ended still settles with the uncompacted ref.
   */
  async compact(ref: SessionRef): Promise<CompactResult> {
    if (ref.harness !== this.id) {
      throw new Error(`AcpxHarness cannot compact a ${ref.harness} session`);
    }
    const config = this.runtime.acpx;
    if (config.compact !== true) {
      throw new Error(
        `acpx harness "${this.id}" is not configured for compaction`,
      );
    }
    const result = await runAcpxCommand(this.runtime, config, ref, "/compact");
    const error = result.summary.errors.at(-1);
    if (error) {
      const details = [error.message, error.data?.details]
        .filter((part) => part !== undefined && part !== null && part !== "")
        .join(" ");
      if (/nothing to compact/i.test(details)) return { session: ref };
      throw new Error(`acpx compact failed: ${details || "unknown ACP error"}`);
    }
    if (result.aborted) throw new Error("acpx compact was aborted");
    if (result.timedOut) throw new Error("acpx compact timed out");
    if (result.code !== 0) {
      const stderr = result.stderr.trim().slice(-500);
      throw new Error(
        `acpx compact exited ${result.code ?? "without a code"}` +
          (stderr ? `: ${stderr}` : ""),
      );
    }
    requireCompacted(result.summary);
    const compacted: SessionRef = {
      ...ref,
      lastRequestStartedAt: new Date().toISOString(),
      compacted: true,
    };
    // The usage command's totals are cumulative, so the compaction's own tokens
    // sit between the baseline recorded on the ref and the next turn. Refresh
    // it here (no model turn) and report the delta as the compaction's spend.
    const cumulative = await readAcpxSessionUsage(this.runtime, config, ref);
    if (!cumulative) return { session: compacted };
    const session = { ...compacted, cumulativeUsage: cumulative };
    if (!ref.cumulativeUsage) return { session };
    return {
      session,
      usage: turnUsageFromTotals(cumulative, ref.cumulativeUsage),
    };
  }
}

/** A completed slash command, not a cancelled or refused prompt, is a compaction. */
function requireCompacted(summary: AcpxTurnSummary): void {
  if (summary.stopReason === "end_turn") return;
  throw new Error(
    `acpx compact stopped at "${summary.stopReason ?? "no stop reason"}"`,
  );
}

function runtimeOf(opts: AcpxHarnessOptions): AcpxRuntime {
  return {
    id: opts.id,
    command: resolveAcpxCommand(opts.binary),
    sessionDir: path.resolve(opts.sessionDir),
    envAllowlist: opts.envAllowlist,
    retention: opts.retention,
    activePids: new Map<string, number>(),
    // The entry's opaque options win over the structured block; the adapter
    // reads only `args` and `env` from the result.
    acpx: {
      ...opts.acpx,
      args: acpxArgs(opts.options?.args),
      env: acpxEnv(opts.options?.env),
    },
  };
}
