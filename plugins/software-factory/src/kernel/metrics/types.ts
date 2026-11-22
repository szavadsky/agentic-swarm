/** The metrics aggregation's input and result shapes. */

import type { Usage } from "../../harness/types.js";
import type { PriceTable } from "../pricing.js";
import type { SummaryStatus } from "../summary.js";
import type { State, StepRecord } from "../types.js";
import type { WasteAccounting, WasteCounts } from "../waste.js";

/** Incident launches by kind; `unknown` is an old record without a stored kind. */
export interface LaunchCounts {
  glitch: number;
  "change-request": number;
  "qa-finding": number;
  failure: number;
  unknown: number;
}

/** Spend and work one role, alias or model accumulated over an iteration. */
export interface GroupMetrics {
  turns: number;
  usage: Usage;
  tokens: number;
  /** UTF-8 bytes of the rendered prompts sent for these turns. */
  promptBytes: number;
  /** Turns whose model the harness did not price and the table does not carry. */
  unpricedTurns: number;
  /** Files changed by these turns' commits. */
  edits: number;
  addedLines: number;
  removedLines: number;
  /** Gate runs credited to this group; every gate run lands on the script role. */
  testRuns: number;
  /** Incident launches for these turns, per kind. */
  launches: LaunchCounts;
  /** Wasted turns in this group, by reason. */
  waste: WasteCounts;
  /** Review turns whose verdict was `changes`: accepted tax, not waste. */
  rebuttedReviews: number;
}

export interface RoleMetrics extends GroupMetrics {
  role: string;
}

export interface AliasMetrics extends GroupMetrics {
  alias: string;
}

export interface ModelMetrics extends GroupMetrics {
  model: string;
}

/**
 * Incidents that consume turns and money without producing a flow step:
 * harness retries and fallback hops, outcome repairs, conflicts, failed
 * merged-result gates, gate flakes, and the park causes that are not task failures.
 */
export interface IncidentCounts {
  /** Extra calls on the same model after an infra stop. */
  infraRetries: number;
  /** Calls moved to the next model in the chain after an infra stop. */
  fallbackHops: number;
  /** Extra harness turns spent re-asking for a valid outcome. */
  outcomeRepairs: number;
  mergeConflicts: number;
  /** `merge-checks` that went red without a recorded cause. */
  mergedGateFailures: number;
  /** Gates that went red, then green on the same tree after one re-run. */
  gateFlakes: number;
  roundLimitParks: number;
  noProgressParks: number;
  /** Parks whose cause names a turn that committed no changes. */
  emptyDiffParks: number;
  /** Parks whose cause names a turn that could not fit its context. */
  overflowParks: number;
}

/** The architect's marks on a plan review: whether the advisory review helped. */
export interface PlanReviewMarkCounts {
  helpful: number;
  unhelpful: number;
}

export interface ArchitectMetrics {
  turns: number;
  launches: number;
  usage: Usage;
  tokens: number;
  /** 0 when no turn had a known cost, or when all known costs are 0. */
  costShare: number;
  tokenShare: number;
  turnShare: number;
  unpricedTurns: number;
}

export interface IterationMetrics {
  n: number;
  status: SummaryStatus;
  turns: number;
  merged: string[];
  parked: string[];
  /** Slugs whose task files were quarantined (or reported unreadable) this iteration. */
  quarantined: string[];
  usage: Usage;
  tokens: number;
  /**
   * Priced cost per merged task, null only when nothing merged or no turn had
   * a known cost. Partial when `unpricedTurns > 0`: the numerator covers
   * priced turns only.
   */
  costPerMergedTask: number | null;
  /** List-price equivalent per merged task; same partial rule as the priced one. */
  listCostPerMergedTask: number | null;
  roles: Record<string, RoleMetrics>;
  aliases: Record<string, AliasMetrics>;
  models: Record<string, ModelMetrics>;
  architect: ArchitectMetrics;
  /** Architect marks on plan-review findings in this iteration. */
  planReviewMarks: PlanReviewMarkCounts;
  unpricedTurns: number;
  /** Wasted turns, each naming its record; rebutted reviews counted apart. */
  waste: WasteAccounting;
  incidents: IncidentCounts;
  /** Parks that name no-progress or an empty diff; the loop signals in kernel-0. */
  loopIncidents: number;
  /** Steers moved from inbox to processed during this iteration. */
  humanInterventions: number;
  /**
   * Observable operator acts: processed steers plus containment
   * outside-changes and integration-moved merges. Hand fixes, promotions,
   * merges, verifications, relaunches and config edits outside the factory
   * artifacts stay in the journal; this is the lower bound the records show.
   */
  operatorActs: number;
  /** Wall ms in checks/merge-checks records; wallMs falls back to timestamps. */
  gateWallMs: number;
  /** Wall ms in commit records. */
  commitWallMs: number;
  /** Checks/merge-checks records in this iteration. */
  gateRuns: number;
  /** Gates run across those records. */
  testRuns: number;
  /** Files changed by agent-turn commits in this iteration. */
  edits: number;
  addedLines: number;
  removedLines: number;
}

export interface MetricsTotals extends Omit<IterationMetrics, "n" | "status"> {
  iterations: number;
}

export interface GoalMetrics {
  iterations: IterationMetrics[];
  totals: MetricsTotals;
}

export interface MetricsInput {
  iteration: number;
  status: SummaryStatus;
  records: StepRecord[];
  state?: State;
  /** Step id -> role, from the process flow config. */
  roleByStep?: Record<string, string>;
  /** OpenRouter price table, loaded once per write. */
  prices?: PriceTable;
  /** Harness model id -> OpenRouter model id, from the run config. */
  priceIds?: Record<string, string>;
  humanInterventions?: number;
}
