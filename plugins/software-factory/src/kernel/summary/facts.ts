/** Task and remark facts the head and metrics lines derive from. */

import { reportView } from "../report-view.js";
import type { IterationMetrics } from "../metrics.js";
import type { ArtifactStore, State, StepRecord } from "../types.js";
import type {
  SummaryInput,
  SummaryRemarkFacts,
  SummaryTaskFacts,
} from "./types.js";
import {
  closedDebtLines,
  concernLines,
  ownerRemarkableLines,
  summaryParkedByKind,
  summaryRemarks,
  unansweredSteerLines,
} from "./tables.js";

/** Collects the iteration's slug lists and open material debt. */
export function summaryTaskFacts(
  recs: StepRecord[],
  state: State,
  allRecords: StepRecord[],
): SummaryTaskFacts {
  const landed = (step: string) =>
    recs.filter((r) => r.step === step && r.ok === true).map((r) => r.slug!);
  const merged = landed("merge");
  const finished = landed("finish");
  // Root causes group by kind: rewording a park's detail never splits a group.
  const parkedByKind = summaryParkedByKind(recs);
  // Distance reads the view's task groups and open debt, the same facts status
  // and the pack list; merged and finished stay this iteration's records.
  const view = reportView({ state, records: allRecords });
  return {
    merged,
    finished,
    parkedByKind,
    pending: view.groups.pending.map((task) => task.slug),
    parks: view.groups.parked.map((task) => task.slug),
    cancelled: view.groups.cancelled.map((task) => task.slug),
    open: view.distance.openDebt,
  };
}

/** Collects the summary's remark lines from outcomes, mailbox and debt. */
export async function summaryRemarkFacts(
  store: ArtifactStore,
  input: SummaryInput,
  architect: StepRecord | undefined,
  recs: StepRecord[],
  budgetStop: string | undefined,
): Promise<SummaryRemarkFacts> {
  const ownerRemarkable = ownerRemarkableLines(recs);
  const unanswered = await unansweredSteerLines(store);
  const remarks = summaryRemarks(input, architect, recs, budgetStop);
  const assumed = concernLines(
    recs.filter((r) => r.step === "architect"),
    "choice",
  );
  const debtOpened = concernLines(recs, "debt");
  const debtClosed = closedDebtLines(recs);
  return {
    ownerRemarkable,
    unanswered,
    remarks,
    assumed,
    debtOpened,
    debtClosed,
  };
}

/** The metric rows named for launch/spend tables, sorted by name. */
export function summaryNamedRows(computed: IterationMetrics) {
  return {
    roleNames: Object.values(computed.roles)
      .map((entry) => ({ name: entry.role, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    aliasNames: Object.values(computed.aliases)
      .map((entry) => ({ name: entry.alias, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    modelNames: Object.values(computed.models)
      .map((entry) => ({ name: entry.model, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
