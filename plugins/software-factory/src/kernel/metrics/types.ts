/** The metrics aggregation's input and result shapes. */

import type { Usage } from "../../harness/types.js";
import type { PriceTable } from "../pricing.js";
import type { QaOnlyCatches } from "../qa.js";
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

/**
 * Park friction: every settled park record, split by cause, beside the merged
 * tasks it took, and the parked slugs whose work landed without the task file
 * being amended past the park.
 */
export interface ParkMetrics {
  /** Settled park records: every slug and every round. */
  records: number;
  /** Distinct slugs behind those records. */
  distinctSlugs: number;
  /** Distinct slugs with a verified merge record. */
  mergedSlugs: number;
  /** Park records per merged slug; null when nothing merged. */
  perMergedTask: number | null;
  /** Records per cause kind; a park with no cause counts as `unknown`. */
  byCause: Record<string, number>;
  /** Parked slugs whose verified merge landed at the task revision it parked. */
  landedUnchanged: number;
  /** Parked slugs whose verified merge landed after the task file was amended. */
  landedAmended: number;
  /** Parked-then-merged slugs whose task file is missing or unreadable. */
  landedUnknown: number;
}

/** One steer leg's measured samples and the steers it could not time. */
export interface SteerLeg {
  /** Steer times in ms, one per steer whose drop and event stamps are both known. */
  samplesMs: number[];
  /**
   * Steers whose time cannot be known: a missing drop stamp, an event with no
   * stamp, or a processed steer with no recorded event to time.
   */
  unknown: number;
}

/**
 * Steer latency for the goal's mailbox: drop to the PM's accepted route, drop
 * to the final answer, and the steers still waiting for an answer. A steer is
 * timed from the stamp in its inbox id, so a steer dropped without one reads
 * unknown.
 */
export interface SteerLatency {
  /** Steers the mailbox holds: inbox plus processed. */
  steers: number;
  route: SteerLeg;
  answer: SteerLeg;
  /** Steers with no final answer: still in the inbox, routed or not. */
  unanswered: number;
}

/** A zero-edit turn, split by what the turn owed. */
export interface ZeroEditCounts {
  /** Reviews, QA and boundary turns: the answer is the product. */
  reply: number;
  /** Spike turns: the finding is the product. */
  finding: number;
  /** Work steps whose turn owed a diff and committed none. */
  noop: number;
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
  /** Sum of only the figures the harnesses reported; null when none did. */
  harnessCostPerMergedTask: number | null;
  roles: Record<string, RoleMetrics>;
  aliases: Record<string, AliasMetrics>;
  models: Record<string, ModelMetrics>;
  architect: ArchitectMetrics;
  /** Architect marks on plan-review findings in this iteration. */
  planReviewMarks: PlanReviewMarkCounts;
  /** QA findings no earlier gate or reviewer finding matched, counted per task. */
  qaOnlyCatches: QaOnlyCatches;
  unpricedTurns: number;
  /** Wasted turns, each naming its record; rebutted reviews counted apart. */
  waste: WasteAccounting;
  incidents: IncidentCounts;
  /** Parks that name no-progress or an empty diff; the loop signals in kernel-0. */
  loopIncidents: number;
  /** Settled parks by cause, the merged tasks they took, and park landings. */
  parks: ParkMetrics;
  /** Agent turns that committed nothing, by what they owed. */
  zeroEdit: ZeroEditCounts;
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

export interface MetricsTotals
  extends Omit<IterationMetrics, "n" | "status" | "parks" | "zeroEdit"> {
  iterations: number;
}

export interface GoalMetrics {
  iterations: IterationMetrics[];
  totals: MetricsTotals;
  /** The mailbox's steer latency at write time; a goal fact, not an iteration sum. */
  steers: SteerLatency;
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
