import { z } from "zod";
import { recordDirName } from "./store.js";
import { quotes as sameFinding } from "./text-match.js";
import { type Outcome, outcomeSchema, type StepRecord } from "./types.js";

/** Maximum number of QA-only catch findings sampled in metrics and totals. */
export const MAX_QA_CATCH_SAMPLES = 20;

/** One QA finding that no earlier gate failure or reviewer finding matched. */
export interface QaOnlyCatch {
  task: string;
  finding: string;
  /** Goal-relative record directory, for evidence. */
  record: string;
  round: number;
}

/** The iteration's QA-only catches, counted per task. */
export interface QaOnlyCatches {
  count: number;
  /** Every task with a QA record, including zeros. Sorted by task. */
  byTask: Record<string, number>;
  sample: QaOnlyCatch[];
}

/**
 * The QA acceptance verdict and its findings. QA is not a reviewer: it accepts
 * the work or sends it back with an actionable list, and the author answers
 * each finding by its position.
 */
export const qaReportSchema = z.object({
  verdict: z
    .enum(["accept", "changes"])
    .describe("accept the work, or send it back with findings"),
  findings: z
    .array(z.string().trim().min(1))
    .default([])
    .describe("one finding per change request, in the author's reply order"),
});

export type QaReport = z.infer<typeof qaReportSchema>;

/**
 * The QA step's own outcome schema: the kernel shape plus the nested `qa`
 * report. The field is optional so a `blocked`/`failed` QA turn can stop
 * before deciding; the `qa` expectation requires it on a completed turn.
 */
export const qaOutcomeSchema = outcomeSchema.extend({
  qa: qaReportSchema
    .optional()
    .describe("QA step only: accept, or changes with findings"),
});

/**
 * The QA report a record carries, or undefined when it carries none or a
 * malformed one. Records are read from disk, so this guard never trusts the
 * shape the writer should have produced.
 */
export function qaReportOf(outcome: Outcome | undefined): QaReport | undefined {
  if (!outcome) return undefined;
  const qa = (outcome as Outcome & { qa?: unknown }).qa;
  if (typeof qa !== "object" || qa === null) return undefined;
  const report = qa as { verdict?: unknown; findings?: unknown };
  if (report.verdict !== "accept" && report.verdict !== "changes")
    return undefined;
  const findings = Array.isArray(report.findings)
    ? report.findings.filter(
        (finding): finding is string =>
          typeof finding === "string" && finding.trim() !== "",
      )
    : [];
  return { verdict: report.verdict, findings };
}

function normalizeFinding(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** One earlier finding with the record position that delivered it. */
interface FindingEvidence {
  task: string;
  seq: number;
  text: string;
}

function failedGateTexts(rec: StepRecord): string[] {
  return (rec.checks ?? [])
    .filter((check) => check.ok === false)
    .map(
      (check) =>
        `${check.name}: ${check.summary}${check.output ? `\n${check.output}` : ""}`,
    );
}

/** Failed checks before the QA turn: what the gates already caught. */
function gateFailures(records: readonly StepRecord[]): FindingEvidence[] {
  return records.flatMap((rec) =>
    failedGateTexts(rec).map((text) => ({
      task: rec.slug ?? "",
      seq: rec.seq,
      text: normalizeFinding(text),
    })),
  );
}

/** A reviewer's numbered summary findings, the protocol the review prompt asks for. */
function numberedFindings(summary: string): string[] {
  return summary.split(/\r?\n/).flatMap((line) => {
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    return numbered ? [numbered[1]!.trim()] : [];
  });
}

/** Reviewer findings before the QA turn: what the reviewer already caught. */
function reviewerFindings(records: readonly StepRecord[]): FindingEvidence[] {
  return records.flatMap((rec) => {
    if (rec.step !== "review" && rec.alias !== "reviewer") return [];
    return numberedFindings(rec.outcome?.summary ?? "").map((text) => ({
      task: rec.slug ?? "",
      seq: rec.seq,
      text: normalizeFinding(text),
    }));
  });
}

function isQaRecord(rec: StepRecord): boolean {
  return (
    rec.slug !== undefined &&
    (rec.step === "qa" ||
      rec.alias === "qa" ||
      qaReportOf(rec.outcome) !== undefined)
  );
}

function matchedEarlier(
  evidence: readonly FindingEvidence[],
  task: string,
  seq: number,
  finding: string,
): boolean {
  return evidence.some(
    (entry) =>
      entry.task === task &&
      entry.seq < seq &&
      sameFinding(entry.text, normalizeFinding(finding)),
  );
}

interface QaCatchAccumulator {
  seen: Set<string>;
  byTask: Record<string, number>;
  sample: QaOnlyCatch[];
  count: number;
}

function addQaFinding(
  acc: QaCatchAccumulator,
  evidence: readonly FindingEvidence[],
  rec: StepRecord,
  finding: string,
  limit: number,
): void {
  const task = rec.slug!;
  const key = `${task}\u0000${normalizeFinding(finding)}`;
  if (acc.seen.has(key)) return;
  acc.seen.add(key);
  if (matchedEarlier(evidence, task, rec.seq, finding)) return;
  acc.byTask[task] = (acc.byTask[task] ?? 0) + 1;
  acc.count += 1;
  if (acc.sample.length < limit) {
    acc.sample.push({
      task,
      finding,
      record: `records/${recordDirName(rec.seq, rec)}`,
      round: rec.round,
    });
  }
}

/**
 * Tags each QA finding QA-only unless a gate failure or reviewer finding
 * already matches it in the same task. A QA finding the reviewer repeats later
 * stays one catch: the first QA occurrence is counted and later duplicates are
 * dropped. Every task with a QA record is present in `byTask`, zero included.
 */
export function qaOnlyCatches(
  records: readonly StepRecord[],
  limit = MAX_QA_CATCH_SAMPLES,
): QaOnlyCatches {
  const qaRecords = records.filter(isQaRecord).sort((a, b) => a.seq - b.seq);
  const acc: QaCatchAccumulator = {
    seen: new Set<string>(),
    byTask: {},
    sample: [],
    count: 0,
  };
  for (const task of [...new Set(qaRecords.map((rec) => rec.slug!))].sort())
    acc.byTask[task] = 0;

  const evidence = [...gateFailures(records), ...reviewerFindings(records)];
  for (const rec of qaRecords) {
    const report = qaReportOf(rec.outcome);
    if (!report) continue;
    for (const finding of report.findings) {
      addQaFinding(acc, evidence, rec, finding, limit);
    }
  }

  return { count: acc.count, byTask: acc.byTask, sample: acc.sample };
}
