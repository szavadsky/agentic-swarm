import fs from "node:fs";
import path from "node:path";
import { runProcess } from "../proc.js";
import type { GateBaselineEntry } from "../artifacts.js";
import { tailCap, type CheckContext } from "./types.js";
import { appendJournal } from "../journal.js";

/** Marker embedded in gate details when the gate command timed out. */
export const GATE_TIMED_OUT_MARKER = "gate timed out";

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
    let finalStatus: "pass" | "fail" | "flaky" = "fail";
    let lastOutput = "";

    const startTime = Date.now();

    while (attempt <= retries) {
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

      lastOutput = (res.stdout + (res.stderr ? "\n" + res.stderr : "")).trim();

      if (res.timedOut) {
        timedOut = true;
        failedOnce = true;
        attempt++;
        continue;
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
    const details = timedOut
      ? `${lastOutput}\n[${GATE_TIMED_OUT_MARKER} after ${timeoutSec}s]`.trim()
      : lastOutput;
    results.push({
      id: gate.id,
      command: gate.command,
      status: finalStatus,
      durationMs,
      details: tailCap(details, ctx.outputBytes),
    });

    // Ratchet evaluation:
    if (finalStatus === "fail") {
      if (opts?.record) {
        overallOk = false;
      } else if (ctx.baseline) {
        const baseEntry = ctx.baseline.gates.find((g) => g.id === gate.id);
        const wasGreen = baseEntry ? baseEntry.status === "pass" : false;
        if (wasGreen) {
          overallOk = false;
        }
        // Non-baseline-green gate: reported in results but does not fail overallOk
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
