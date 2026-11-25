/** Friction events the iteration's records show, each with its record and cost. */

import { formatCause } from "../cause.js";
import { pricedRecord } from "../pricing.js";
import type { PriceTable } from "../pricing.js";
import { recordDirName } from "../store.js";
import type { StepRecord, TaskFile } from "../types.js";
import { hasFallbackHop } from "./record.js";
import type { FrictionEntry, FrictionKind } from "./types.js";

/** The priced work behind one friction event. */
interface FrictionCost {
  costUsd?: number;
  unpricedTurns: number;
}

function recordPath(rec: StepRecord): string {
  return `records/${recordDirName(rec.seq, rec)}`;
}

/** One line: a cause may carry a multi-line reason. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Sums the priced turns behind a friction; a turn with no price makes it partial. */
function costOf(
  records: readonly StepRecord[],
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): FrictionCost {
  let costUsd: number | undefined;
  let unpricedTurns = 0;
  for (const rec of records) {
    const priced = pricedRecord(rec, prices, priceIds);
    if (priced.usage.costUsd !== undefined) {
      costUsd = (costUsd ?? 0) + priced.usage.costUsd;
    }
    if (!priced.costKnown) unpricedTurns += 1;
  }
  return { costUsd, unpricedTurns };
}

/**
 * The agent turns that produced the work a script signal names: the same slug,
 * settled before the signal. The task branch keeps every revision's work, so
 * the cost is the branch's whole spend, not one revision's.
 */
function turnsBefore(
  records: readonly StepRecord[],
  signal: StepRecord,
): StepRecord[] {
  return records.filter(
    (rec) =>
      rec.actor === "agent" &&
      rec.endedAt !== undefined &&
      rec.slug !== undefined &&
      rec.slug === signal.slug &&
      rec.seq < signal.seq,
  );
}

/** The agent turn that routed a stalled steer: the nearest one naming it. */
function routingTurn(
  records: readonly StepRecord[],
  signal: StepRecord,
  steer: string,
): StepRecord | undefined {
  let latest: StepRecord | undefined;
  for (const rec of records) {
    if (rec.actor !== "agent" || rec.seq >= signal.seq) continue;
    if (!rec.outcome?.steerRoutes?.some((entry) => entry.steer === steer)) {
      continue;
    }
    if (!latest || rec.seq > latest.seq) latest = rec;
  }
  return latest;
}

/** The models one turn walked through after an infra stop. */
function fallbackChain(rec: StepRecord): string {
  const attempts = rec.attempts ?? [];
  const labels = attempts.map((attempt) =>
    attempt.harness
      ? `${attempt.model.id}/${attempt.harness}`
      : attempt.model.id,
  );
  return `${labels.join(" -> ")} (${attempts.length} attempts)`;
}

/** A park is a kept branch only for a task that was meant to merge. */
function parkKind(
  slug: string | undefined,
  tasks: readonly TaskFile[] | undefined,
): FrictionKind {
  if (!slug) return "park";
  const task = tasks?.find((entry) => entry.slug === slug);
  return task?.kind === "spike" ? "park" : "kept branch";
}

function parkEntry(
  rec: StepRecord,
  records: readonly StepRecord[],
  tasks: readonly TaskFile[] | undefined,
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): FrictionEntry {
  const kind = parkKind(rec.slug, tasks);
  const cause = rec.cause ? oneLine(formatCause(rec.cause)) : "no cause";
  return {
    kind,
    record: recordPath(rec),
    detail: `parked ${rec.slug ?? "a task"} — ${cause}`,
    ...costOf(turnsBefore(records, rec), prices, priceIds),
  };
}

function mergeEntry(
  rec: StepRecord,
  records: readonly StepRecord[],
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): FrictionEntry {
  const cause = rec.cause ? oneLine(formatCause(rec.cause)) : "no cause";
  return {
    kind: "merge",
    record: recordPath(rec),
    detail: `merge failed for ${rec.slug ?? "a task"} — ${cause}`,
    ...costOf(turnsBefore(records, rec), prices, priceIds),
  };
}

function keptLandEntry(
  rec: StepRecord,
  records: readonly StepRecord[],
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): FrictionEntry {
  const cause = rec.cause ? oneLine(formatCause(rec.cause)) : "no cause";
  return {
    kind: "kept branch",
    record: recordPath(rec),
    detail: `kept-branch landing ${rec.ok === true ? "landed" : "failed"} for ${rec.slug ?? "a task"} — ${cause}`,
    ...costOf(turnsBefore(records, rec), prices, priceIds),
  };
}

function stalledSteerEntries(
  rec: StepRecord,
  records: readonly StepRecord[],
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): FrictionEntry[] {
  const stalled = (rec.outcome?.steerRoutes ?? []).filter(
    (entry) => entry.route === "stall",
  );
  return stalled.map((entry) => {
    const routed = routingTurn(records, rec, entry.steer);
    return {
      kind: "stalled steer",
      record: recordPath(rec),
      detail: `steer ${entry.steer} routed stall`,
      ...costOf(routed ? [routed] : [], prices, priceIds),
    };
  });
}

/** One settled agent turn that walked a fallback chain. */
function fallbackEntry(
  rec: StepRecord,
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): FrictionEntry {
  return {
    kind: "fallback chain",
    record: recordPath(rec),
    detail: fallbackChain(rec),
    ...costOf([rec], prices, priceIds),
  };
}

/** One incident launch: the turn ran again for a recorded reason. */
function dispatchEntry(
  rec: StepRecord,
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
): FrictionEntry {
  return {
    kind: "dispatch",
    record: recordPath(rec),
    detail: `launched again: ${rec.launchKind ?? "unknown"}`,
    ...costOf([rec], prices, priceIds),
  };
}

/** The friction a settled record itself proves, empty when it proves none. */
function entriesFor(
  rec: StepRecord,
  ordered: readonly StepRecord[],
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
  tasks?: readonly TaskFile[],
): FrictionEntry[] {
  if (rec.endedAt === undefined) return [];
  if (rec.step === "park") {
    return [parkEntry(rec, ordered, tasks, prices, priceIds)];
  }
  if (
    rec.step === "merge" &&
    (rec.ok === false || rec.cause?.kind === "conflict")
  ) {
    return [mergeEntry(rec, ordered, prices, priceIds)];
  }
  if (rec.step === "kept-land") {
    return [keptLandEntry(rec, ordered, prices, priceIds)];
  }
  if (rec.step === "steer-routes") {
    return stalledSteerEntries(rec, ordered, prices, priceIds);
  }
  if (rec.actor !== "agent") return [];
  if (hasFallbackHop(rec.attempts))
    return [fallbackEntry(rec, prices, priceIds)];
  if (rec.launchKind) return [dispatchEntry(rec, prices, priceIds)];
  return [];
}

/**
 * The iteration's friction events, in record order: stalled steer routes,
 * kept branches and parks, failed merges, fallback chains and incident
 * launches. Every entry names its record and carries the priced cost of the
 * work behind it.
 */
export function frictionEvents(
  records: readonly StepRecord[],
  prices: PriceTable,
  priceIds: Record<string, string> | undefined,
  tasks?: readonly TaskFile[],
): FrictionEntry[] {
  const ordered = [...records].sort((a, b) => a.seq - b.seq);
  return ordered.flatMap((rec) =>
    entriesFor(rec, ordered, prices, priceIds, tasks),
  );
}
