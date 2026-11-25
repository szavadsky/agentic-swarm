/** The status snapshot the page and `factory status --json` read. */

import { type PriceSource } from "./openrouter.js";
import type { PriceTable } from "./pricing.js";
import type {
  StatusConcern,
  StatusMailbox,
  StatusOpenConcern,
  StatusSteer,
  StatusStop,
} from "./status-triage.js";
import { type StatusSummary } from "./status-summary.js";
import type { IntentStatusArtifact } from "./summary/types.js";
import type {
  ArtifactStore,
  FlowDefinition,
  GoalStatus,
  ReportDebt as StatusDebt,
  ReportTask,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";

/** One task as status.json names it, with the record a dashboard can link. */
export type StatusTask = ReportTask;

export interface StatusCost {
  turns: number;
  tokens: number;
  /** Sum of the figures the harnesses reported; null when none reported one. */
  harnessCostUsd: number | null;
  /** OpenRouter list-price equivalent; null when no model is priced. */
  listCostUsd: number | null;
  unpricedTurns: number;
}

export interface StatusWork {
  turns: number;
  edits: number;
  addedLines: number;
  removedLines: number;
  testRuns: number;
}

/** The snapshot `factory status --json` prints and the dashboard reads. */
export interface StatusDocument {
  goal: string;
  status: GoalStatus;
  /** Highest iteration seen in the records. */
  iteration: number;
  /** Iterations recorded so far; equals `iteration` and names the count. */
  iterations: number;
  updatedAt: string;
  /**
   * The one-paragraph status the user reads. A PM turn's summary when one was
   * written; otherwise the kernel's mechanical account, so records never read
   * as an unknown status.
   */
  summary: StatusSummary;
  tasks: {
    open: StatusTask[];
    merged: StatusTask[];
    finished: StatusTask[];
    parked: StatusTask[];
    /**
     * Parks whose kept work landed through a `base` continuation; counted
     * apart from live parks.
     */
    superseded: StatusTask[];
    cancelled: StatusTask[];
  };
  distance: {
    pending: string[];
    parks: string[];
    openDebt: StatusDebt[];
  };
  concerns: StatusConcern[];
  /** Open, non-FYI concerns: what the dashboard's default view lists. */
  openConcerns: StatusOpenConcern[];
  /** Every steer the mailbox or a route record names. */
  steers: StatusSteer[];
  /** How the last launch stopped; absent while it runs or before the first launch. */
  stop?: StatusStop;
  /** Latest intent-wise status an architect summary wrote; absent until one does. */
  intentStatus?: IntentStatusArtifact;
  /** Goal-relative path of the latest launch log; absent before the first launch. */
  runLog?: string;
  cost: {
    harnessCostUsd: number | null;
    listCostUsd: number | null;
    harnessCostPerMergedTask: number | null;
    listCostPerMergedTask: number | null;
    unpricedTurns: number;
    byRole: Record<string, StatusCost>;
    byModel: Record<string, StatusCost>;
  };
  work: {
    turns: number;
    edits: number;
    addedLines: number;
    removedLines: number;
    testRuns: number;
    byRole: Record<string, StatusWork>;
    byModel: Record<string, StatusWork>;
  };
  /** Task slugs grouped by epic; absent when the goal carries no epic. */
  epics?: Record<string, string[]>;
}

export interface StatusInput {
  goal: string;
  state: State;
  tasks: readonly TaskFile[];
  /** Latest intent status artifact; absent before an architect summary writes one. */
  intentStatus?: IntentStatusArtifact;
  /** The mailbox queues the dashboard's steer panel reads; absent means none. */
  mailbox?: StatusMailbox;
  /** How the launch that wrote this snapshot stopped; absent while it runs. */
  stop?: StatusStop;
  /** Goal-relative path of the latest launch log; absent before the first launch. */
  runLog?: string;
  records: readonly StepRecord[];
  /** Step id -> role; the process flows supply it at write time. */
  roleByStep?: Record<string, string>;
  /** OpenRouter price table; absent means the records' own priced usage only. */
  prices?: PriceTable;
  /** Harness model id -> OpenRouter model id, from the run config. */
  priceIds?: Record<string, string>;
  /** Injected by tests; production stamps the write time. */
  updatedAt?: string;
}

/** Everything a status refresh needs from the running kernel. */
export interface StatusSource {
  store: ArtifactStore;
  flows: Record<string, FlowDefinition>;
  priceIds?: Record<string, string>;
  priceSource?: PriceSource;
}
