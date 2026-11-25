import { createHash } from "node:crypto";
import type {
  Concern,
  ConcernInput,
  RecordedConcern,
} from "./concern-types.js";

export type { ConcernInput, RecordedConcern } from "./concern-types.js";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const locationOf = (l?: { file?: string; line?: number }) =>
  [l?.file?.trim() ?? null, l?.line ?? null] as const;
const hash = (prefix: string, parts: unknown[]) =>
  `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;

/** Stable concern identity: kind, normalized summary, location. */
export function concernFingerprint(c: ConcernInput): string {
  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
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
