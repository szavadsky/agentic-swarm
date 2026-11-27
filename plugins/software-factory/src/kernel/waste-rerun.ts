/**
 * Re-runs caused by an infra fault: a park whose gate never judged the tree (a
 * timeout) or whose rejection rested only on infra reds (an infra misjudgment)
 * throws the turn's work away, and the next turn redoes it.
 */

import { isInfraCheck } from "./gates-normalise.js";
import { recordDirName } from "./store.js";
import type { StepRecord } from "./types.js";
import type { RerunWaste } from "./waste-rerun-types.js";
export type { RerunWaste } from "./waste-rerun-types.js";

function recordPath(rec: StepRecord): string {
  return `records/${recordDirName(rec.seq, rec)}`;
}

/** The closest checks or merge-checks record before a park on the same slug. */
function gateBeforePark(
  ordered: readonly StepRecord[],
  park: StepRecord,
): StepRecord | undefined {
  const gate = (rec: StepRecord) =>
    rec.actor === "script" &&
    (rec.step === "checks" || rec.step === "merge-checks") &&
    rec.endedAt !== undefined &&
    rec.slug === park.slug &&
    // Gate records carry no revision: an unstamped gate is the current one.
    (rec.revision === undefined ||
      (rec.revision ?? 0) === (park.revision ?? 0)) &&
    rec.seq < park.seq;
  return ordered.filter(gate).at(-1);
}

/** A gate whose every own blocking red was infra: it never judged the tree. */
function infraOnlyRed(gate: StepRecord): boolean {
  const red = (gate.checks ?? []).filter(
    (check) =>
      !check.ok && check.advisory !== true && check.attribution !== "inherited",
  );
  return red.length > 0 && red.every(isInfraCheck);
}

/** How a park threw work away over an infra fault, and the gate that proves it. */
function infraParkRejection(
  ordered: readonly StepRecord[],
  park: StepRecord,
): { cause: "gate-timeout" | "infra-misjudged"; gate: StepRecord } | undefined {
  const kind = park.cause?.kind;
  const timeout = kind === "infra";
  // A gate rejection whose red was entirely infra: the kernel reported a tree
  // verdict the gate never reached.
  const misjudged = kind === "gates" || kind === "merge-failed";
  if (!timeout && !misjudged) return undefined;
  const gate = gateBeforePark(ordered, park);
  if (!gate || !infraOnlyRed(gate)) return undefined;
  return { cause: timeout ? "gate-timeout" : "infra-misjudged", gate };
}

/** The first agent turn after a park on its task: work the park threw away, redone. */
function rerunTurn(
  ordered: readonly StepRecord[],
  park: StepRecord,
): StepRecord | undefined {
  return ordered.find(
    (rec) =>
      rec.seq > park.seq &&
      rec.slug !== undefined &&
      rec.slug === park.slug &&
      rec.actor === "agent" &&
      rec.endedAt !== undefined,
  );
}

/** The infra gate's reds on one line, for the re-run's detail. */
function infraGateText(gate: StepRecord): string {
  const red = (gate.checks ?? []).filter(
    (check) => !check.ok && check.advisory !== true,
  );
  const line = red
    .map((check) => `${check.name}: ${check.summary}`)
    .join("; ")
    .replace(/\s+/g, " ")
    .trim();
  return line.length <= 160 ? line : `${line.slice(0, 159)}…`;
}

/**
 * Every re-run an infra fault caused among the measured turns. The park may sit
 * in an earlier iteration, so the scan reads every known record while only the
 * measured turns can be waste for the iteration being counted.
 */
export function rerunWaste(
  known: readonly StepRecord[],
  measured: ReadonlySet<number>,
): RerunWaste[] {
  const ordered = [...known].sort((a, b) => a.seq - b.seq);
  const reruns: RerunWaste[] = [];
  for (const park of ordered) {
    if (park.actor !== "script" || park.step !== "park" || !park.endedAt) {
      continue;
    }
    const rejection = infraParkRejection(ordered, park);
    if (!rejection) continue;
    const turn = rerunTurn(ordered, park);
    if (!turn || !measured.has(turn.seq)) continue;
    const why =
      rejection.cause === "gate-timeout"
        ? "re-ran after a gate timeout"
        : "re-ran after an infra-misjudged rejection";
    reruns.push({
      turn,
      evidence: park,
      detail: `${why}: ${infraGateText(rejection.gate)} (${recordPath(rejection.gate)} then ${recordPath(park)})`,
    });
  }
  return reruns;
}
