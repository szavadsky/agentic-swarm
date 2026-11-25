import { launchKindOf } from "./metrics.js";
import { revisionStart } from "./revision-start.js";
import type {
  FlowDefinition,
  FlowStep,
  StepLaunches,
  StepRecord,
} from "./types.js";

/** Reviewer default: the first two reviews may request changes; the third is the last call. */
export const DEFAULT_CHANGE_REQUESTS = 2;

/**
 * A step that accepts or sends back the work: a review or QA. Each owns its
 * own change-request budget, both are gated before they read the tree, and
 * both end with a verdict rather than a product.
 */
export function isAcceptanceStep(step: FlowStep | undefined): boolean {
  return step?.review === true || step?.qa === true;
}

/** A review adjudicator: a verdict-only turn that re-judges a review's findings. */
export function isAdjudicatorStep(step: FlowStep | undefined): boolean {
  return step?.adjudicate !== undefined;
}

/**
 * A turn that delivers a verdict, not a product: review, QA or adjudicator.
 * These never count as productive turns and never own an empty diff.
 */
export function isVerdictStep(step: FlowStep | undefined): boolean {
  return isAcceptanceStep(step) || isAdjudicatorStep(step);
}

/** Change requests a step's agent may issue before its call is the last one. */
export function changeRequestBound(step: FlowStep): number {
  return step.changeRequests ?? DEFAULT_CHANGE_REQUESTS;
}

/** Total acceptance calls the bound allows: one per accepted change request plus the last call. */
export function reviewRoundLimit(step: FlowStep): number {
  return changeRequestBound(step) + 1;
}

/** True when this acceptance call is the step's last: its own change requests reached the bound. */
export function isLastReviewCall(
  step: FlowStep,
  changeRequests: number,
): boolean {
  return changeRequests >= changeRequestBound(step);
}

/** A step with no recorded launches yet. */
export function emptyLaunches(): StepLaunches {
  return { glitches: 0, changeRequests: 0, failures: 0 };
}

/** One step's launch counts, zero for a step that never ran. */
export function launchCounts(
  launches: Readonly<Record<string, StepLaunches>> | undefined,
  stepId: string,
): StepLaunches {
  return launches?.[stepId] ?? emptyLaunches();
}

/** Add one ended turn to its step's counts; the launch kind decides the bucket. */
export function countLaunch(counts: StepLaunches, rec: StepRecord): void {
  const kind = rec.launchKind ?? launchKindOf(rec);
  if (kind === "glitch") counts.glitches += 1;
  else if (kind === "failure") counts.failures += 1;
  else if (kind === "change-request" || kind === "qa-finding")
    counts.changeRequests += 1;
}

/** The launches one step already ended before the record at `started.seq`, within its revision. */
export function launchesBefore(
  records: readonly StepRecord[],
  started: { step: string; seq: number; slug?: string; revision?: number },
): StepLaunches {
  const counts = emptyLaunches();
  const before = records.filter(
    (rec) =>
      rec.seq < started.seq &&
      (started.slug === undefined || rec.slug === started.slug),
  );
  const owned = before.slice(revisionStart(started.revision ?? 0, before));
  for (const rec of owned) {
    if (!rec.endedAt || rec.actor !== "agent") continue;
    if (rec.step !== started.step) continue;
    countLaunch(counts, rec);
  }
  return counts;
}

/**
 * Whether an adjudicator step runs after this review's `changes`. `all` runs
 * on every change-bearing cycle; `last` only on the final cycle whose change
 * request is still honored, where no later review re-judges the implementer's
 * dispositions.
 */
export function adjudicationDue(
  adjudicator: FlowStep,
  review: FlowStep,
  round: number,
): boolean {
  if (adjudicator.adjudicate === "all") return true;
  const bound = changeRequestBound(review);
  return bound > 0 && round >= bound;
}

/**
 * Configured flow steps that dispatch to agents, filtering out the script
 * steps. `checks` is the gate phase; `resolve` runs only after a merge
 * conflicts, never in the normal sequence.
 */
export function agentSteps(flow: FlowDefinition): FlowStep[] {
  return flow.steps.filter((s) => s.id !== "checks" && s.id !== "resolve");
}

/** Checks step in flow definition, if configured. */
function checksStep(flow: FlowDefinition): FlowStep | undefined {
  return flow.steps.find((s) => s.id === "checks");
}

/** Change requests the checks step may issue before its call is the last one. */
function checksChangeRequestBound(flow: FlowDefinition): number {
  const step = checksStep(flow);
  return step?.changeRequests ?? DEFAULT_CHANGE_REQUESTS;
}

/** Total fix calls the bound allows: one per accepted change request plus the last call. */
export function checksFixLimit(flow: FlowDefinition): number {
  return checksChangeRequestBound(flow) + 1;
}

/** True when this gate-fix turn is the step's last call: no further red gates are allowed. */
export function isLastChecksFixCall(
  flow: FlowDefinition,
  fixCount: number,
): boolean {
  return fixCount > checksChangeRequestBound(flow);
}
