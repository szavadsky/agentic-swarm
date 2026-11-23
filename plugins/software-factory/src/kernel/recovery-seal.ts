/** The bare-crash predicate shared by launch recovery and the task turn count. */

import type { StepRecord } from "./types.js";

/**
 * A record recovery sealed after a hard death (SIGKILL, reboot, second signal):
 * a bare `infra: crash` with nothing the turn itself reported. A harness turn
 * that reported a crash carries its usage and prompt bytes; a throwing action
 * recorded by dispatch carries a cause and details. Only the bare seal counts
 * as an interruption; a reported crash counts against the task and blocks resume.
 */
export function isRecoveryCrash(rec: StepRecord): boolean {
  if (rec.stop?.kind !== "infra" || rec.stop?.cause !== "crash") return false;
  if (rec.ok !== false) return false;
  if (rec.cause !== undefined) return false;
  if (rec.stop.details !== undefined) return false;
  if (rec.usage !== undefined) return false;
  if (rec.promptBytes !== undefined) return false;
  return true;
}
