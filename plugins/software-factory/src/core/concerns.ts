import { createHash } from "node:crypto";
import type { Concern } from "./concern-types.js";

export type ConcernInput = Pick<
  Concern,
  "kind" | "summary" | "location" | "affects"
> &
  Partial<Pick<Concern, "detail" | "severity">>;

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const locationOf = (l?: { file?: string; line?: number }) =>
  [l?.file?.trim() ?? null, l?.line ?? null] as const;
const hash = (prefix: string, parts: unknown[]) =>
  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;

/** Stable concern identity: kind, normalized summary, location. */
export function concernFingerprint(c: ConcernInput): string {
  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
}

/** One concern as the pack forwards it and the PM's mark names it. */
export interface RecordedConcern {
  kind: string;
  text: string;
  evidence?: string;
}

/**
 * A recorded concern's id: the same kind, text and evidence are one concern
 * wherever they are raised, so its hold file and pack line share one identity.
 */
export function recordedConcernId(c: RecordedConcern): string {
  return concernFingerprint({
    kind: c.kind as Concern["kind"],
    summary: c.text,
    ...(c.evidence ? { location: { file: c.evidence } } : {}),
  });
}
