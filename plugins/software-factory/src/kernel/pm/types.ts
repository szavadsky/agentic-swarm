import type { SessionRef, Stop } from "../../harness/types.js";
import type { Steer } from "../mailbox.js";
import type { PlanFile } from "../plan-file.js";
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

/** One rung's alias and the mandate it ran under. */
export interface PmRungStep {
  alias: string;
  mandate: PmMandate;
}

/** One plan and its bytes before a turn; an absent plan is restored by deleting it. */
export interface PlanSnapshot {
  plan: PlanFile;
  text: string;
  exists: boolean;
}

/** The plans and every task file as they stood before a turn. */
export interface TurnSnapshot {
  plans: PlanSnapshot[];
  tasks: Map<string, string>;
}

/** What a PM ladder takes once, before rung 1. */
export interface PmTurnSetup {
  snapshot: TurnSnapshot;
  /** Every plan on disk: the ownership snapshot a turn is rolled back against. */
  plansBefore: PlanSnapshot[];
  /** The plan(s) this PM owns: the goal plan, or one epic's plan. */
  scopePlans: PlanSnapshot[];
  scope: PmScope;
  planList: string;
  planDiff: string;
  /** The current derive iteration; its own baseline is the previous one on a re-derive. */
  iteration: number;
  /** That scope's compacted session, resumed when the target can. */
  priorSession?: SessionRef;
  taskSnapshot: Map<string, string>;
  baseline: string[];
  baselineKeys: Set<string>;
}

/** A steer batch grouped by the PM that routes it, goal first then epics in order. */
export interface SteerScopeGroup {
  scope: PmScope;
  steers: Steer[];
}

/**
 * Which follow-up slugs a plan-check turn resumed; a cancel spends its slug
 * and a leave keeps it for the architect. `architect` is the exit for a clean
 * turn the graph still contradicts: its routes are committed, and the findings
 * no rung introduced travel to the architect like the other PM ladders.
 */
export type PlanCheckPmResult =
  | { status: "routed"; continued: string[]; left: string[] }
  | {
      status: "architect";
      continued: string[];
      left: string[];
      findings: string[];
    }
  /** A rung ended on an infra stop; the writes are rolled back for the boundary. */
  | { status: "infra"; continued: []; left: string[] }
  /** Every tier failed both of its turns; the boundary reads the attempts. */
  | { status: "exhausted"; continued: []; left: string[] };

/**
 * A steer turn's result. `architect` is the outlet for anything the PM cannot
 * decide: a claimed steer routed there, a graph finding no rung can derive
 * away, or a ladder that exhausted with no route at all. The boundary is the
 * only consumer of those, so the caller runs it before dispatch.
 */
export type SteerPmRun =
  | { status: "routed"; routes: NonNullable<Outcome["steerRoutes"]> }
  | {
      status: "architect";
      routes: NonNullable<Outcome["steerRoutes"]>;
      findings: string[];
    }
  | { status: "infra"; stop: PmInfraStop };
