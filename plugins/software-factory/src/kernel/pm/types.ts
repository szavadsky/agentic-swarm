import type { Stop } from "../../harness/types.js";
import type { Outcome } from "../types.js";

export type PmMandate =
  | "first"
  | "retry"
  | "escalated-first"
  | "escalated-retry";

/**
 * Whose plan and tasks one PM run owns: the goal's own plan, or one epic's.
 * A saga launches one PM per epic plus the top; depth 1 has the goal only.
 */
export type PmScope = { kind: "goal" } | { kind: "epic"; epic: string };

/** One attempted PM turn; the round is its 1-based position in the ladder. */
export interface PmRung {
  round: number;
  alias: string;
  model: string;
  failure: string;
}

/** A rung ended on infrastructure trouble the alias's own fallbacks could not cure. */
export type PmInfraStop = Extract<Stop, { kind: "infra" }>;

export type PmRun =
  | { status: "done"; outcome: Outcome; rungs: PmRung[] }
  /** An escalated rung stopped the ladder with a question for the architect. */
  | { status: "asked"; outcome: Outcome; rungs: PmRung[] }
  /**
   * The graph still raises findings the turn did not introduce; no rung can
   * fix them, so the ladder stops and the findings go to the architect.
   */
  | { status: "architect"; findings: string[]; rungs: PmRung[] }
  /** A rung ended on an infra stop; a stronger model would not cure it, so the ladder stops. */
  | { status: "infra"; stop: PmInfraStop; rungs: PmRung[] }
  /** Every tier failed both of its turns. */
  | { status: "exhausted"; rungs: PmRung[] };

/** The PM stage's result: the ladder's, or a config-only step's infra stop. */
export type PmFlowRun =
  | PmRun
  | { status: "step-infra"; step: string; stop: PmInfraStop };

/** One entry of a steer turn's `steerRoutes`. */
export type SteerRouteEntry = NonNullable<Outcome["steerRoutes"]>[number];
