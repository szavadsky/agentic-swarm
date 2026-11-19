import type { StallDecision } from "./types.js";

/** This repo's default decision for a park cause, and the evidence that overrides it. */
export interface ParkDefault {
  action: StallDecision;
  /** Why history points here, in one clause. */
  reason: string;
  /** The evidence that turns the default into `leave` for the architect. */
  exception: string;
}

interface Route {
  prefix: string;
  default: ParkDefault;
}

/**
 * Per-cause default routing from `.factory/spikes/park-history-spike.md`, the
 * interface `park-recover` follows. The raw cause carries the detail, so the
 * more specific prefixes come first; an unmatched cause is the architect's.
 * These are defaults, not rules: the PM reads the park's records and branch
 * and may choose any decision the evidence supports.
 */
const ROUTES: readonly Route[] = [
  {
    prefix: "failed: invalid outcome",
    default: {
      action: "amend",
      reason:
        "the work is on the kept branch and only the turn's contract failed",
      exception:
        "the turn keeps returning no usage or no output; retry the alternate, not the brief",
    },
  },
  {
    prefix: "failed: infrastructure",
    default: {
      action: "amend",
      reason:
        "a provider or environment stop is not a task failure; retry on the next alternate",
      exception: "the environment is broken for every task",
    },
  },
  {
    prefix: "failed: no work",
    default: {
      action: "replace",
      reason: "the branch holds no work; write a smaller, explicit task",
      exception:
        "the task can be narrowed and the branch has usable work; amend instead",
    },
  },
  {
    prefix: "failed:",
    default: {
      action: "amend",
      reason: "the work and the agent's evidence are on the kept branch",
      exception:
        "the same failure repeats or the worktree sits at base; replace",
    },
  },
  {
    prefix: "review rejected:",
    default: {
      action: "leave",
      reason: "a rejected premise is a direction decision for the architect",
      exception:
        "the rejection names concrete findings and the premise stands; amend",
    },
  },
  {
    prefix: "blocked:",
    default: {
      action: "leave",
      reason: "a design or approach blocker is the architect's",
      exception: "the park is a test or environment conflict; amend",
    },
  },
  {
    prefix: "upscope:",
    default: {
      action: "amend",
      reason: "the kept work is usually done and the task's scope too narrow",
      exception:
        "the work needs a different seam or milestone; split or replace",
    },
  },
  {
    prefix: "conflict:",
    default: {
      action: "amend",
      reason:
        "the first turn merges the head into the kept branch and resolves the conflict in-turn",
      exception: "the conflict is semantic, in intent rather than files",
    },
  },
  {
    prefix: "base-conflict:",
    default: {
      action: "amend",
      reason:
        "the first turn merges the head into the kept branch and resolves the conflict in-turn",
      exception: "the conflict is semantic, in intent rather than files",
    },
  },
  {
    prefix: "containment:",
    default: {
      action: "amend",
      reason:
        "the kept work stands once the turn stops writing outside its worktree",
      exception: "kernel containment is still broken",
    },
  },
  {
    prefix: "gates:",
    default: {
      action: "amend",
      reason: "fix the named gate on the kept branch",
      exception: "the gate is already red on base or the repo config",
    },
  },
  {
    prefix: "empty-diff:",
    default: {
      action: "amend",
      reason:
        "the kept work was sufficient; the brief or the direction was not",
      exception:
        "the branch holds nothing the head lacks and the task is superseded; replace",
    },
  },
  {
    prefix: "no-progress:",
    default: {
      action: "amend",
      reason: "keep the branch and change the approach",
      exception: "the same tree repeats after the alternate; replace",
    },
  },
  {
    prefix: "budget:",
    default: {
      action: "amend",
      reason: "no code change is owed; the turn budget is gone from head",
      exception: "the counter recurs on head; fix it, not the task",
    },
  },
  {
    prefix: "steer:",
    default: {
      action: "amend",
      reason: "answer the steer in the brief and rerun the kept branch",
      exception: "the steer changes the milestone or intent",
    },
  },
  {
    prefix: "refused:",
    default: {
      action: "leave",
      reason:
        "a refused turn means the ask and the agent disagree on the contract",
      exception: "the ask can be restated in the brief; amend",
    },
  },
  {
    prefix: "invalid outcome:",
    default: {
      action: "leave",
      reason: "the contract breach needs the architect's read",
      exception:
        "the kept work is complete and the breach is mechanical; amend",
    },
  },
  {
    prefix: "infra:",
    default: {
      action: "leave",
      reason: "the gate or environment could not start",
      exception:
        "the cause is transient and the same gate passed elsewhere; amend",
    },
  },
  {
    prefix: "worktree setup failed:",
    default: {
      action: "leave",
      reason: "the environment broke before the first turn",
      exception: "the setup command is fixed on head; amend",
    },
  },
  {
    prefix: "stuck:",
    default: {
      action: "leave",
      reason: "the flow has no next action; that is a plan or config problem",
      exception: "the flow or task type is now configured; amend",
    },
  },
];

/** The default decision for one park's raw cause and detail. */
export function defaultParkRoute(cause: string): ParkDefault {
  const route = ROUTES.find((entry) => cause.startsWith(entry.prefix));
  return (
    route?.default ?? {
      action: "leave",
      reason: "an unclassified park is the architect's",
      exception: "the records name a fixable cause; amend",
    }
  );
}

/** One brief line: the default and the evidence that overrides it. */
export function formatParkDefault(cause: string): string {
  const route = defaultParkRoute(cause);
  return `${route.action} — ${route.reason}; ${route.exception}`;
}
