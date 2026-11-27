/**
 * Per-task concern dismissal: a review or adjudicate turn can mark an
 * implementer or QA concern `dismiss: immaterial` so it stops at the reviewer
 * instead of travelling to the PM, checker, architect or debt register.
 */

import { recordedConcernId } from "../core/concerns.js";
import type { RecordedConcern, StepRecord } from "./types.js";

function normText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function idKey(slug: string | undefined, id: string): string {
  return `${slug ?? ""}\u0000${id}`;
}

function textKey(slug: string | undefined, kind: string, text: string): string {
  return `${slug ?? ""}\u0000${kind}\u0000${normText(text)}`;
}

function isReviewRecord(rec: StepRecord): boolean {
  return (
    rec.step === "review" ||
    rec.step === "adjudicate" ||
    rec.outcome?.verdict !== undefined
  );
}

/** Max review `seq` per dismissed concern identity (and evidence-less fallback). */
interface DismissedIndex {
  byId: ReadonlyMap<string, number>;
  withoutEvidence: ReadonlyMap<string, number>;
}

/** Indexes every `dismiss: immaterial` mark in the record stream by task and seq. */
export function indexDismissals(
  records: readonly StepRecord[],
): DismissedIndex {
  const byId = new Map<string, number>();
  const withoutEvidence = new Map<string, number>();
  for (const rec of records) {
    if (!rec.outcome || !isReviewRecord(rec)) continue;
    for (const concern of rec.outcome.concerns) {
      if (concern.dismiss !== "immaterial") continue;
      const key = idKey(rec.slug, recordedConcernId(concern));
      byId.set(key, Math.max(byId.get(key) ?? -1, rec.seq));
      if (!concern.evidence?.trim()) {
        const fallback = textKey(rec.slug, concern.kind, concern.text);
        withoutEvidence.set(
          fallback,
          Math.max(withoutEvidence.get(fallback) ?? -1, rec.seq),
        );
      }
    }
  }
  return { byId, withoutEvidence };
}

/**
 * True when this concern is a dismissal mark itself or was dismissed by a
 * later review/adjudicate record for the same task.
 */
export function isConcernDismissed(
  index: DismissedIndex,
  rec: StepRecord,
  concern: RecordedConcern,
): boolean {
  if (concern.dismiss === "immaterial") return true;
  const dismissedSeq = index.byId.get(
    idKey(rec.slug, recordedConcernId(concern)),
  );
  if (dismissedSeq !== undefined && dismissedSeq > rec.seq) return true;
  const fallbackSeq = index.withoutEvidence.get(
    textKey(rec.slug, concern.kind, concern.text),
  );
  return fallbackSeq !== undefined && fallbackSeq > rec.seq;
}
