import type { PipelineLimits } from "./artifacts.js";
import { fingerprintText, fingerprintObject } from "./fingerprint.js";

export const DEFAULT_LIMITS: Required<PipelineLimits> = {
  maxParallelItems: 2,
  maxParallelTurns: 4,
  maxStepAttempts: 3,
  maxFixRounds: 3,
  maxPlanReviewRounds: 3,
  maxAmendmentsPerIteration: 2,
  maxIterations: 3,
  maxSplitDepth: 3,
  maxConsultsPerItem: 3,
  maxInterruptions: 3,
  maxInfraRetries: 3,
  maxInfraRetriesExpensive: 1,
  gateRetries: 1,
  gateTimeoutSec: 900,
  storyMaxProdLines: 400,
  simpleMaxProdLines: 20,
  stubMaxProdLines: 30,
  maxMilestones: 8,
  maxItemsPerPlan: 50,
  checkOutputBytes: 4000,
  hydrationBytes: 40000,
  stepTranscriptWarningBytes: 5 * 1024 * 1024,
  stepToolCallWarning: 60,
  contextPackBytes: 40000,
  timeoutNudgeSec: 300,
  minFreeDiskMb: 2048,
  steerPollSec: 60,
  maxEmptyWaves: 3,
};

export function resolveLimits(limits?: PipelineLimits): Required<PipelineLimits> {
  return {
    ...DEFAULT_LIMITS,
    ...limits,
  };
}

/**
 * Checks step attempt bounds and failing-check fingerprint loops (§12.2).
 * Loop detector: same failing-check fingerprint as previous attempt.
 */
export function checkStepAttempts(
  attempt: number,
  maxStepAttempts: number,
  previousFingerprints: string[],
  currentFingerprint?: string
): { exhausted: boolean; noProgress: boolean } {
  const exhausted = attempt > maxStepAttempts;
  let noProgress = false;
  if (
    currentFingerprint &&
    previousFingerprints.length > 0 &&
    previousFingerprints[previousFingerprints.length - 1] === currentFingerprint
  ) {
    noProgress = true;
  }
  return { exhausted, noProgress };
}

/**
 * Checks interruption count (§12.2, §6.3.6).
 * Record with started and no final meta -> interrupted; next attempt does not
 * count toward maxStepAttempts until maxInterruptions.
 */
export function checkInterruptions(
  count: number,
  maxInterruptions: number
): { exhausted: boolean } {
  return { exhausted: count >= maxInterruptions };
}

/**
 * Checks fix rounds bounds and progress (§12.2).
 * Loop detector: empty diff since last round, or repeated suggestion fingerprints.
 */
export function checkFixRounds(
  round: number,
  maxFixRounds: number,
  hasDiff: boolean,
  previousSuggestionFingerprints: string[],
  currentSuggestionFingerprint?: string
): { exhausted: boolean; noProgress: boolean } {
  const exhausted = round > maxFixRounds;
  let noProgress = !hasDiff;
  if (
    !noProgress &&
    currentSuggestionFingerprint &&
    previousSuggestionFingerprints.includes(currentSuggestionFingerprint)
  ) {
    noProgress = true;
  }
  return { exhausted, noProgress };
}

/**
 * Checks consults per item (§12.2).
 * Loop detector: same decision twice without new diff.
 */
export function checkConsultsPerItem(
  consultCount: number,
  maxConsults: number,
  hasDiffSinceLastConsult: boolean,
  previousDecisionFingerprints: string[],
  currentDecisionFingerprint?: string
): { exhausted: boolean; noProgress: boolean } {
  const exhausted = consultCount >= maxConsults;
  let noProgress = false;
  if (
    !hasDiffSinceLastConsult &&
    currentDecisionFingerprint &&
    previousDecisionFingerprints.includes(currentDecisionFingerprint)
  ) {
    noProgress = true;
  }
  return { exhausted, noProgress };
}

/**
 * Checks plan review rounds (§12.2).
 * Loop detector: repeated fix fingerprints.
 */
export function checkPlanReviewRounds(
  round: number,
  maxPlanReviewRounds: number,
  previousReviewFingerprints: string[],
  currentReviewFingerprint?: string
): { exhausted: boolean; noProgress: boolean } {
  const exhausted = round > maxPlanReviewRounds;
  let noProgress = false;
  if (
    currentReviewFingerprint &&
    previousReviewFingerprints.includes(currentReviewFingerprint)
  ) {
    noProgress = true;
  }
  return { exhausted, noProgress };
}

/**
 * Checks amendments per iteration (§12.2).
 */
export function checkAmendments(
  amendmentCount: number,
  maxAmendments: number
): { exhausted: boolean } {
  return { exhausted: amendmentCount >= maxAmendments };
}

/**
 * Checks task iteration bounds (§12.2).
 * Loop detector: two consecutive iterations with zero merged items -> blocked.
 */
export function checkIterations(
  iterationCount: number,
  maxIterations: number,
  mergedItemsPerIteration: number[]
): { exhausted: boolean; zeroProgress: boolean } {
  const exhausted = iterationCount > maxIterations;
  let zeroProgress = false;
  if (mergedItemsPerIteration.length >= 2) {
    const lastTwo = mergedItemsPerIteration.slice(-2);
    if (lastTwo.every((count) => count === 0)) {
      zeroProgress = true;
    }
  }
  return { exhausted, zeroProgress };
}

/**
 * Computes fingerprint of review suggestions.
 */
export function fingerprintSuggestions(suggestions: unknown): string {
  return fingerprintObject(suggestions);
}

/**
 * Computes fingerprint of check failure summary.
 */
export function fingerprintCheckFailure(summary: string): string {
  return fingerprintText(summary);
}
