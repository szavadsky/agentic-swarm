import { runProcess } from "../proc.js";
import { tailCap } from "./types.js";

/**
 * Dependency/bootstrap setup for a worktree before verification gates (§9).
 *
 * Every item/merge runs in its own git worktree. A fresh worktree has no
 * installed dependencies (no `node_modules`, no `.venv`), so a gate such as
 * `bun --cwd=... run typecheck` fails with an environment error
 * (`TS2688: Cannot find type definition file for 'bun'`) that says nothing
 * about the item's diff — the wave-1-merge class where every spike died
 * terminally on gates it could not influence. The project declares its setup
 * in `infra.setup` (e.g. `bun install`, `uv sync`); run those commands in the
 * worktree before running gates.
 *
 * Runs sequentially, stops at the first failure, and never throws: callers
 * decide whether an environment failure fails the merge/check. No caching —
 * setup commands are idempotent by contract, and a stale cache would validate
 * gates against dependencies that no longer match the tree.
 */
export interface SetupResult {
  ok: boolean;
  /** Commands declared (possibly empty). */
  commands: string[];
  /** Commands that ran to success before any failure. */
  ran: string[];
  durationMs: number;
  /** First failing command, when ok=false. */
  failedCommand?: string;
  /** Timed-out/failure detail, when ok=false. */
  error?: string;
}

export async function runWorktreeSetup(opts: {
  commands: string[];
  cwd: string;
  timeoutSec?: number;
  outputBytes?: number;
}): Promise<SetupResult> {
  const commands = (opts.commands ?? []).filter((c) => typeof c === "string" && c.trim().length > 0);
  const timeoutSec = opts.timeoutSec && opts.timeoutSec > 0 ? opts.timeoutSec : 900;
  const outputBytes = opts.outputBytes && opts.outputBytes > 0 ? opts.outputBytes : 4096;
  const ran: string[] = [];
  const start = Date.now();

  for (const cmd of commands) {
    const res = await runProcess({
      cmd,
      cwd: opts.cwd,
      timeoutSec,
      maxOutputBytes: outputBytes,
    });
    if (res.timedOut) {
      return {
        ok: false,
        commands,
        ran,
        durationMs: Date.now() - start,
        failedCommand: cmd,
        error: `setup command timed out after ${timeoutSec}s: ${cmd}`,
      };
    }
    if (res.code !== 0) {
      const out = tailCap(`${res.stdout}\n${res.stderr}`.trim(), 1000);
      return {
        ok: false,
        commands,
        ran,
        durationMs: Date.now() - start,
        failedCommand: cmd,
        error: `setup command failed with exit code ${res.code}: ${cmd}${out ? `\n${out}` : ""}`,
      };
    }
    ran.push(cmd);
  }

  return { ok: true, commands, ran, durationMs: Date.now() - start };
}
