import type { Stop } from "../../harness/types.js";
import type { Outcome } from "../types.js";

export type PmMandate =
  | "first"
  | "retry"
  | "escalated-first"
  | "escalated-retry";

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

/** One entry of a steer turn's `steerRoutes`. */
export type SteerRouteEntry = NonNullable<Outcome["steerRoutes"]>[number];
