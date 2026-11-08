import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
import { applyConcernTriage, listConcerns } from "./concerns.js";
import type { Repo } from "./git/repo.js";
import { readYaml } from "./records/io.js";
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
    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
    ...(c.status !== "open" ? { status: c.status } : {}),
    ...(c.disposition ? { disposition: c.disposition } : {}),
    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
    ...(c.source?.escalated ? { escalated: true } : {}),
  };
}

export interface HydrateStepConcernsRequest {
  stepRole: string;
  inputBytes?: number;
  diffBytes?: number;
  taskDiffBytes?: number;
  consumer?: string;
}

const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
const serialize = (records: Array<Record<string, unknown>>) =>
  yaml.stringify(records, { lineWidth: 0 });
const truncateChars = (text: string, max: number) =>
  Array.from(text).slice(0, max).join("");

/** Normalizes step ids/fragments to their hydration role family. */
function hydrationRole(stepRole: string): string {
  const role = stepRole.replace(/^steps\//, "");
  if (role === "architect" || role.startsWith("architect-")) return "architect";
  if (role.startsWith("plan-review")) return "plan-review";
  if (role.startsWith("plan-close-up")) return "plan-close-up";
  if (role.startsWith("wave-close-up")) return "wave-close-up";
  if (role === "review" || role === "qa") return role;
  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
  return role;
}

function hydrationConsumer(role: string, consumer?: string): string {
  if (consumer) return consumer;
  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
  return role === "architect" ? "architect" : role;
}

async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
  const dir = path.join(taskDir, "concerns");
  let names: string[];
  try { names = await fs.promises.readdir(dir); } catch (err: any) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
    throw err;
  }
  const records = await Promise.all(
    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
    })
  );
  return records
    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
}

/** Hydrated concern set per consumer (adr-hydrated-sets). */
export async function listHydratedConcerns(
  taskDir: string,
  consumer: string
): Promise<Array<Record<string, unknown>>> {
  const includeRouted = consumer === "closeup" || consumer === "architect";
  const includeEscalated = consumer === "architect";
  const concerns = (await listConcerns(taskDir)).filter((c) =>
    c.status === "open" ||
    (includeRouted && c.status === "routed") ||
    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
  );
  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
}

/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
export async function hydrateStepConcerns(
  taskDir: string,
  request: HydrateStepConcernsRequest
): Promise<string> {
  const role = hydrationRole(request.stepRole);
  const cap = role === "review" || role === "qa"
    ? Math.min(request.diffBytes ?? 0, 2000)
    : role === "wave-close-up" || role === "plan-close-up"
      ? Math.min(request.taskDiffBytes ?? 0, 2000)
      : Math.min(request.inputBytes ?? 0, 500);
  if (cap <= 0) return "";
  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
}

/**
 * Renders terse concern records as byte-capped prompt YAML. Over-budget output
 * condenses summaries, drops affects, then sheds trailing entries; empty output
 * is returned when no record fits the ceiling.
 */
export function renderConcernsYaml(
  records: Array<Record<string, unknown>>,
  maxBytes = 8000
): string {
  if (maxBytes <= 0 || records.length === 0) return "";
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
  return "";
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
