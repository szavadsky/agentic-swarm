/**
 * The derive facts: the default flow catalog, the reduction shape, the last
 * terminal fact a slug's records carry, and the small pure predicates a
 * reduction reads (revision start, phase after a step, empty-diff, merge gate
 * names, recovery seals).
 */
import type { CheckResult } from "../core/checks/types.js";
import { makeCause } from "./cause.js";
import { isInfraCheck } from "./gates.js";
import {
  agentSteps,
  DEFAULT_CHANGE_REQUESTS,
  isAdjudicatorStep,
} from "./review.js";
import { SPIKE_REPORT_CHECK, spikeReportPath } from "./spike-report.js";
import type {
  Cause,
  FlowDefinition,
  ProgressRepeat,
  ReviewVerdict,
  StepRecord,
  TaskFile,
  TaskKind,
  TaskPhase,
  TaskStatus,
} from "./types.js";

export const DEFAULT_FLOWS: Record<string, FlowDefinition> = {
  "implement-review": {
    steps: [
      { id: "implement", prompt: "implementer", alias: "implementer" },
      {
        id: "qa",
        prompt: "qa",
        alias: "qa",
        qa: true,
        changeRequests: DEFAULT_CHANGE_REQUESTS,
        deliverable: "verdict",
      },
      {
        id: "review",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: DEFAULT_CHANGE_REQUESTS,
      },
      { id: "resolve", prompt: "steward", alias: "steward" },
    ],
  },
  "just-implement": {
    steps: [
      { id: "implement", prompt: "implementer", alias: "implementer" },
      { id: "resolve", prompt: "steward", alias: "steward" },
    ],
  },
  spike: {
    steps: [
      { id: "implement", prompt: "implementer", alias: "implementer" },
      {
        id: "review",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: 0,
      },
    ],
  },
};

export interface TerminalFact {
  status: TaskStatus;
  cause?: Cause;
  commit?: string;
}

export interface TaskReduction {
  terminal: TerminalFact | null;
  phase: TaskPhase;
  round: number;
  turns: number;
  verdict?: ReviewVerdict;
  commit?: string;
  park?: Cause;
  loop?: ProgressRepeat;
  gateFix?: boolean;
  gateLastCall?: boolean;
  cleanlinessRevision?: boolean;
  cleanlinessJustified?: boolean;
}

export interface PendingChecks {
  nextIndex: number;
  mergeAfter: boolean;
  /**
   * An empty gate-fix turn whose park awaits these checks: green carries on,
   * an identical red parks, a changed set loops the fix. Riding pendingChecks
   * keeps the deferral with the turn it settles: a review, merge or newer
   * turn clears both together, so a stale deferral can never mis-park.
   */
  emptyFix?: { step: string; round: number };
}

/**
 * The last terminal fact a slug's records carry. The single source for
 * terminal rules: `reduceTask` and the store's unreadable-file check both
 * read through here, so a change to what counts as terminal lands once.
 * Records are filtered by slug; callers may pass the whole store.
 * An unreadable file cannot supply `kind`, so the default is `development`:
 * a spike merge then reads as `merged`, but spike flows finish rather than
 * merge, so the default holds in practice.
 */

export function terminalFactFromRecords(
  records: StepRecord[],
  slug: string,
  kind: TaskKind = "development",
): TerminalFact | null {
  let out: TerminalFact | null = null;
  for (const rec of records) {
    if (rec.slug !== slug || !rec.endedAt) continue;
    const fact = terminalOf(rec, kind);
    if (fact) out = fact;
  }
  return out;
}

/** The terminal fact one ended record carries, or null for a non-terminal step. */
function terminalOf(rec: StepRecord, kind: TaskKind): TerminalFact | null {
  if (rec.step === "park") {
    return {
      status: "parked",
      cause:
        rec.cause ?? makeCause("unknown", "parked without a recorded cause"),
    };
  }
  if (rec.step === "cancel") {
    return {
      status: "cancelled",
      cause:
        rec.cause ?? makeCause("unknown", "cancelled without a recorded cause"),
    };
  }
  if (rec.step === "merge" && rec.ok === true) {
    return {
      status: kind === "spike" ? "finished" : "merged",
      commit: rec.commit,
    };
  }
  if (rec.step === "finish" && rec.ok === true) {
    return { status: "finished", commit: rec.commit };
  }
  return null;
}

/**
 * The first record the task's current revision owns. A revision bump follows
 * a park: what the records through the last park of an earlier revision built
 * describes the brief the decider replaced, so phase, counts and terminal fact
 * restart from the amended one. The current revision's parks stay, and a
 * record without the field belongs to revision 0, so old records derive as
 * today. The records themselves stay for the prompts' review history.
 */
export function revisionStart(
  task: TaskFile,
  records: readonly StepRecord[],
): number {
  if (task.revision === 0) return 0;
  let start = 0;
  records.forEach((rec, index) => {
    if (
      rec.step === "park" &&
      rec.endedAt &&
      (rec.revision ?? 0) < task.revision
    ) {
      start = index + 1;
    }
  });
  return start;
}

export function phaseAfter(
  flow: FlowDefinition,
  index: number,
  kind: TaskFile["kind"],
): TaskPhase {
  const steps = agentSteps(flow);
  // An adjudicator never follows a verdict that did not request changes, so
  // the normal sequence steps over it; derive selects it explicitly from the
  // review's `changes` branch.
  let at = index;
  while (at < steps.length && isAdjudicatorStep(steps[at])) at += 1;
  if (at >= steps.length) return kind === "spike" ? "finish" : "merge";
  return steps[at]!.id;
}

export function committedNothing(
  kind: TaskKind,
  rec: StepRecord,
  priorTree: string | undefined,
): boolean {
  if (
    kind === "spike" ||
    rec.outcome?.status !== "done" ||
    rec.tree === undefined
  )
    return false;
  if (priorTree !== undefined) return rec.tree === priorTree;
  return rec.commit !== undefined && rec.commit === rec.base;
}

/**
 * The merge-gate names the cause lists that the record's checks carry. The
 * cause lists only the new failures; the record's checks also carry inherited
 * reds, so read the names from the cause.
 */
export function mergeGateNames(rec: StepRecord): string[] {
  const cause = rec.cause?.kind === "gates" ? rec.cause.detail : "";
  const names = cause
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.filter((name) => rec.checks?.some((c) => c.name === name));
}

/**
 * The red checks a merge gate failure names, as `name (summary)`. Records
 * without checks keep the plain cause.
 */
export function redChecksText(rec: StepRecord): string | undefined {
  const red: string[] = [];
  for (const name of mergeGateNames(rec)) {
    const check = rec.checks?.find((c) => c.name === name);
    if (check) red.push(`${check.name} (${check.summary})`);
  }
  return red.length > 0 ? red.join(", ") : undefined;
}

/**
 * The actionable red task checks as `name (summary)`. Unstartable gates are
 * not a verdict on the task, so they never name the fix turn's cause.
 */
export function failingChecksText(
  red: readonly CheckResult[],
): string | undefined {
  const actionable = red.filter((c) => !isInfraCheck(c));
  if (actionable.length === 0) return undefined;
  return actionable.map((c) => `${c.name} (${c.summary})`).join(", ");
}

/** Sorted actionable failing names for the deferred empty-fix comparison. */
export function failingNames(red: readonly CheckResult[]): string[] {
  return red
    .filter((c) => !isInfraCheck(c))
    .map((c) => c.name)
    .sort();
}

/** The exhausted gates named in a park; a missing spike report names its path. */
export function parkedGateNames(
  task: TaskFile,
  red: readonly CheckResult[],
): string {
  const names = failingNames(red).map((name) =>
    name === SPIKE_REPORT_CHECK
      ? `${name} (${spikeReportPath(task.slug)})`
      : name,
  );
  return names.join(", ") || "failing checks";
}

/** Whether the follow-up red names the same actionable set as the red that sent the fix. */
export function sameFailingSet(
  red: readonly CheckResult[],
  prior: readonly string[],
): boolean {
  const names = failingNames(red);
  return (
    names.length === prior.length && names.every((name, i) => name === prior[i])
  );
}
