/** Summary input and the fact shapes the renderer reads. */

import type { IterationMetrics, SteerLatency } from "../metrics.js";
import type { PriceTable } from "../pricing.js";
import type {
  Cause,
  CauseKind,
  GoalDecision,
  ReportDebt,
  State,
  StepRecord,
} from "../types.js";
import type { summaryNamedRows } from "./facts.js";

export type SummaryStatus =
  | "goal-met"
  | "in-progress"
  | "blocked-by-user"
  | "stopped-with-debt";

export interface SummaryInput {
  iteration: number;
  state: State;
  records: StepRecord[];
  decision?: GoalDecision;
  /** Boundary/launch cause shown as a remarkable (PM ladder, crash). */
  cause?: Cause;
  /** Launch result; wins over `decision`, which is display-only. */
  status?: SummaryStatus;
  /** Step id -> role, from the process flow config. */
  roleByStep?: Record<string, string>;
  /** OpenRouter price table, loaded once per write. */
  prices?: PriceTable;
  /** Harness model id -> OpenRouter model id, from the run config. */
  priceIds?: Record<string, string>;
  /** Steers moved to processed; feeds the operator-act counter. */
  humanInterventions?: number;
}

/** The task/slug facts one summary renders. */
export interface SummaryTaskFacts {
  merged: string[];
  finished: string[];
  parkedByKind: Map<CauseKind, { slug: string; detail: string }[]>;
  pending: string[];
  parks: string[];
  cancelled: string[];
  /** Material open debt after every recorded closure: the goal's distance. */
  open: readonly ReportDebt[];
}

/** The remark/assumption/debt lines one summary renders. */
export interface SummaryRemarkFacts {
  ownerRemarkable: string[];
  unanswered: string[];
  remarks: string[];
  assumed: string[];
  debtOpened: string[];
  debtClosed: string[];
}

/** Everything the summary's line builders read. */
export interface SummaryRender {
  iteration: number;
  status: SummaryStatus;
  decision: SummaryInput["decision"];
  budgetStop: string | undefined;
  architect: StepRecord | undefined;
  facts: SummaryTaskFacts;
  remarks: SummaryRemarkFacts;
  computed: IterationMetrics;
  /** The mailbox's steer latency; a goal fact the iteration summary reports. */
  steers: SteerLatency;
  named: ReturnType<typeof summaryNamedRows>;
  agentTurns: number;
  scriptTurns: number;
  baseLines: string[];
  distanceDebt: string[];
}
