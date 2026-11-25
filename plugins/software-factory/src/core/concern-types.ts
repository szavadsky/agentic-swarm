/** Concern-kind domain types (persisted storage is v3 records). */

export type ConcernKind =
  | "tech-debt"
  | "assumption"
  | "blocker"
  | "risk"
  | "question";

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

/** The fields a caller supplies when a concern is fingerprinted. */
export type ConcernInput = Pick<
  Concern,
  "kind" | "summary" | "location" | "affects"
> &
  Partial<Pick<Concern, "detail" | "severity">>;

/** One concern as the pack forwards it and the PM's mark names it. */
export interface RecordedConcern {
  kind: string;
  text: string;
  evidence?: string;
}
