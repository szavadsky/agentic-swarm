/** Concern-store domain types (persisted under `<taskDir>/concerns/`). */

export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";

export type ConcernSeverity = "low" | "medium" | "high";

export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

export type ReviewDisposition =
  | "fix"
  | "optional"
  | "architect"
  | "human-awareness"
  | "human-async"
  | "human-stop"
  | "dismiss";

/** A structured "see something, say something" report from any agent output. */
export interface Concern {
  /** Stable fingerprint id; assigned when the concern is aggregated. */
  id?: string;
  kind: ConcernKind;
  summary: string;
  detail: string;
  location?: {
    file: string;
    line?: number;
  };
  severity: ConcernSeverity;
  /** Item, epic, or plan refs the concern affects. */
  affects?: string[];
}

export interface RemarkableDecision {
  chosen: string;
  alternatives: string[];
  why: string;
}

export interface ConcernConfirms {
  id: string;
  confirm: "accept" | "reject";
  note?: string;
}

export interface ConcernSource {
  record: string;
  agent: string;
  /** Epic slug that pushed this copy into the parent task. */
  epic?: string;
  step?: string;
  item?: string;
  iteration?: number;
  escalated?: boolean;
  /** Timestamp of the most recent re-emit for merged concerns. */
  lastSeen?: string;
}

export interface PendingConcernResolution {
  action: "resolve" | "carry" | "propagate" | "dismiss";
  /** Dismiss proposals require this note as the dismissal reason. */
  note?: string;
  by: string;
  at: string;
}

/** A concern persisted under the task's `concerns/` folder. */
export interface StoredConcernArtifact extends Concern {
  id: string;
  status: ConcernStatus;
  disposition?: ReviewDisposition;
  dismissReason?: string;
  source: ConcernSource;
  pendingResolution?: PendingConcernResolution;
  createdAt: string;
  updatedAt: string;
}

export interface ConcernCounts {
  open: number;
  dismissed: number;
  routed: number;
  resolved: number;
}

export interface ReviewSuggestion {
  id: string;
  disposition: ReviewDisposition | string;
  summary: string;
  detail?: string;
  location?: {
    file: string;
    line?: number;
  };
}
