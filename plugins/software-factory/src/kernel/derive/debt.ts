/** Open, closed and plan-owned debt extraction. */

import type { ConcernId, RecordedConcern, StepRecord } from "../types.js";
import type { OpenDebt } from "./types.js";
import { bySeq } from "./shared.js";

function normalizeDebtText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A top-level plan bullet; prose and nested lines (`  - done: …`) name no owner. */
const PLAN_BULLET = /^-\s+(.+)$/;

/** A line's cited ingest ids: `<recordId>#<n>` tokens, never a longer id's prefix. */
function citedIds(line: string): Set<string> {
  return new Set(line.match(/[\w.-]+#\d+/g) ?? []);
}

/**
 * A quote matches when it equals the debt text or the two contain each other.
 * A short fragment (<24 chars on the shorter side) never matches, so
 * `debt closed: tests` cannot retire an unrelated paragraph.
 */
function quotes(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 24) return false;
  return a.includes(b) || b.includes(a);
}

/** Every ingested debt concern's normalized text, by the id ingest assigned it. */
function debtTextsById(records: readonly StepRecord[]): Map<ConcernId, string> {
  const byId = new Map<ConcernId, string>();
  for (const rec of records) {
    for (const concern of rec.outcome?.concerns ?? []) {
      if (concern.kind !== "debt" || !concern.id) continue;
      byId.set(concern.id, normalizeDebtText(concern.text));
    }
  }
  return byId;
}

/**
 * The normalized texts retired so far, by two strengths. `cited` holds the
 * debt a `debtClosed` id names, resolved through ingest's ids: that id closes
 * exactly that debt, however many rounds raised it. `quoted` holds legacy
 * `debt closed: <text>` forward lines, matched by `quotes`.
 */
function closedDebtTexts(
  records: readonly StepRecord[],
  byId: ReadonlyMap<ConcernId, string>,
): {
  cited: Set<string>;
  quoted: Set<string>;
} {
  const cited = new Set<string>();
  const quoted = new Set<string>();
  for (const rec of records) {
    for (const forward of rec.outcome?.forward ?? []) {
      const text = /^debt closed:\s*(.+)$/i.exec(forward)?.[1]?.trim();
      if (text) quoted.add(normalizeDebtText(text));
    }
    for (const entry of rec.outcome?.debtClosed ?? []) {
      const text = byId.get(entry.id.trim());
      if (text) cited.add(text);
    }
  }
  return { cited, quoted };
}

/**
 * The normalized debt texts the plan owns: a top-level bullet names a debt by
 * citing the id ingest assigned it or by quoting its text. Ownership is read
 * from the plan on disk each time, so a bullet the next plan drops returns the
 * debt to the register.
 */
function planOwnedDebtTexts(
  plan: string,
  byId: ReadonlyMap<ConcernId, string>,
): Set<string> {
  const owned = new Set<string>();
  for (const line of plan.split(/\r?\n/)) {
    const bullet = PLAN_BULLET.exec(line)?.[1];
    if (!bullet) continue;
    const cited = citedIds(bullet);
    const normalized = normalizeDebtText(bullet);
    for (const [id, text] of byId) {
      if (cited.has(id) || quotes(normalized, text)) owned.add(text);
    }
  }
  return owned;
}

/**
 * Every open debt-kind concern, any calibration, deduplicated by text and
 * carrying the id of the record that first raised it. FYI entries are notes
 * for the architect's register, not blockers: `materialOpenDebts` is the
 * done-detection view.
 *
 * `plan` is the register's view: a debt a top-level plan bullet names is
 * owned and leaves the register. Done-detection never passes a plan — owning
 * debt does not remove it, so only `debtClosed` or a `debt closed:` forward
 * line lands a done.
 */
/** Records one concern as an open debt unless its text is already known. */
function addDebt(
  byText: Map<string, OpenDebt>,
  rec: StepRecord,
  concern: RecordedConcern,
): void {
  if (concern.kind !== "debt") return;
  const key = normalizeDebtText(concern.text);
  if (byText.has(key)) return;
  byText.set(key, {
    ...(concern.id ? { id: concern.id } : {}),
    text: concern.text,
    ...(concern.evidence ? { evidence: concern.evidence } : {}),
    calibration: concern.calibration,
    source: `${rec.slug ?? "goal"} ${rec.step} r${rec.round}`,
    iteration: rec.iteration,
    seq: rec.seq,
  });
}

/** Whether a cited id or a quoted close names the debt as closed. */
function isClosedDebt(
  norm: string,
  cited: ReadonlySet<string>,
  quoted: ReadonlySet<string>,
): boolean {
  if (cited.has(norm)) return true;
  for (const quote of quoted) if (quotes(quote, norm)) return true;
  return false;
}

export function openDebts(
  records: readonly StepRecord[],
  plan?: string,
): OpenDebt[] {
  const byText = new Map<string, OpenDebt>();
  for (const rec of [...records].sort(bySeq)) {
    if (!rec.outcome) continue;
    for (const concern of rec.outcome.concerns) addDebt(byText, rec, concern);
  }
  const byId = debtTextsById(records);
  const { cited, quoted } = closedDebtTexts(records, byId);
  const owned = plan ? planOwnedDebtTexts(plan, byId) : new Set<string>();
  return [...byText.entries()]
    .filter(([norm]) => !owned.has(norm) && !isClosedDebt(norm, cited, quoted))
    .map(([, debt]) => debt)
    .sort((a, b) => a.seq - b.seq);
}

/** The open debts that block done: architect/owner calibration. */
export function materialOpenDebts(records: readonly StepRecord[]): OpenDebt[] {
  return openDebts(records).filter((debt) => debt.calibration !== "fyi");
}

/** True while any material debt is still open. */
export function hasOpenDebt(records: readonly StepRecord[]): boolean {
  return materialOpenDebts(records).length > 0;
}

/** The ids ingest assigned to debt concerns; a `debtClosed` id must name one. */
export function knownDebtIds(records: readonly StepRecord[]): Set<ConcernId> {
  return new Set(debtTextsById(records).keys());
}
