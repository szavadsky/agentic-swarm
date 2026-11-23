/**
 * Zero-usage, zero-output turns are technical glitches: a launch class the
 * chain retries or fails over, never a reminder, never waste.
 */

import type { Stop, Usage } from "../harness/types.js";
import { reportsUsage } from "../harness/usage.js";

/** A stop that names a real failure: genuine infra, refusal, truncation. */
function namesFailure(stop: Stop | undefined): boolean {
  if (stop === undefined || stop.kind === "done") return false;
  if (stop.kind === "infra") return stop.cause !== "glitch";
  return true;
}

/**
 * A glitch turn: zero reported usage, no outcome, no edits, and the stop
 * names no real failure. A turn that wrote an outcome is not a glitch even
 * at zero usage — a harness that never reports usage can still deliver;
 * its work is not a glitch. A stop naming a genuine infra
 * cause (quota, network, auth, crash, timeout, overflow, rate) or a
 * model-side refusal/truncation keeps its own classification.
 */
export function isGlitchTurn(rec: {
  usage?: Usage;
  outcome?: unknown;
  edits?: { files?: number };
  stop?: Stop;
}): boolean {
  if (rec.outcome !== undefined) return false;
  if (rec.edits !== undefined && (rec.edits.files ?? 0) > 0) return false;
  if (rec.usage === undefined || reportsUsage(rec.usage)) return false;
  return !namesFailure(rec.stop);
}
