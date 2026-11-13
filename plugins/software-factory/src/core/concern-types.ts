/** Concern-kind domain types (persisted storage is v3 records). */

export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";

type ConcernSeverity = "low" | "medium" | "high";

/** A raised concern as the stable fingerprint consumes it. */
export interface Concern {
  kind: ConcernKind;
  summary: string;
  detail: string;
  location?: {
    file: string;
    line?: number;
  };
  severity: ConcernSeverity;
  affects?: string[];
}
