import fs from "node:fs";
import path from "node:path";
import { runProcess } from "../proc.js";
import type { GateBaselineEntry } from "../artifacts.js";
import { tailCap, type CheckContext } from "./types.js";
import { appendJournal } from "../journal.js";
import { git } from "../git/exec.js";
import type { StatusEntry } from "../git/status.js";

/** Marker embedded in gate details when the gate command timed out. */
export const GATE_TIMED_OUT_MARKER = "gate timed out";

export interface WorktreeSnapshot {
  entries: StatusEntry[];
  map: Map<string, string>;
  raw: string;
}

export interface WorktreeMutation {
  mutatesWorktree: boolean;
  trackedChanged: string[];
  untrackedCreated: string[];
  message?: string;
}

/**
 * Snapshots current worktree status using `git status --porcelain -z --untracked-files=all`.
 */
export async function snapshotWorktree(wt: string): Promise<WorktreeSnapshot> {
  const res = await git(wt, ["status", "--porcelain", "-z", "--untracked-files=all"], {
    allowFail: true,
  });
  const raw = res.stdout ?? "";
  const entries: StatusEntry[] = [];
  if (raw.length > 0) {
    const tokens = raw.split("\0");
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token === undefined || token === "") {
        i++;
        continue;
      }
      const code = token.slice(0, 2);
      const entryPath = token.slice(3);
      if (code[0] === "R" || code[0] === "C") {
        const from = tokens[i + 1] ?? "";
        entries.push({ code, path: entryPath, from });
        i += 2;
      } else {
        entries.push({ code, path: entryPath });
        i++;
      }
    }
  }
  const map = new Map<string, string>();
  for (const e of entries) {
    map.set(e.path, e.code);
  }
  return { entries, map, raw };
}

/**
 * Compares current worktree against snapshot. If changed, restores it exactly:
 * - Tracked files: reset and checkout from HEAD
 * - Untracked created by command: remove
 */
export async function checkAndRestoreWorktreeMutation(
  wt: string,
  snapshot: WorktreeSnapshot
): Promise<WorktreeMutation> {
  const currentSnapshot = await snapshotWorktree(wt);

  if (currentSnapshot.raw === snapshot.raw) {
    return {
      mutatesWorktree: false,
      trackedChanged: [],
      untrackedCreated: [],
    };
  }

  const untrackedCreated: string[] = [];
  const trackedChanged: string[] = [];

  for (const [pathKey, code] of currentSnapshot.map.entries()) {
    if (pathKey.endsWith("journal.ndjson") || pathKey === "journal.ndjson") {
      continue;
    }
    if (code === "??") {
      if (!snapshot.map.has(pathKey)) {
        untrackedCreated.push(pathKey);
      }
    } else {
      const prevCode = snapshot.map.get(pathKey);
      if (prevCode !== code) {
        trackedChanged.push(pathKey);
      }
    }
  }

  // Check if any tracked file in snapshot was removed
  for (const [prevPath, prevCode] of snapshot.map.entries()) {
    if (!currentSnapshot.map.has(prevPath)) {
      if (prevCode !== "??") {
        trackedChanged.push(prevPath);
      }
    }
  }

  const mutatesWorktree = untrackedCreated.length > 0 || trackedChanged.length > 0;

  if (!mutatesWorktree) {
    return {
      mutatesWorktree: false,
      trackedChanged: [],
      untrackedCreated: [],
    };
  }

  // Restore untracked created by the gate/check: remove
  for (const relPath of untrackedCreated) {
    const fullPath = path.join(wt, relPath);
    try {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
      let dir = path.dirname(fullPath);
      while (dir !== wt && dir.startsWith(wt)) {
        try {
          await fs.promises.rmdir(dir);
          dir = path.dirname(dir);
        } catch {
          break;
        }
      }
    } catch {}
  }

  // Restore tracked: checkout
  for (const relPath of trackedChanged) {
    await git(wt, ["reset", "HEAD", "--", relPath], { allowFail: true });
    await git(wt, ["checkout", "HEAD", "--", relPath], { allowFail: true });
  }

  const parts: string[] = [];
  if (trackedChanged.length > 0) {
    parts.push(`modified tracked files (${trackedChanged.join(", ")})`);
  }
  if (untrackedCreated.length > 0) {
    parts.push(`created untracked files (${untrackedCreated.join(", ")})`);
  }

  const message = `Worktree mutation detected: command ${parts.join(" and ")}; worktree restored.`;

  return {
    mutatesWorktree: true,
    trackedChanged,
    untrackedCreated,
    message,
  };
}

/**
 * Runs infrastructure verification gates.
 * Invariants:
 * - Ratchet: Any gate that was "pass" (green) in baseline must stay green.
 * - Retries: Failed gates are retried up to limits.gateRetries. Gates that pass on retry are marked "flaky".
 * - Resilience: Non-baseline-green gates are reported in results but do not fail the check.
 * - Timeouts: every attempt is bounded by limits.gateTimeoutSec (default 900s); a
 *   timeout fails the attempt and is reported distinctly in details.
 */
export async function runGates(
  ctx: CheckContext,
  opts?: { record?: boolean }
): Promise<{ results: GateBaselineEntry[]; ok: boolean }> {
  if (!ctx.infra?.gates || ctx.infra.gates.length === 0) {
    return { results: [], ok: true };
  }

  const retries = ctx.limits.gateRetries ?? 0;
  const rawTimeout = ctx.limits.gateTimeoutSec as number | undefined;
  const timeoutSec = typeof rawTimeout === "number" && rawTimeout > 0 ? rawTimeout : 900;
  const results: GateBaselineEntry[] = [];
  let overallOk = true;

  for (const gate of ctx.infra.gates) {
    let attempt = 0;
    let passedOnce = false;
    let failedOnce = false;
    let timedOut = false;
    let mutatesWorktree = false;
    let finalStatus: "pass" | "fail" | "flaky" = "fail";
    let lastOutput = "";
    let mutationMessage = "";

    const startTime = Date.now();

    while (attempt <= retries) {
      const snapshot = await snapshotWorktree(ctx.wt);

      let res = await runProcess({
        cmd: gate.command,
        cwd: ctx.wt,
        timeoutSec,
        maxOutputBytes: ctx.outputBytes,
      });
      if ((res.timedOut || res.code !== 0) && res.suspendDetected) {
        const taskDir =
          ctx.taskDir ??
          (ctx.task && ctx.taskWt
            ? path.join(ctx.taskWt, ctx.project.orchestrationFolder ?? ".factory", ctx.task)
            : undefined);
        if (taskDir && fs.existsSync(taskDir)) {
          try {
            await appendJournal(taskDir, {
              type: "system_suspend_detected",
              task: ctx.task,
              gate: gate.id,
              gapMs: Math.round(res.suspendGapMs ?? 0),
            });
          } catch {}
        }
        // Interrupted by suspend: re-run once without recording failure or consuming attempt
        res = await runProcess({
          cmd: gate.command,
          cwd: ctx.wt,
          timeoutSec,
          maxOutputBytes: ctx.outputBytes,
        });
      }

      // Check mutation guard after gate run
      const mutation = await checkAndRestoreWorktreeMutation(ctx.wt, snapshot);
      if (mutation.mutatesWorktree) {
        mutatesWorktree = true;
        mutationMessage = mutation.message ?? "Gate mutated the worktree";

        const taskDir =
          ctx.taskDir ??
          (ctx.task && ctx.taskWt
            ? path.join(ctx.taskWt, ctx.project.orchestrationFolder ?? ".factory", ctx.task)
            : undefined);
        if (taskDir && fs.existsSync(taskDir)) {
          try {
            await appendJournal(taskDir, {
              type: "worktree_mutation_detected",
              task: ctx.task,
              gate: gate.id,
              command: gate.command,
              tracked: mutation.trackedChanged,
              untracked: mutation.untrackedCreated,
              summary: mutationMessage,
            });
          } catch {}
        }
      }

      lastOutput = (res.stdout + (res.stderr ? "\n" + res.stderr : "")).trim();

      if (res.timedOut) {
        timedOut = true;
        failedOnce = true;
        attempt++;
        continue;
      }

      if (mutatesWorktree) {
        failedOnce = true;
        finalStatus = "fail";
        break;
      }

      if (res.code === 0) {
        passedOnce = true;
        finalStatus = failedOnce ? "flaky" : "pass";
        break;
      } else {
        failedOnce = true;
        attempt++;
      }
    }

    if (!passedOnce) {
      finalStatus = "fail";
    }

    const durationMs = Date.now() - startTime;
    let details = timedOut
      ? `${lastOutput}\n[${GATE_TIMED_OUT_MARKER} after ${timeoutSec}s]`.trim()
      : lastOutput;

    if (mutatesWorktree) {
      details = `${details}\n[${mutationMessage}]`.trim();
    }

    results.push({
      id: gate.id,
      command: gate.command,
      status: finalStatus,
      durationMs,
      details: tailCap(details, ctx.outputBytes),
      ...(mutatesWorktree ? { mutatesWorktree: true } : {}),
    });

    // Ratchet evaluation:
    if (finalStatus === "fail" || mutatesWorktree) {
      if (opts?.record) {
        overallOk = false;
      } else if (ctx.baseline) {
        const baseEntry = ctx.baseline.gates.find((g) => g.id === gate.id);
        const wasGreen = baseEntry ? baseEntry.status === "pass" : false;
        if (wasGreen || mutatesWorktree) {
          overallOk = false;
        }
        // Non-baseline-green gate: reported in results but does not fail overallOk unless mutatesWorktree
      } else {
        // No baseline: any failure fails
        overallOk = false;
      }
    }
  }

  return { results, ok: overallOk };
}

/** True when a gate result entry recorded a command timeout. */
export function gateTimedOut(entry: GateBaselineEntry): boolean {
  return !!entry.details?.includes(GATE_TIMED_OUT_MARKER);
}
