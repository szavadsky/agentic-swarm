/** Steer latency: the drop stamp to the PM's route and to the final answer. */

import path from "node:path";
import { steerResponses } from "../mailbox/routes.js";
import type { ArtifactStore, StepRecord } from "../types.js";
import type { SteerLatency, SteerLeg } from "./types.js";

/**
 * The drop stamp `factory steer` puts in an inbox id, `20261123T030022405Z-<hash>`;
 * an id without one (a digest steer, an operator-chosen name) has no drop time.
 */
const DROP_STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-/;

/** The steer's drop time from its id, or undefined when the id carries none. */
function dropTime(id: string): number | undefined {
  const match = DROP_STAMP.exec(id);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, ms] = match;
  const at = Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`,
  );
  return Number.isFinite(at) ? at : undefined;
}

/** A record's event stamp; a record with neither stamp cannot time an event. */
function eventTime(rec: StepRecord): number | undefined {
  const at = Date.parse(rec.endedAt ?? rec.startedAt);
  return Number.isFinite(at) ? at : undefined;
}

function bySeq(records: readonly StepRecord[]): StepRecord[] {
  return [...records].sort(
    (a, b) => a.seq - b.seq || a.startedAt.localeCompare(b.startedAt),
  );
}

/** Steer ids a mailbox queue names; the extension is not part of a steer's id. */
async function queueIds(
  store: ArtifactStore,
  queue: "inbox" | "processed",
): Promise<Set<string>> {
  const names = await store.mailbox.files(queue);
  return new Set(names.map((name) => path.basename(name, path.extname(name))));
}

/** Each steer's accepted route time and the answer a `task` route carries. */
function routeTimes(records: readonly StepRecord[]): {
  routes: Map<string, number>;
  answers: Map<string, number>;
} {
  const routes = new Map<string, number>();
  const answers = new Map<string, number>();
  for (const rec of bySeq(records)) {
    if (rec.step !== "steer-routes" || rec.actor !== "script") continue;
    const routed = rec.outcome?.steerRoutes;
    if (!routed) continue;
    const at = eventTime(rec);
    if (at === undefined) continue;
    for (const entry of routed) {
      routes.set(entry.steer, at);
      if (entry.answer?.trim()) answers.set(entry.steer, at);
    }
  }
  return { routes, answers };
}

/** Each steer's final answer time, from the record that carried the answer. */
function answerTimes(
  records: readonly StepRecord[],
  ids: readonly string[],
): Map<string, number> {
  const answers = new Map<string, number>();
  for (const rec of bySeq(records)) {
    if (!rec.outcome) continue;
    const at = eventTime(rec);
    if (at === undefined) continue;
    for (const id of steerResponses(rec.outcome, ids).keys()) {
      answers.set(id, at);
    }
  }
  return answers;
}

/** The median of the samples, undefined when none is known. */
export function medianMs(samples: readonly number[]): number | undefined {
  if (samples.length === 0) return undefined;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** The worst sample, undefined when none is known. */
export function worstMs(samples: readonly number[]): number | undefined {
  if (samples.length === 0) return undefined;
  return Math.max(...samples);
}

/** Pushes one leg's sample, or counts it unknown when a stamp is missing. */
function addSample(
  leg: SteerLeg,
  drop: number | undefined,
  event: number,
): void {
  const sample = drop === undefined ? undefined : event - drop;
  if (sample === undefined || sample < 0) leg.unknown += 1;
  else leg.samplesMs.push(sample);
}

/**
 * The steer's final answer: a route that answered it and a later answering
 * record both stamp the same leg, so the latest stamp wins.
 */
function finalAnswer(
  fromRoute: number | undefined,
  fromRecord: number | undefined,
): number | undefined {
  const stamps = [fromRoute, fromRecord].filter(
    (at): at is number => at !== undefined,
  );
  return stamps.length > 0 ? Math.max(...stamps) : undefined;
}

/**
 * Times every steer the mailbox holds from its drop to the PM's route and to
 * its final answer. A leg with a missing stamp on either end counts unknown,
 * never zero; a steer the inbox still holds waits for its route or answer and
 * is counted unanswered instead of dropped.
 */
export async function steerLatency(
  store: ArtifactStore,
  records: readonly StepRecord[],
): Promise<SteerLatency> {
  const inbox = await queueIds(store, "inbox");
  const processed = await queueIds(store, "processed");
  const ids = [...new Set([...inbox, ...processed])].sort();
  const { routes, answers } = routeTimes(records);
  const answered = answerTimes(records, ids);
  const latency: SteerLatency = {
    steers: ids.length,
    route: { samplesMs: [], unknown: 0 },
    answer: { samplesMs: [], unknown: 0 },
    unanswered: 0,
  };
  for (const id of ids) {
    const drop = dropTime(id);
    const routed = routes.get(id);
    // A processed steer left the inbox without a recorded route: its drop-to-
    // route leg is unknown, while an unrouted inbox steer is merely waiting.
    if (routed !== undefined) addSample(latency.route, drop, routed);
    else if (processed.has(id)) latency.route.unknown += 1;
    const final = finalAnswer(answers.get(id), answered.get(id));
    if (final === undefined) {
      if (processed.has(id)) latency.answer.unknown += 1;
      else latency.unanswered += 1;
      continue;
    }
    addSample(latency.answer, drop, final);
  }
  return latency;
}
