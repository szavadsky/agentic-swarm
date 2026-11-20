// biome-ignore-all lint/complexity: split-flow-dispatch
import type { CheckResult } from "../core/checks/types.js";
import { isInfraCheck } from "./gates.js";
import { countOutcomeRepairs } from "../harness/usage.js";
import { stepFingerprint } from "./progress.js";
import { SPIKE_REPORT_CHECK, spikeReportPath } from "./spike-report.js";
import { qaReportOf } from "./qa.js";
import {
  adjudicationDue,
  agentSteps,
  checksFixLimit,
  DEFAULT_CHANGE_REQUESTS,
  isAcceptanceStep,
  isAdjudicatorStep,
  isLastChecksFixCall,
  isLastReviewCall,
  isVerdictStep,
} from "./review.js";
import { formatCause, makeCause } from "./cause.js";
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

/** Used when a caller derives without the configured flow catalog. */
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
}

interface PendingChecks {
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
    if (rec.step === "park") {
      out = {
        status: "parked",
        cause:
          rec.cause ?? makeCause("unknown", "parked without a recorded cause"),
      };
    } else if (rec.step === "cancel") {
      out = {
        status: "cancelled",
        cause:
          rec.cause ??
          makeCause("unknown", "cancelled without a recorded cause"),
      };
    } else if (rec.step === "merge" && rec.ok === true) {
      out = {
        status: kind === "spike" ? "finished" : "merged",
        commit: rec.commit,
      };
    } else if (rec.step === "finish" && rec.ok === true) {
      out = { status: "finished", commit: rec.commit };
    }
  }
  return out;
}

/**
 * The first record the task's current revision owns. A revision bump follows
 * a park: what the records through the last park of an earlier revision built
 * describes the brief the decider replaced, so phase, counts and terminal fact
 * restart from the amended one. The current revision's parks stay, and a
 * record without the field belongs to revision 0, so old records derive as
 * today. The records themselves stay for the prompts' review history.
 */
function revisionStart(task: TaskFile, records: readonly StepRecord[]): number {
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

function phaseAfter(
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
 * The merge-gate names the cause lists that the record's checks carry. The
 * cause lists only the new failures; the record's checks also carry inherited
 * reds, so read the names from the cause.
 */
function mergeGateNames(rec: StepRecord): string[] {
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
function redChecksText(rec: StepRecord): string | undefined {
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
function failingChecksText(red: readonly CheckResult[]): string | undefined {
  const actionable = red.filter((c) => !isInfraCheck(c));
  if (actionable.length === 0) return undefined;
  return actionable.map((c) => `${c.name} (${c.summary})`).join(", ");
}

/** Sorted actionable failing names for the deferred empty-fix comparison. */
function failingNames(red: readonly CheckResult[]): string[] {
  return red
    .filter((c) => !isInfraCheck(c))
    .map((c) => c.name)
    .sort();
}

/** The exhausted gates named in a park; a missing spike report names its path. */
function parkedGateNames(task: TaskFile, red: readonly CheckResult[]): string {
  const names = failingNames(red).map((name) =>
    name === SPIKE_REPORT_CHECK
      ? `${name} (${spikeReportPath(task.slug)})`
      : name,
  );
  return names.join(", ") || "failing checks";
}

/** Whether the follow-up red names the same actionable set as the red that sent the fix. */
function sameFailingSet(
  red: readonly CheckResult[],
  prior: readonly string[],
): boolean {
  const names = failingNames(red);
  return (
    names.length === prior.length && names.every((name, i) => name === prior[i])
  );
}

/**
 * A record recovery sealed after a hard death: a bare `infra: crash` with
 * nothing the turn itself reported. Mirrors `isRecoveryCrash` in derive.ts —
 * resume and the turn count share the seal. Bare seals are free
 * interruptions, redispatched; a crash the turn reported (cause, details,
 * usage or prompt bytes) counts as a turn. Recovery only seals crash, never
 * timeout.
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
  const steps = agentSteps(flow);
  const flowIndex = new Map(steps.map((step, i) => [step.id, i]));
  const owned = records.slice(revisionStart(task, records));
  const terminal = terminalFactFromRecords(owned, task.slug, task.kind);
  const firstStep = steps[0]?.id ?? "done";

  let phase: TaskPhase = firstStep;
  let round = 1;
  let stepIndex = 0;
  let verdict: ReviewVerdict | undefined;
  let commit: string | undefined;
  let park: Cause | undefined;
  let loop: ProgressRepeat | undefined;
  let gateFix = false;
  let gateLastCall = false;
  let gateFixCount = 0;
  let gateFailure: string | undefined;
  /** Sorted actionable failing names behind the current gate fix; the deferred empty-fix comparison. */
  let gateRed: string[] | undefined;
  /** The gate fix came from merged-result gates: green checks merge, skipping review. */
  let mergeFix = false;
  /** The last review's `changes` still awaits its answer; an empty answer goes back for a verdict. */
  let changesPending = false;
  /** The fix before the next review answered by replies alone: that review repeats its tree by design. */
  let replyOnlyFix = false;
  let gatesFailures = 0;
  let pendingChecks: PendingChecks | null = null;
  /** The last green task-checks tree, the baseline a QA accept may already have judged. */
  let lastChecksTree: string | undefined;
  let lastTree: string | undefined;
  /** Tree of the last counted turn; ignored turns leave the branch baseline here. */
  let countedTree: string | undefined;
  /** Creation advance before the first counted turn; its tree vs headTree decides the carry. */
  let creationAdvance: { tree: string; headTree: string } | null = null;
  let seenCountedTurn = false;
  let turns = 0;
  /** The current merge attempt already spent its one resolve turn. */
  let resolveRan = false;
  const seen = new Map<string, { step: string; round: number }>();
  let lastInfraStep: string | undefined;
  let infraRepeatCount = 0;

  /**
   * A settled resolve turn sends the task back to the flow: review when it
   * changed files the conflict did not cover, otherwise straight to checks and
   * the re-merge. The resolve turn is not a flow step, so it lands here rather
   * than through the agent-step sequence.
   */
  const routeResolve = (rec: StepRecord): void => {
    resolveRan = true;
    commit = rec.commit ?? commit;
    const outside = rec.outside ?? [];
    const acceptanceIndex = steps.findIndex((step) => isAcceptanceStep(step));
    if (outside.length > 0) {
      if (acceptanceIndex < 0) {
        // No acceptance step to judge the un-reviewed work: never land it silently.
        park = makeCause(
          "stuck",
          `resolve changed files outside the conflict set and the flow has no acceptance step: ${outside.join(", ")}`,
        );
        phase = "parked";
      } else {
        round = Math.max(round, rec.round + 1);
        stepIndex = acceptanceIndex;
        phase = steps[acceptanceIndex]!.id;
        pendingChecks = null;
      }
    } else {
      pendingChecks = { nextIndex: steps.length, mergeAfter: true };
      phase = "checks";
    }
    gateFix = false;
    gateLastCall = false;
    mergeFix = false;
    changesPending = false;
  };

  for (const rec of owned) {
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
      // turns — so this script record is the baseline. Free: not a turn.
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
      if (rec.ok === true && rec.tree !== undefined) lastChecksTree = rec.tree;
      if (pendingChecks) {
        const red = rec.checks?.filter((c) => !c.ok) ?? [];
        if (rec.ok === false && red.length > 0 && red.every(isInfraCheck)) {
          // A gate that could not start is not a red verdict on the task:
          // looping the implementer ends in an empty-diff park (B6).
          park = makeCause(
            "infra",
            `gate could not start: ${red.map((c) => c.name).join(", ")}`,
          );
          phase = "parked";
        } else if (rec.ok === false) {
          const deferred = pendingChecks.emptyFix;
          if (
            deferred &&
            (gateRed === undefined || sameFailingSet(red, gateRed))
          ) {
            // The fix changed nothing and the same checks still fail: a
            // deterministic red the fix did not address. A red without a
            // comparable baseline (merge gates with no recorded checks)
            // parks the same way; green and changed reds move on below.
            park = makeCause(
              "empty-diff",
              gateFailure !== undefined
                ? `${deferred.step} r${deferred.round} committed no changes after red checks: ${gateFailure}`
                : `${deferred.step} r${deferred.round} committed no changes`,
            );
            phase = "parked";
          } else {
            gateFixCount += 1;
            if (gateFixCount > checksFixLimit(flow)) {
              park = makeCause("gates", parkedGateNames(task, red));
              phase = "parked";
              gateFix = false;
              gateLastCall = false;
            } else {
              gateFix = true;
              gateLastCall = isLastChecksFixCall(flow, gateFixCount);
              gateFailure = failingChecksText(red);
              gateRed = failingNames(red);
              // A task-checks reroute ends the merge-fix: this fix goes back to review.
              mergeFix = false;
              stepIndex = 0;
              phase = firstStep;
            }
          }
        } else {
          gateFix = false;
          gateLastCall = false;
          stepIndex = pendingChecks.nextIndex;
          phase = pendingChecks.mergeAfter
            ? phaseAfter(flow, steps.length, task.kind)
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
        gateLastCall = false;
        mergeFix = false;
        pendingChecks = null;
        phase = "done";
      } else if (rec.ok === false) {
        const cause = rec.cause;
        if (cause?.kind === "gates") {
          gateFixCount += 1;
          gatesFailures += 1;
          if (gatesFailures === 1 && gateFixCount <= checksFixLimit(flow)) {
            gateFix = true;
            gateLastCall = isLastChecksFixCall(flow, gateFixCount);
            mergeFix = true;
            gateFailure = redChecksText(rec);
            // No matched names (old records without checks) leaves no
            // baseline: the deferred comparison then parks on any red.
            const names = [...mergeGateNames(rec)].sort();
            gateRed = names.length > 0 ? names : undefined;
            // The fix answers the red gates, not the last review: no verdict awaits it.
            changesPending = false;
            stepIndex = 0;
            phase = firstStep;
            pendingChecks = null;
          } else {
            park = cause;
            phase = "parked";
            gateFix = false;
            gateLastCall = false;
          }
        } else if (cause?.kind === "conflict") {
          const resolveStep = flow.steps.some((step) => step.id === "resolve");
          if (resolveRan || !resolveStep) {
            // The one resolve turn already ran for this merge attempt, or the
            // flow config has no resolve step: the conflict is the park.
            park = cause;
            phase = "parked";
          } else {
            gateFix = false;
            gateLastCall = false;
            mergeFix = false;
            changesPending = false;
            pendingChecks = null;
            phase = "resolve";
          }
        } else if (cause?.kind === "no-progress") {
          park = cause;
          phase = "parked";
        } else if (cause?.kind === "merge-failed") {
          park = cause;
          phase = "parked";
        } else {
          park = cause
            ? makeCause("merge-failed", formatCause(cause))
            : makeCause(
                "merge-failed",
                "merge failed without a recorded cause",
              );
          phase = "parked";
        }
      }
      continue;
    }
    if (rec.step === "resolve" && rec.actor === "script") {
      // A clean head merge needed no turn but still settles the conflict.
      routeResolve(rec);
      continue;
    }
    // A crash the script reports (dispatch `recordCrash`) counts like a harness
    // crash on the same step: a throwing pre-harness step parks after two
    // repeats instead of redispatching forever. Only reported crashes on flow
    // steps count; bare recovery seals, script phases (checks, merge, park,
    // finish), quota/rate/network/auth/overflow/glitch and drain (tasks never
    // started) stay free.
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
          park = makeCause(
            "infra-repeat",
            `${scriptStop.cause}${scriptStop.details ? `: ${scriptStop.details}` : ""}`,
          );
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

    // Infra without a valid outcome: a reported timeout/crash counts as a turn
    // and parks after two repeats on the same step; bare recovery seals
    // (free interruptions) and other infra (quota, auth, unavailable, ...)
    // stay free and resumable.
    if (isInfra && !hasOutcome) {
      if (isTimeoutOrCrash && !isBareRecoverySeal(rec)) {
        if (lastInfraStep === rec.step) infraRepeatCount += 1;
        else {
          lastInfraStep = rec.step;
          infraRepeatCount = 1;
        }
        turns += 1;
        if (infraRepeatCount >= 2) {
          park = makeCause(
            "infra-repeat",
            `${stop.cause}${stop.details ? `: ${stop.details}` : ""}`,
          );
          phase = "parked";
        }
      }
      continue;
    }

    // A valid outcome is kept whatever the stop; reset repeat tracking.
    lastInfraStep = undefined;
    infraRepeatCount = 0;

    // Outcome repairs are harness turns on the same record; each one counts
    // like the turn that needed it.
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

    // A fix round that answers a `changes` review with replies but no diff
    // repeats its tree by design; the fingerprint owns non-empty repeats, so it
    // skips the deferred answer and the round budget bounds the loop instead.
    // The review that judges a reply-only fix repeats the same tree too, so it
    // skips the history fingerprint and lets the round limit decide.
    // An empty gate-fix turn repeats its tree by design too: the checks that
    // follow own the verdict, so a deferred turn must not loop-park a fix the
    // checks would clear. The review round limit still bounds repeated
    // deferrals.
    const answeredIndex = flowIndex.get(rec.step);
    const answeredStep =
      answeredIndex === undefined ? undefined : steps[answeredIndex];
    const replyCount = rec.outcome?.replies?.length ?? 0;
    const answeredReview =
      changesPending &&
      answeredStep !== undefined &&
      !isVerdictStep(answeredStep) &&
      replyCount > 0 &&
      committedNothing(task.kind, rec, priorTree);
    const emptyGateFix =
      gateFix &&
      !changesPending &&
      carriedWork !== true &&
      answeredStep !== undefined &&
      !isVerdictStep(answeredStep) &&
      committedNothing(task.kind, rec, priorTree);
    const fp =
      answeredReview ||
      emptyGateFix ||
      (isVerdictStep(answeredStep) && replyOnlyFix)
        ? null
        : stepFingerprint(task.kind, rec, lastTree);
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
    if (rec.step === "resolve") {
      // The in-flow resolve turn is a real task turn, not a flow step.
      routeResolve(rec);
      continue;
    }
    if (!flowIndex.has(rec.step)) {
      // Merge-conflict implementer attempts are real turns but not flow steps.
      continue;
    }
    // A productive turn starts a new merge attempt: a later conflict gets its
    // own single resolve.
    resolveRan = false;

    round = Math.max(round, rec.round);
    commit = rec.commit ?? commit;
    if (rec.stop?.kind === "refusal") {
      park = makeCause("refused", rec.stop.details ?? "no details");
      phase = "parked";
      continue;
    }
    if (status === "blocked" || status === "failed") {
      park = makeCause(status, outcome?.summary ?? "no summary");
      phase = "parked";
      continue;
    }
    if (status === "upscope") {
      park = makeCause("upscope", outcome?.summary ?? "no summary");
      phase = "parked";
      continue;
    }

    const idx = flowIndex.get(rec.step)!;
    const step = steps[idx]!;
    // An empty commit is its own no-progress signal — unless it answers a
    // `changes` review with replies, whose claims still need a verdict, or
    // carries a continuation's kept work. With no review awaiting, skip the
    // reviewer and park now instead of spending review rounds — except after
    // red checks, where the checks that run next decide: the branch may
    // already be done and only a repeated identical red proves the fix empty.
    let deferredEmpty: { step: string; round: number } | null = null;
    if (!isVerdictStep(step) && committedNothing(task.kind, rec, priorTree)) {
      if (carriedWork !== true && (!changesPending || replyCount === 0)) {
        if (carriedWork === false) {
          park = makeCause(
            "empty-diff",
            `${rec.step} r${rec.round} kept work is already on the head`,
          );
          phase = "parked";
          continue;
        }
        if (gateFix) {
          // The fix answered red checks with no diff; the turn takes the
          // normal productive path below so the following checks settle it.
          deferredEmpty = { step: rec.step, round: rec.round };
        } else {
          park = makeCause(
            "empty-diff",
            `${rec.step} r${rec.round} committed no changes`,
          );
          phase = "parked";
          continue;
        }
      }
      // Deferred: the fix round goes back for a verdict with its outcome's
      // dispositions — or the turn carries a continuation's kept work, which
      // is progress, not an empty diff — or the following checks settle an
      // empty gate fix. Review rounds still bound the loop.
    }
    if (step.qa) {
      const qa = qaReportOf(outcome);
      if (qa?.verdict === "changes") {
        if (isLastReviewCall(step, rec.round)) {
          // The outcome validator refuses this; a recorded changes on the
          // last call is a contract breach, never a merge.
          park = makeCause(
            "invalid-outcome",
            `qa changes on the last acceptance call: ${outcome?.summary ?? "no summary"}`,
          );
          phase = "parked";
          changesPending = false;
          pendingChecks = null;
        } else if (qa.findings.length === 0) {
          park = makeCause(
            "invalid-outcome",
            `qa changes without findings: ${outcome?.summary ?? "no summary"}`,
          );
          phase = "parked";
          changesPending = false;
          pendingChecks = null;
        } else {
          round = rec.round + 1;
          stepIndex = 0;
          gateFix = false;
          gateLastCall = false;
          mergeFix = false;
          phase = firstStep;
          changesPending = true;
          pendingChecks = null;
          verdict = "changes";
        }
        replyOnlyFix = false;
        continue;
      }
      if (qa?.verdict === "accept") {
        stepIndex = idx + 1;
        gateFix = false;
        gateLastCall = false;
        mergeFix = false;
        changesPending = false;
        // Gates run before an acceptance step or the end, exactly as
        // `checksDue` decides for the turn. The checks before QA already
        // judged this tree: do not spend a second run before the reviewer
        // reads the same content.
        const nextStep = steps[stepIndex];
        const checksNext = !nextStep || isAcceptanceStep(nextStep);
        const judged =
          checksNext && rec.tree !== undefined && rec.tree === lastChecksTree;
        pendingChecks =
          checksNext && !judged
            ? { nextIndex: stepIndex, mergeAfter: false }
            : null;
        // A reply-only fix's tree passes through QA to the reviewer: keep the
        // flag so that review also skips the history fingerprint.
        phase =
          checksNext && !judged
            ? "checks"
            : phaseAfter(flow, stepIndex, task.kind);
        continue;
      }
      park = makeCause(
        "invalid-outcome",
        `qa turn delivered no qa verdict: ${outcome?.summary ?? "no summary"}`,
      );
      phase = "parked";
      changesPending = false;
      pendingChecks = null;
      replyOnlyFix = false;
      continue;
    }
    if (step.adjudicate !== undefined) {
      // The adjudicated review's findings: this turn is the only acceptance
      // the implementer sees, so a finding it omits never travels. Its
      // `changes` spends the review's cycle exactly as the review's would.
      if (outcome?.upscope === "yes") {
        park = makeCause("upscope", outcome?.summary ?? "no summary");
        phase = "parked";
        continue;
      }
      verdict = outcome?.verdict;
      if (verdict === "approve") {
        stepIndex = idx + 1;
        gateFix = false;
        gateLastCall = false;
        mergeFix = false;
        changesPending = false;
        pendingChecks = null;
        phase = phaseAfter(flow, stepIndex, task.kind);
      } else if (verdict === "changes") {
        round = rec.round + 1;
        stepIndex = 0;
        gateFix = false;
        gateLastCall = false;
        mergeFix = false;
        phase = firstStep;
        changesPending = true;
        pendingChecks = null;
      } else if (verdict === "reject") {
        park = makeCause("review-rejected", outcome?.summary ?? "no summary");
        phase = "parked";
        changesPending = false;
        pendingChecks = null;
      } else {
        park = makeCause(
          "invalid-outcome",
          `adjudicate turn delivered no review verdict: ${outcome?.summary ?? "no summary"}`,
        );
        phase = "parked";
        changesPending = false;
        pendingChecks = null;
      }
      replyOnlyFix = false;
      continue;
    }
    if (step.review) {
      // Standalone escalation (and any review upscope answer): parks with the
      // same cause shape as a status upscope, whatever the verdict says. The
      // class rewrite is flow's side effect; derive only parks. Non-review
      // steps ignore the field.
      if (outcome?.upscope === "yes") {
        park = makeCause("upscope", outcome?.summary ?? "no summary");
        phase = "parked";
        continue;
      }
      verdict = outcome?.verdict;
      if (verdict === "approve") {
        stepIndex = idx + 1;
        gateFix = false;
        gateLastCall = false;
        mergeFix = false;
        changesPending = false;
        pendingChecks = null;
        phase = phaseAfter(flow, stepIndex, task.kind);
      } else if (verdict === "changes") {
        if (isLastReviewCall(step, rec.round)) {
          // The outcome validator refuses this; a recorded changes on the
          // last call is a contract breach, never a merge.
          park = makeCause(
            "invalid-outcome",
            `changes on the last review call: ${outcome?.summary ?? "no summary"}`,
          );
          phase = "parked";
          changesPending = false;
          pendingChecks = null;
        } else {
          const adjudicator = steps[idx + 1];
          gateFix = false;
          gateLastCall = false;
          mergeFix = false;
          pendingChecks = null;
          changesPending = true;
          if (
            adjudicator !== undefined &&
            isAdjudicatorStep(adjudicator) &&
            adjudicationDue(adjudicator, step, rec.round)
          ) {
            // The findings are not handed to the implementer yet: the
            // adjudicator re-judges them in the same review cycle.
            stepIndex = idx;
            phase = adjudicator.id;
          } else {
            round = rec.round + 1;
            stepIndex = 0;
            phase = firstStep;
          }
        }
      } else if (verdict === "reject") {
        park = makeCause("review-rejected", outcome?.summary ?? "no summary");
        phase = "parked";
      }
      // No `else`: a done review always carries a verdict — outcome repair
      // fails the turn otherwise — so a missing verdict never reaches derive.
      replyOnlyFix = false;
      continue;
    }

    // This turn answers the awaited review, with work or with dispositions.
    replyOnlyFix = answeredReview;
    changesPending = false;
    stepIndex = idx + 1;
    const nextStep = steps[stepIndex];
    if (!nextStep || isAcceptanceStep(nextStep)) {
      pendingChecks = {
        nextIndex: stepIndex,
        mergeAfter: mergeFix,
        ...(deferredEmpty ? { emptyFix: deferredEmpty } : {}),
      };
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
    gateLastCall = false;
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
    gateLastCall: terminal ? undefined : (gateFix && gateLastCall) || undefined,
  };
}
