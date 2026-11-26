/**
 * The dashboard's triage views: open concerns, mailbox steers and the launch
 * stop. Status derives them from the same records and queues the page reads.
 */

import path from "node:path";
import { recordedConcernId } from "../core/concerns.js";
import { openConcerns } from "./context-pack/misc.js";
import { steerResponses } from "./mailbox/routes.js";
import { recordDirName } from "./store.js";
import type {
  ArtifactStore,
  Concern,
  ReportDebt,
  StepRecord,
  SteerRoute,
  TaskFile,
} from "./types.js";
import type {
  StatusConcern,
  StatusMailbox,
  StatusOpenConcern,
  StatusSteer,
  SteerState,
} from "./status-triage-types.js";
export type {
  StatusConcern,
  StatusMailbox,
  StatusOpenConcern,
  StatusSteer,
  StatusStop,
  SteerState,
} from "./status-triage-types.js";

function recordPath(record: StepRecord): string {
  return `records/${recordDirName(record.seq, record)}`;
}

/** Every concern a record delivered, unfiltered (excluding review dismissal marks). */
export function statusConcerns(
  records: readonly StepRecord[],
): StatusConcern[] {
  return records.flatMap((record) =>
    (record.outcome?.concerns ?? [])
      .filter((concern) => concern.dismiss !== "immaterial")
      .map((concern) => ({
        ...(concern.id ? { id: concern.id } : {}),
        ...(record.slug ? { slug: record.slug } : {}),
        step: record.step,
        round: record.round,
        kind: concern.kind,
        calibration: concern.calibration,
        text: concern.text,
        ...(concern.evidence ? { evidence: concern.evidence } : {}),
        record: recordPath(record),
      })),
  );
}

/** One open debt as the triage panel lists it. */
function debtEntry(debt: ReportDebt): StatusOpenConcern {
  return {
    ...(debt.id ? { id: debt.id } : {}),
    kind: "debt",
    calibration: debt.calibration,
    text: debt.text,
    ...(debt.evidence ? { evidence: debt.evidence } : {}),
    source: debt.source,
    ...(debt.record ? { record: debt.record } : {}),
  };
}

/** The latest record that raised each concern fingerprint, for the dashboard's link. */
function concernRecords(records: readonly StepRecord[]): Map<string, string> {
  const byId = new Map<string, string>();
  for (const record of [...records].sort((a, b) => a.seq - b.seq)) {
    for (const concern of record.outcome?.concerns ?? []) {
      if (concern.dismiss === "immaterial") continue;
      byId.set(recordedConcernId(concern), recordPath(record));
    }
  }
  return byId;
}

/**
 * Open, non-FYI concerns: the forwarded set the checker did not answer plus
 * the view's open debt. Debt also appears in the distance view; this panel
 * lists every open concern so the page has one triage list.
 */
export function openConcernEntries(
  records: readonly StepRecord[],
  debts: readonly ReportDebt[],
  tasks?: readonly TaskFile[],
): StatusOpenConcern[] {
  const recordsById = concernRecords(records);
  const forwarded: StatusOpenConcern[] = openConcerns(records, tasks).map(
    (concern) => ({
      id: concern.id,
      kind: concern.kind as Concern["kind"],
      calibration: concern.calibration as Concern["calibration"],
      text: concern.text,
      ...(concern.evidence ? { evidence: concern.evidence } : {}),
      source: concern.source,
      ...(recordsById.has(concern.id)
        ? { record: recordsById.get(concern.id) }
        : {}),
    }),
  );
  return [...forwarded, ...debts.map(debtEntry)].sort(
    (a, b) =>
      (a.record ?? "").localeCompare(b.record ?? "") ||
      a.text.localeCompare(b.text),
  );
}

/** A steer queue file name's id; an archive suffix is not part of the id. */
const STEER_ARCHIVE = /^(.*)\.[0-9a-f]{8}$/;

function steerId(file: string): string {
  const stem = path.basename(file, path.extname(file));
  const archived = STEER_ARCHIVE.exec(stem);
  return archived ? (archived[1] as string) : stem;
}

interface SteerFact {
  route?: SteerRoute;
  answer?: string;
  record?: string;
}

/** The PM's committed routes in one steer-routes record. */
function applyRoutes(
  facts: Map<string, SteerFact>,
  known: Set<string>,
  record: StepRecord,
): void {
  if (record.step !== "steer-routes" || record.actor !== "script") return;
  for (const entry of record.outcome?.steerRoutes ?? []) {
    known.add(entry.steer);
    const answer = entry.answer?.trim();
    facts.set(entry.steer, {
      route: entry.route,
      ...(answer ? { answer } : {}),
      record: recordPath(record),
    });
  }
}

/** Every steer answer one record carries, typed or a legacy forward line. */
function applyAnswers(
  facts: Map<string, SteerFact>,
  known: Set<string>,
  record: StepRecord,
): void {
  if (!record.outcome) return;
  for (const [id, answer] of steerResponses(record.outcome, known)) {
    facts.set(id, {
      ...(facts.get(id) ?? {}),
      answer,
      record: recordPath(record),
    });
  }
}

/** Routes and answers from the records, including legacy forward-line answers. */
function steerFacts(
  records: readonly StepRecord[],
  knownIds: Iterable<string>,
): Map<string, SteerFact> {
  const facts = new Map<string, SteerFact>();
  const known = new Set(knownIds);
  const sorted = [...records].sort(
    (a, b) => a.seq - b.seq || a.startedAt.localeCompare(b.startedAt),
  );
  for (const record of sorted) {
    if (!record.outcome) continue;
    applyRoutes(facts, known, record);
    applyAnswers(facts, known, record);
  }
  return facts;
}

/** Every steer the mailbox or a route record names, with its state and answer. */
export function statusSteers(
  records: readonly StepRecord[],
  mailbox: StatusMailbox | undefined,
): StatusSteer[] {
  const inbox = new Set((mailbox?.inbox ?? []).map(steerId));
  const processed = new Set((mailbox?.processed ?? []).map(steerId));
  const facts = steerFacts(records, [...inbox, ...processed]);
  const ids = [...new Set([...inbox, ...processed, ...facts.keys()])].sort();
  return ids.map((id) => {
    const fact = facts.get(id);
    const state: SteerState = fact?.answer
      ? "answered"
      : fact?.route
        ? "routed"
        : inbox.has(id)
          ? "waiting"
          : "processed";
    return {
      id,
      state,
      ...(fact?.route ? { route: fact.route } : {}),
      ...(fact?.answer ? { answer: fact.answer } : {}),
      ...(fact?.record ? { record: fact.record } : {}),
    };
  });
}

/** The mailbox file names a snapshot reads; a missing queue is empty. */
export async function readStatusMailbox(
  store: ArtifactStore,
): Promise<StatusMailbox> {
  return {
    inbox: await store.mailbox.files("inbox"),
    processed: await store.mailbox.files("processed"),
  };
}
