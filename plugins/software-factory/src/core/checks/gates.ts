import { runProcess } from "../proc.js";
import type { GateBaselineEntry } from "../artifacts.js";
import type { CheckContext } from "./types.js";

/**
 * Runs infrastructure verification gates.
 * Invariants:
 * - Ratchet: Any gate that was "pass" (green) in baseline must stay green.
 * - Retries: Failed gates are retried up to limits.gateRetries. Gates that pass on retry are marked "flaky".
 * - Resilience: Non-baseline-green gates are reported in results but do not fail the check.
 */
export async function runGates(
  ctx: CheckContext,
  opts?: { record?: boolean }
): Promise<{ results: GateBaselineEntry[]; ok: boolean }> {
  if (!ctx.infra?.gates || ctx.infra.gates.length === 0) {
    return { results: [], ok: true };
  }

  const retries = ctx.limits.gateRetries ?? 0;
  const results: GateBaselineEntry[] = [];
  let overallOk = true;

  for (const gate of ctx.infra.gates) {
    let attempt = 0;
    let passedOnce = false;
    let failedOnce = false;
    let finalStatus: "pass" | "fail" | "flaky" = "fail";
    let lastOutput = "";

    const startTime = Date.now();

    while (attempt <= retries) {
      const res = await runProcess({
        cmd: gate.command,
        cwd: ctx.wt,
        timeoutSec: (ctx.limits["gateTimeoutSec"] as number | undefined) ?? 60,
      });

      lastOutput = (res.stdout + (res.stderr ? "\n" + res.stderr : "")).trim();

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
    results.push({
      id: gate.id,
      command: gate.command,
      status: finalStatus,
      durationMs,
      details: lastOutput,
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
