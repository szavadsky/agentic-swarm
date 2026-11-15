import type { Stop } from "../harness/types.js";
import { isInfraCheck } from "./gates.js";
import { countOutcomeRepairs } from "./metrics.js";
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

function terminalFromRecords(
  task: TaskFile,
  records: StepRecord[],
): TerminalFact | null {
  let out: TerminalFact | null = null;
  for (const rec of records) {
    if (!rec.endedAt) continue;
    if (rec.step === "park") {
      out = {
        status: "parked",
        cause: rec.cause ?? "parked without a recorded cause",
      };
    } else if (rec.step === "cancel") {
      out = {
        status: "cancelled",
        cause: rec.cause ?? "cancelled without a recorded cause",
      };
    } else if (rec.step === "merge" && rec.ok === true) {
      out = {
        status: task.kind === "spike" ? "finished" : "merged",
        commit: rec.commit,
      };
    } else if (rec.step === "finish" && rec.ok === true) {
      out = { status: "finished", commit: rec.commit };
    }
  }
  return out;
}

function phaseAfter(
  flow: FlowDefinition,
  index: number,
  kind: TaskFile["kind"],
): TaskPhase {
  if (index >= flow.steps.length) return kind === "spike" ? "finish" : "merge";
  return flow.steps[index]!.id;
}

/**
 * A productive step that reported done but left the branch where it was. On a
 * first turn the commit is the branch start; later turns keep the tree the last
 * counted turn left. Spikes are exempt: their product is the finding, not a diff.
 */
function committedNothing(
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
 * The red checks a merge gate failure names, as `name (summary)`. The cause
 * lists only the new failures; the record's checks also carry inherited reds,
 * so read the names from the cause. Records without checks keep the plain cause.
 */
function redChecksText(rec: StepRecord): string | undefined {
  const names = (rec.cause ?? "")
    .slice("gates:".length)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const red: string[] = [];
  for (const name of names) {
    const check = rec.checks?.find((c) => c.name === name);
    if (check) red.push(`${check.name} (${check.summary})`);
  }
  return red.length > 0 ? red.join(", ") : undefined;
}
/**
 * A record recovery sealed after a hard death: a bare `infra: crash` with
 * nothing the turn itself reported. Mirrors `isRecoveryCrash` in derive.ts —
 * resume and budget share the seal. Bare seals are free interruptions,
 * redispatched; a crash the turn reported (cause, details, usage or prompt
 * bytes) spends the budget. Recovery only seals crash, never timeout.
 */
function isBareRecoverySeal(rec: StepRecord): boolean {
  if (rec.stop?.kind !== "infra" || rec.stop?.cause !== "crash") return false;
  if (rec.ok !== false) return false;
  if (rec.cause !== undefined) return false;
  if (rec.stop.details !== undefined) return false;
  if (rec.usage !== undefined) return false;
  if (rec.promptBytes !== undefined) return false;
  return true;
}

/**
 * One task's phase machine. It reads records, never config side effects: the
 * configured flow supplies the step order, `checks` gates the last productive
 * step before a review, and a merged-result gate failure adds one fix turn
 * without consuming a review round.
 */
export function reduceTask(
  task: TaskFile,
  records: StepRecord[],
  flow: FlowDefinition,
): TaskReduction {
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
  let gateFailure: string | undefined;
  let gatesFailures = 0;
  let pendingChecks: PendingChecks | null = null;
  let lastTree: string | undefined;
  /** Tree of the last counted turn; ignored turns leave the branch baseline here. */
  let countedTree: string | undefined;
  /** Creation advance before the first counted turn; its tree vs headTree decides the carry. */
  let creationAdvance: { tree: string; headTree: string } | null = null;
  let seenCountedTurn = false;
  let turns = 0;
  const seen = new Map<string, { step: string; round: number }>();
  let lastInfraStep: string | undefined;
  let infraRepeatCount = 0;

  for (const rec of records) {
    if (!rec.endedAt) continue;
    if (rec.step === "commit") {
      lastTree = rec.tree ?? lastTree;
      continue;
    }
    if (rec.step === "base-advance") {
      // A continuation worktree advanced to the integration head without the
      // agent (creation merge or reused-worktree sync): the next turn's
      // empty-diff baseline is the post-advance tree, not the last counted
      // turn's. No existing record carries it — commit records only follow
      // turns — so this script record is the baseline. Free: no budget.
      if (rec.tree !== undefined) countedTree = rec.tree;
      // Only the creation advance carries, and only for the first counted
      // turn: a reused-worktree sync or merge-checks recreation either lacks
      // headTree or lands after a counted turn. Old records without headTree
      // derive as today.
      if (
        !seenCountedTurn &&
        creationAdvance === null &&
        rec.tree !== undefined &&
        rec.headTree !== undefined
      ) {
        creationAdvance = { tree: rec.tree, headTree: rec.headTree };
      }
      continue;
    }
    if (rec.step === "checks") {
      if (pendingChecks) {
        const red = rec.checks?.filter((c) => !c.ok) ?? [];
        if (rec.ok === false && red.length > 0 && red.every(isInfraCheck)) {
          // A gate that could not start is not a red verdict on the task:
          // looping the implementer ends in an empty-diff park (B6).
          park = `infra: gate could not start: ${red.map((c) => c.name).join(", ")}`;
          phase = "parked";
        } else if (rec.ok === false) {
          stepIndex = 0;
          phase = firstStep;
        } else {
          stepIndex = pendingChecks.nextIndex;
          phase = pendingChecks.mergeAfter
            ? phaseAfter(flow, flow.steps.length, task.kind)
            : phaseAfter(flow, stepIndex, task.kind);
        }
        pendingChecks = null;
      }
      continue;
    }
    if (
      rec.step === "merge-checks" ||
      rec.step === "debt" ||
      rec.step === "setup" ||
      rec.step === "pm-validate"
    ) {
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
            gateFailure = redChecksText(rec);
            stepIndex = 0;
            phase = firstStep;
            pendingChecks = null;
          } else {
            park = cause;
            phase = "parked";
          }
        } else if (
          cause.startsWith("conflict:") ||
          cause.startsWith("no-progress:")
        ) {
          park = cause;
          phase = "parked";
        } else {
          park = cause
            ? `merge failed: ${cause}`
            : "merge failed without a recorded cause";
          phase = "parked";
        }
      }
      continue;
    }
    // A crash the script reports (dispatch `recordCrash`) budgets like a harness
    // crash on the same step: a throwing pre-harness step parks after two
    // repeats instead of redispatching forever. Only reported crashes on flow
    // steps consume; bare recovery seals, script phases (checks, merge, park,
    // finish), quota/rate/auth/overflow and drain (tasks never started) stay free.
    if (rec.actor === "script") {
      const scriptStop = rec.stop;
      const scriptHasOutcome = !!rec.outcome?.status;
      const scriptTimeoutOrCrash =
        scriptStop?.kind === "infra" &&
        (scriptStop.cause === "timeout" || scriptStop.cause === "crash");
      if (
        scriptTimeoutOrCrash &&
        !scriptHasOutcome &&
        flowIndex.has(rec.step) &&
        !isBareRecoverySeal(rec)
      ) {
        if (lastInfraStep === rec.step) infraRepeatCount += 1;
        else {
          lastInfraStep = rec.step;
          infraRepeatCount = 1;
        }
        turns += 1;
        if (infraRepeatCount >= 2) {
          park = `infra-repeat: ${scriptStop.cause}${scriptStop.details ? `: ${scriptStop.details}` : ""}`;
          phase = "parked";
        }
      }
      continue;
    }
    if (rec.actor !== "agent" || !rec.endedAt) continue;
    const stop = rec.stop;
    const outcome = rec.outcome;
    const status = outcome?.status;
    const hasOutcome = !!outcome && !!status;
    const isInfra = stop?.kind === "infra";
    const isCancelled = stop?.kind === "cancelled";
    const isTruncated = stop?.kind === "truncated";
    const isTimeoutOrCrash =
      isInfra && (stop.cause === "timeout" || stop.cause === "crash");

    // Infra without a valid outcome: a reported timeout/crash consumes the turn
    // budget and parks after two repeats on the same step; bare recovery seals
    // (free interruptions) and other infra (quota, auth, ...) stay free and resumable.
    if (isInfra && !hasOutcome) {
      if (isTimeoutOrCrash && !isBareRecoverySeal(rec)) {
        if (lastInfraStep === rec.step) infraRepeatCount += 1;
        else {
          lastInfraStep = rec.step;
          infraRepeatCount = 1;
        }
        turns += 1;
        if (infraRepeatCount >= 2) {
          park = `infra-repeat: ${stop.cause}${stop.details ? `: ${stop.details}` : ""}`;
          phase = "parked";
        }
      }
      continue;
    }

    // A valid outcome is kept whatever the stop; reset repeat tracking.
    lastInfraStep = undefined;
    infraRepeatCount = 0;

    // Outcome repairs are harness turns on the same record; each one spends the
    // item budget like the turn that needed it.
    turns += 1 + countOutcomeRepairs(rec.attempts);
    if (isTruncated) continue;
    if (isCancelled && !hasOutcome) continue;

    // The empty-diff baseline is the tree the last counted turn left. A commit
    // written by a turn derive ignores (crash recovery, truncation) is not work
    // the next turn produced, so it must not stand in for a diff from base.
    const priorTree = countedTree;
    if (rec.tree !== undefined) countedTree = rec.tree;
    // A base continuation whose kept branch already meets its done-when
    // commits nothing on its first turn: when the creation advance carried
    // work beyond the head, that no-change turn is progress, not an empty
    // diff. Consumed by the first counted turn whatever its step.
    let carriedWork: boolean | null = null;
    if (!seenCountedTurn) {
      if (creationAdvance !== null && priorTree === creationAdvance.tree) {
        carriedWork = creationAdvance.tree !== creationAdvance.headTree;
      }
      seenCountedTurn = true;
      creationAdvance = null;
    }
    const fp = stepFingerprint(task.kind, rec, lastTree);
    if (fp) {
      const prior = seen.get(fp);
      if (prior && !loop) {
        loop = {
          fingerprint: fp,
          step: rec.step,
          round: rec.round,
          firstRound: prior.round,
        };
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
    if (rec.stop?.kind === "refusal") {
      park = `refused: ${rec.stop.details ?? "no details"}`;
      phase = "parked";
      continue;
    }
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
    // now, instead of spending review rounds until the fingerprint repeats. A
    // gate-fix turn names the red checks that sent it back, so the cause says
    // why a task that already committed looks empty.
    if (!step.review && committedNothing(task.kind, rec, priorTree)) {
      if (carriedWork !== true) {
        park =
          carriedWork === false
            ? `empty-diff: ${rec.step} r${rec.round} kept work is already on the head`
            : gateFix && gateFailure
              ? `empty-diff: ${rec.step} r${rec.round} committed no changes after red checks: ${gateFailure}`
              : `empty-diff: ${rec.step} r${rec.round} committed no changes`;
        phase = "parked";
        continue;
      }
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

export type StopClassification =
  | "ok"
  | "infra"
  | "cancelled"
  | "timeout"
  | "crash";

export function classifyStop(stop: Stop | undefined): StopClassification {
  if (!stop || stop.kind === "done") return "ok";
  if (stop.kind === "cancelled") return "cancelled";
  if (stop.kind === "infra") {
    if (stop.cause === "timeout") return "timeout";
    if (stop.cause === "crash") return "crash";
    return "infra";
  }
  return "ok";
}
