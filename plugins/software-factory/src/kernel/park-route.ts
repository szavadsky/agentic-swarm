import type { Cause, CauseKind, StallDecision } from "./types.js";

/** This repo's default decision for a park cause, and the evidence that overrides it. */
export interface ParkDefault {
  action: StallDecision;
  /** Why history points here, in one clause. */
  reason: string;
  /** The evidence that turns the default into `leave` for the architect. */
  exception: string;
}

/**
 * Per-kind default routing from `.factory/spikes/park-history-spike.md`, the
 * interface `park-recover` follows. The kind is the closed cause vocabulary,
 * so rewording a cause's detail never changes its route; a kind with no entry
 * is the architect's (`leave`). These are defaults, not rules: the PM reads the
 * park's records and branch and may choose any decision the evidence supports.
 */
const ROUTES: Partial<Record<CauseKind, ParkDefault>> = {
  failed: {
    action: "amend",
    reason: "the work and the agent's evidence are on the kept branch",
    exception: "the same failure repeats or the worktree sits at base; replace",
  },
  upscope: {
    action: "amend",
    reason: "the kept work is usually done and the task's scope too narrow",
    exception: "the work needs a different seam or milestone; split or replace",
  },
  conflict: {
    action: "amend",
    reason:
      "the first turn merges the head into the kept branch and resolves the conflict in-turn",
    exception: "the conflict is semantic, in intent rather than files",
  },
  "base-conflict": {
    action: "amend",
    reason:
      "the first turn merges the head into the kept branch and resolves the conflict in-turn",
    exception: "the conflict is semantic, in intent rather than files",
  },
  containment: {
    action: "amend",
    reason:
      "the kept work stands once the turn stops writing outside its worktree",
    exception: "kernel containment is still broken",
  },
  gates: {
    action: "amend",
    reason: "fix the named gate on the kept branch",
    exception: "the gate is already red on base or the repo config",
  },
  "empty-diff": {
    action: "amend",
    reason: "the kept work was sufficient; the brief or the direction was not",
    exception:
      "the branch holds nothing the head lacks and the task is superseded; replace",
  },
  "no-progress": {
    action: "amend",
    reason: "keep the branch and change the approach",
    exception: "the same tree repeats after the alternate; replace",
  },
  budget: {
    action: "amend",
    reason: "no code change is owed; the turn budget is gone from head",
    exception: "the counter recurs on head; fix it, not the task",
  },
  steer: {
    action: "amend",
    reason: "answer the steer in the brief and rerun the kept branch",
    exception: "the steer changes the milestone or intent",
  },
};

/**
 * The kinds a park routes to `leave`: a rejected premise, a design blocker, a
 * contract breach or a broken environment is direction, not a retry. Any kind
 * absent from both tables is the architect's too, so this list only documents
 * the deliberate ones.
 */
const LEAVE: Partial<Record<CauseKind, ParkDefault>> = {
  "review-rejected": {
    action: "leave",
    reason: "a rejected premise is a direction decision for the architect",
    exception:
      "the rejection names concrete findings and the premise stands; amend",
  },
  blocked: {
    action: "leave",
    reason: "a design or approach blocker is the architect's",
    exception: "the park is a test or environment conflict; amend",
  },
  refused: {
    action: "leave",
    reason:
      "a refused turn means the ask and the agent disagree on the contract",
    exception: "the ask can be restated in the brief; amend",
  },
  "invalid-outcome": {
    action: "leave",
    reason: "the contract breach needs the architect's read",
    exception: "the kept work is complete and the breach is mechanical; amend",
  },
  infra: {
    action: "leave",
    reason: "the gate or environment could not start",
    exception:
      "the cause is transient and the same gate passed elsewhere; amend",
  },
  setup: {
    action: "leave",
    reason: "the environment broke before the first turn",
    exception: "the setup command is fixed on head; amend",
  },
  stuck: {
    action: "leave",
    reason: "the flow has no next action; that is a plan or config problem",
    exception: "the flow or task type is now configured; amend",
  },
};

const ARCHITECT_DEFAULT: ParkDefault = {
  action: "leave",
  reason: "an unclassified park is the architect's",
  exception: "the records name a fixable cause; amend",
};

/** The default decision for one park's cause. */
export function defaultParkRoute(cause: Cause): ParkDefault {
  return ROUTES[cause.kind] ?? LEAVE[cause.kind] ?? ARCHITECT_DEFAULT;
}

/** One brief line: the default and the evidence that overrides it. */
export function formatParkDefault(cause: Cause): string {
  const route = defaultParkRoute(cause);
  return `${route.action} — ${route.reason}; ${route.exception}`;
}
