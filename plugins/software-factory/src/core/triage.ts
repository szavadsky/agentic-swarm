import yaml from "yaml";
import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
import { applyConcernTriage } from "./concerns.js";
import type { Repo } from "./git/repo.js";
import { writeQuestion } from "./steer.js";

/** Exact-id reviewer triage over review suggestions (§8.7, §18). */
export interface TriagePartition {
  triage: ReviewSuggestion[];
  findings: ReviewSuggestion[];
  fixRequired: boolean;
}
export interface ReviewTriageOutcome extends TriagePartition {
  routed: ReviewSuggestion[];
  dismissed: ReviewSuggestion[];
  mailboxIds: string[];
}
export interface ReviewTriageContext {
  taskDir: string; taskWt: string; repo: Repo; suggestions: ReviewSuggestion[];
  concernIds: Iterable<string>; isTriager: boolean; item?: string; now?: () => Date;
}
/** Contract violation that must fail the review step instead of being journaled. */
export class TriageValidationError extends Error {}

/** Splits suggestions into pre-existing concern triage and ordinary findings. */
export function partitionReviewSuggestions(
  suggestions: ReviewSuggestion[],
  concernIds: Iterable<string>,
  isTriager: boolean
): TriagePartition {
  if (!isTriager) {
    return { triage: [], findings: [...suggestions], fixRequired: false };
  }
  const ids = new Set(concernIds);
  const triage = suggestions.filter((s) => ids.has(s.id));
  return {
    triage,
    findings: suggestions.filter((s) => !ids.has(s.id)),
    fixRequired: triage.some((s) => s.disposition === "fix"),
  };
}

export function concernMailboxId(concernId: string): string {
  return `q-concern-${concernId}`;
}

/**
 * Debt predicate for close-up accounting. Open concerns are still live, so they
 * are not debt; a non-open `tech-debt` concern or an `optional` disposition is.
 * There is deliberately no `tech-debt` disposition.
 */
export function isDebtConcern(
  c: Pick<StoredConcernArtifact, "kind" | "status" | "disposition">
): boolean {
  if ((c.disposition as string | undefined) === "tech-debt") return false;
  if (c.status !== "routed" && c.status !== "resolved") return false;
  return c.kind === "tech-debt" || c.disposition === "optional";
}

/** Terse hydration shape: never the bulky detail field (§4, §18). */
function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
  return {
    id: c.id,
    kind: c.kind,
    severity: c.severity,
    summary: c.summary,
    ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
  };
}

const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
const serialize = (records: Array<Record<string, unknown>>) =>
  yaml.stringify(records, { lineWidth: 0 });
const truncateChars = (text: string, max: number) =>
  Array.from(text).slice(0, max).join("");

/**
 * Renders open concerns as terse, byte-capped YAML for prompt hydration.
 * Detail is dropped; over-budget output condenses summaries, drops affects,
 * then sheds trailing entries until the UTF-8 byte ceiling is met.
 */
export function renderConcernsYaml(
  concerns: StoredConcernArtifact[],
  maxBytes = 8000
): string {
  const records = concerns.map(terseConcern);
  const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
    { records },
    { records: records.map(({ affects: _affects, ...rest }) => rest) },
    ...[80, 40, 16, 8, 4, 1].map((summaryLimit) => ({ records, summaryLimit })),
    ...[80, 40, 16, 8, 4, 1].map((summaryLimit) => ({
      records: records.map(({ affects: _affects, ...rest }) => rest),
      summaryLimit,
    })),
  ];

  let triedFull = false;
  for (const variant of variants) {
    for (let count = variant.records.length; count > 0; count--) {
      if (variant.summaryLimit === undefined && count === variant.records.length) {
        if (triedFull) continue;
        triedFull = true;
      }
      const selected = variant.records.slice(0, count).map((r) =>
        variant.summaryLimit === undefined
          ? r
          : { ...r, summary: truncateChars(String(r.summary ?? ""), variant.summaryLimit) }
      );
      const text = serialize(selected);
      if (utf8Bytes(text) <= maxBytes) return text;
    }
  }
  return serialize([]);
}

/**
 * Applies exact-id concern triage and reports the partition. Only triagers may
 * triage; `dismiss` requires detail, and `fix` is reported once while the
 * suggestion stays in the canonical review output for the fix loop.
 */
export async function applyReviewTriage(
  ctx: ReviewTriageContext
): Promise<ReviewTriageOutcome> {
  const partition = partitionReviewSuggestions(
    ctx.suggestions,
    ctx.concernIds,
    ctx.isTriager
  );
  if (!ctx.isTriager) {
    return { ...partition, routed: [], dismissed: [], mailboxIds: [] };
  }

  for (const s of partition.triage) {
    if (s.disposition === "dismiss" && !s.detail?.trim()) {
      throw new TriageValidationError(
        `Dismiss triage for ${s.id} requires detail (the dismissal reason)`
      );
    }
  }

  if (partition.triage.length > 0) {
    await applyConcernTriage({
      taskDir: ctx.taskDir,
      taskWt: ctx.taskWt,
      repo: ctx.repo,
      suggestions: partition.triage,
      isTriager: true,
      ...(ctx.now ? { now: ctx.now } : {}),
    });
  }

  const dismissed = partition.triage.filter((s) => s.disposition === "dismiss");
  const routed = partition.triage.filter((s) => s.disposition !== "dismiss");
  const mailboxIds: string[] = [];
  for (const s of routed) {
    if (s.disposition !== "human-async") continue;
    const id = concernMailboxId(s.id);
    await writeQuestion(ctx.taskWt, ctx.taskDir, {
      id,
      ref: ctx.item ?? s.id,
      disposition: "human-async",
      question: s.detail?.trim() || s.summary,
      ...(ctx.item ? { blocks: [ctx.item] } : {}),
    });
    mailboxIds.push(id);
  }

  return { ...partition, routed, dismissed, mailboxIds };
}
