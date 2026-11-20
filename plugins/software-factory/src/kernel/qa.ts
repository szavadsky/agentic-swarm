import { z } from "zod";
import { type Outcome, outcomeSchema } from "./types.js";

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
