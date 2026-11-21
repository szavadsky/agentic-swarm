/** Task and remark facts the head and metrics lines derive from. */

import { materialOpenDebts } from "../derive.js";
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
  summaryTaskLists,
  unansweredSteerLines,
} from "./tables.js";

/** Collects the iteration's slug lists and open material debt. */
export function summaryTaskFacts(
  recs: StepRecord[],
  state: State,
  allRecords: StepRecord[],
): SummaryTaskFacts {
  const merged = recs
    .filter((r) => r.step === "merge" && r.ok === true)
    .map((r) => r.slug!);
  const finished = recs
    .filter((r) => r.step === "finish" && r.ok === true)
    .map((r) => r.slug!);
  // Root causes group by kind: rewording a park's detail never splits a group.
  const parkedByKind = summaryParkedByKind(recs);
  const { pending, parked: parkedAll, cancelled } = summaryTaskLists(state);
  // Distance counts what still blocks the goal: material debt left open after
  // every recorded closure, not fyi notes and not debts already retired.
  const open = materialOpenDebts(allRecords);
  return {
    merged,
    finished,
    parkedByKind,
    pending,
    parkedAll,
    cancelled,
    open,
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
