/** The zero-edit park rate and the turns each repair ask recovered. */

import type { StepRecord } from "../types.js";
import type {
  AskRecoveryCounts,
  ZeroEditParkCause,
  ZeroEditParkMetrics,
} from "./types.js";

/** Record order: the sequence number, the start stamp breaking a tie. */
function ordered(left: StepRecord, right: StepRecord): number {
  return left.seq - right.seq || left.startedAt.localeCompare(right.startedAt);
}

/** The iteration's implement turns, in record order, settled or not. */
function implementTurns(records: readonly StepRecord[]): StepRecord[] {
  return records
    .filter((rec) => rec.step === "implement" && rec.actor === "agent")
    .sort(ordered);
}

/** The last implement turn for the park's slug at its revision before the park. */
function lastImplementTurn(
  park: StepRecord,
  turns: readonly StepRecord[],
): StepRecord | undefined {
  let last: StepRecord | undefined;
  for (const turn of turns) {
    if (ordered(turn, park) >= 0) break;
    if (turn.slug !== park.slug) continue;
    if ((turn.revision ?? 0) !== (park.revision ?? 0)) continue;
    last = turn;
  }
  return last;
}

/**
 * A failed park is an invalid outcome when the turn sent a repair ask and its
 * findings were still unresolved; a turn that reported a valid `failed` answer,
 * asked or not, reported the failure.
 */
function failedParkCause(turn: StepRecord): ZeroEditParkCause {
  const asked =
    (turn.asks?.length ?? 0) > 0 || (turn.repairFindings?.length ?? 0) > 0;
  return asked && turn.repairFindingsResolved !== true
    ? "invalid-outcome"
    : "failed";
}

/** The bucket a park belongs in, or undefined for a cause the rate leaves out. */
function parkCause(
  park: StepRecord,
  turn: StepRecord,
): ZeroEditParkCause | undefined {
  switch (park.cause?.kind) {
    case "failed":
      return failedParkCause(turn);
    case "invalid-outcome":
      return "invalid-outcome";
    case "empty-diff":
      return "empty-diff";
    default:
      return undefined;
  }
}

/**
 * Parks caused by a failed report, an invalid outcome or an empty diff whose
 * last implement turn committed no files. A park with no implement turn before
 * it, or whose last implement turn made edits, counts nowhere; a turn measured
 * with no diff is not a zero-edit fact. The denominator is every implement turn
 * the iteration dispatched.
 */
export function zeroEditParkMetrics(
  records: readonly StepRecord[],
): ZeroEditParkMetrics {
  const turns = implementTurns(records);
  const byCause: Record<ZeroEditParkCause, number> = {
    failed: 0,
    "invalid-outcome": 0,
    "empty-diff": 0,
  };
  let parks = 0;
  for (const park of records) {
    if (park.step !== "park" || park.endedAt === undefined || !park.slug) {
      continue;
    }
    const turn = lastImplementTurn(park, turns);
    if (turn === undefined) continue;
    if (turn.edits === undefined || turn.edits.files > 0) continue;
    const cause = parkCause(park, turn);
    if (cause === undefined) continue;
    byCause[cause] += 1;
    parks += 1;
  }
  return {
    parks,
    implementTurns: turns.length,
    rate: turns.length > 0 ? parks / turns.length : null,
    byCause,
  };
}

/**
 * Turns each ask recovered: the turn credited to its last ask when its findings
 * resolved and it reported `done`. An unfinished ask counts only when the turn
 * delivered edits; a rescue counts with or without them. An honest `failed`
 * answer, a blocked or upscope answer, and a record without asks count neither.
 */
export function askRecoveryCounts(
  turns: readonly StepRecord[],
): AskRecoveryCounts {
  const counts: AskRecoveryCounts = { unfinished: 0, rescue: 0 };
  for (const turn of turns) {
    if (turn.repairFindingsResolved !== true) continue;
    if (turn.outcome?.status !== "done") continue;
    const ask = turn.asks?.at(-1);
    if (ask === "rescue") {
      counts.rescue += 1;
    } else if (ask === "unfinished" && (turn.edits?.files ?? 0) > 0) {
      counts.unfinished += 1;
    }
  }
  return counts;
}
