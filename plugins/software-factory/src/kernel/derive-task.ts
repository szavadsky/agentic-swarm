import { stepFingerprint } from "./progress.js";
import type {
  FlowDefinition,
  ProgressRepeat,
  ReviewVerdict,
  StepRecord,
  TaskFile,
  TaskKind,
  TaskPhase,
  TaskStatus,
} from "./types.js";

/** Used when a caller derives without the configured flow catalog. */
export const DEFAULT_FLOWS: Record<string, FlowDefinition> = {
  "implement-review": {
    reviewRounds: 2,
    steps: [
      { id: "implement", role: "implementer" },
      { id: "review", role: "reviewer", review: true },
    ],
  },
  "just-implement": {
    reviewRounds: 2,
    steps: [{ id: "implement", role: "implementer" }],
  },
  spike: {
    reviewRounds: 1,
    steps: [
      { id: "implement", role: "implementer" },
      { id: "review", role: "reviewer", review: true },
    ],
  },
};

export interface TerminalFact {
  status: TaskStatus;
  cause?: string;
  commit?: string;
}

export interface TaskReduction {
  terminal: TerminalFact | null;
  phase: TaskPhase;
  round: number;
  turns: number;
  verdict?: ReviewVerdict;
  commit?: string;
  park?: string;
  loop?: ProgressRepeat;
  gateFix?: boolean;
}

interface PendingChecks {
  nextIndex: number;
  mergeAfter: boolean;
}

function terminalFromRecords(task: TaskFile, records: StepRecord[]): TerminalFact | null {
  let out: TerminalFact | null = null;
  for (const rec of records) {
    if (!rec.endedAt) continue;
    if (rec.step === "park") {
      out = { status: "parked", cause: rec.cause ?? "parked without a recorded cause" };
    } else if (rec.step === "cancel") {
      out = { status: "cancelled", cause: rec.cause ?? "cancelled without a recorded cause" };
    } else if (rec.step === "merge" && rec.ok === true) {
      out = { status: task.kind === "spike" ? "finished" : "merged", commit: rec.commit };
    } else if (rec.step === "finish" && rec.ok === true) {
      out = { status: "finished", commit: rec.commit };
    }
  }
  return out;
}

function phaseAfter(flow: FlowDefinition, index: number, kind: TaskFile["kind"]): TaskPhase {
  if (index >= flow.steps.length) return kind === "spike" ? "finish" : "merge";
  return flow.steps[index]!.id;
}

/**
 * A productive step that reported done but left the branch where it was. On a
 * first turn the commit is the branch start; later turns keep the tree the last
 * counted turn left. Spikes are exempt: their product is the finding, not a diff.
 */
function committedNothing(kind: TaskKind, rec: StepRecord, priorTree: string | undefined): boolean {
  if (kind === "spike" || rec.outcome?.status !== "done" || rec.tree === undefined) return false;
  if (priorTree !== undefined) return rec.tree === priorTree;
  return rec.commit !== undefined && rec.commit === rec.base;
}

/**
 * One task's phase machine. It reads records, never config side effects: the
 * configured flow supplies the step order, `checks` gates the last productive
 * step before a review, and a merged-result gate failure adds one fix turn
 * without consuming a review round.
 */
export function reduceTask(task: TaskFile, records: StepRecord[], flow: FlowDefinition): TaskReduction {
  const flowIndex = new Map(flow.steps.map((step, i) => [step.id, i]));
  const terminal = terminalFromRecords(task, records);
  const firstStep = flow.steps[0]?.id ?? "done";

  let phase: TaskPhase = firstStep;
  let round = 1;
  let stepIndex = 0;
  let verdict: ReviewVerdict | undefined;
  let commit: string | undefined;
  let park: string | undefined;
  let loop: ProgressRepeat | undefined;
  let gateFix = false;
  let gatesFailures = 0;
  let pendingChecks: PendingChecks | null = null;
  let lastTree: string | undefined;
  /** Tree of the last counted turn; ignored turns leave the branch baseline here. */
  let countedTree: string | undefined;
  let turns = 0;
  const seen = new Map<string, { step: string; round: number }>();

  for (const rec of records) {
    if (!rec.endedAt) continue;
    if (rec.step === "commit") {
      lastTree = rec.tree ?? lastTree;
      continue;
    }
    if (rec.step === "checks") {
      if (pendingChecks) {
        if (rec.ok === false) {
          stepIndex = 0;
          phase = firstStep;
        } else {
          stepIndex = pendingChecks.nextIndex;
          phase = pendingChecks.mergeAfter ? phaseAfter(flow, flow.steps.length, task.kind) : phaseAfter(flow, stepIndex, task.kind);
        }
        pendingChecks = null;
      }
      continue;
    }
    if (rec.step === "merge-checks" || rec.step === "debt" || rec.step === "setup" || rec.step === "pm-validate") {
      continue;
    }
    if (rec.step === "merge") {
      // A merge start sealed by crash recovery is not an outcome: the planned
      // commit is still in the record and the merge queue recovers it.
      if (rec.stop?.kind === "infra") continue;
      if (rec.ok === true) {
        gateFix = false;
        pendingChecks = null;
        phase = "done";
      } else if (rec.ok === false) {
        const cause = rec.cause ?? "";
        if (cause.startsWith("gates:")) {
          gatesFailures += 1;
          if (gatesFailures === 1) {
            gateFix = true;
            stepIndex = 0;
            phase = firstStep;
            pendingChecks = null;
          } else {
            park = cause;
            phase = "parked";
          }
        } else if (cause.startsWith("conflict:") || cause.startsWith("no-progress:")) {
          park = cause;
          phase = "parked";
        } else {
          park = cause ? `merge failed: ${cause}` : "merge failed without a recorded cause";
          phase = "parked";
        }
      }
      continue;
    }
    if (rec.actor !== "agent" || !rec.endedAt) continue;
    if (rec.stop?.kind === "infra") continue;
    turns += 1;
    if (rec.stop?.kind === "truncated" || rec.stop?.kind === "cancelled") continue;

    // The empty-diff baseline is the tree the last counted turn left. A commit
    // written by a turn derive ignores (crash recovery, truncation) is not work
    // the next turn produced, so it must not stand in for a diff from base.
    const priorTree = countedTree;
    if (rec.tree !== undefined) countedTree = rec.tree;

    const fp = stepFingerprint(task.kind, rec, lastTree);
    if (fp) {
      const prior = seen.get(fp);
      if (prior && !loop) {
        loop = { fingerprint: fp, step: rec.step, round: rec.round, firstRound: prior.round };
      } else if (!prior) {
        seen.set(fp, { step: rec.step, round: rec.round });
      }
    }
    if (!flowIndex.has(rec.step)) {
      // Merge-conflict implementer attempts are real turns but not flow steps.
      continue;
    }

    round = Math.max(round, rec.round);
    commit = rec.commit ?? commit;
    const outcome = rec.outcome;
    if (rec.stop?.kind === "refusal") {
      park = `refused: ${rec.stop.details ?? "no details"}`;
      phase = "parked";
      continue;
    }
    const status = outcome?.status;
    if (status === "blocked" || status === "failed") {
      park = `${status}: ${outcome?.summary ?? "no summary"}`;
      phase = "parked";
      continue;
    }
    if (status === "upscope") {
      park = `upscope: ${outcome?.summary ?? "no summary"}`;
      phase = "parked";
      continue;
    }

    const idx = flowIndex.get(rec.step)!;
    const step = flow.steps[idx]!;
    // An empty commit is its own no-progress signal: skip the reviewer and park
    // now, instead of spending review rounds until the fingerprint repeats.
    if (!step.review && committedNothing(task.kind, rec, priorTree)) {
      park = `empty-diff: ${rec.step} r${rec.round} committed no changes`;
      phase = "parked";
      continue;
    }
    if (step.review) {
      verdict = outcome?.verdict;
      if (verdict === "approve") {
        stepIndex = idx + 1;
        gateFix = false;
        pendingChecks = null;
        phase = phaseAfter(flow, stepIndex, task.kind);
      } else if (verdict === "changes") {
        if (rec.round < flow.reviewRounds) {
          round = rec.round + 1;
          stepIndex = 0;
          gateFix = false;
          phase = firstStep;
        } else {
          // The last round decides: changes merge with the concerns as debt.
          stepIndex = flow.steps.length;
          gateFix = false;
          phase = phaseAfter(flow, stepIndex, task.kind);
        }
        pendingChecks = null;
      } else if (verdict === "reject") {
        park = `review rejected: ${outcome?.summary ?? "no summary"}`;
        phase = "parked";
      } else {
        park = `review produced no verdict: ${outcome?.summary ?? "no summary"}`;
        phase = "parked";
      }
      continue;
    }

    stepIndex = idx + 1;
    const nextStep = flow.steps[stepIndex];
    if (!nextStep || nextStep.review) {
      pendingChecks = { nextIndex: stepIndex, mergeAfter: gateFix };
      phase = "checks";
    } else {
      pendingChecks = null;
      phase = nextStep.id;
    }
  }

  if (pendingChecks) phase = "checks";
  if (park) phase = "parked";
  if (terminal) {
    phase = "done";
    gateFix = false;
    park = undefined;
    commit = terminal.commit ?? commit;
  }

  return {
    terminal,
    phase,
    round,
    turns,
    verdict,
    commit,
    park: terminal ? undefined : park,
    loop,
    gateFix: terminal ? undefined : gateFix || undefined,
  };
}
