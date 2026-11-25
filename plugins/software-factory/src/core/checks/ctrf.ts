import { type CTRFReport, validate } from "ctrf";
import { GateReportError, makeFinding, type Finding } from "./findings.js";

/** Reads and validates one CTRF document with the reference implementation. */
export function parseCtrfReport(text: string): CTRFReport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new GateReportError(
      `CTRF report is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = validate(raw);
  if (!result.valid) {
    const detail = result.errors?.map((error) => error.message).join("; ");
    throw new GateReportError(
      `CTRF report is invalid${detail ? `: ${detail}` : ""}`,
    );
  }
  return raw as CTRFReport;
}

/** The failures a validated CTRF report names, never its passing tests. */
export function ctrfFindings(check: string, report: CTRFReport): Finding[] {
  const tool = report.results.tool.name || "ctrf";
  const findings: Finding[] = [];
  for (const test of report.results.tests) {
    if (test.status !== "failed" && test.status !== "other") continue;
    const suite = (test.suite ?? []).filter((name) => name !== test.filePath);
    const rule = [...suite, test.name].join(" > ");
    findings.push(
      makeFinding(
        {
          check,
          tool,
          ...(test.filePath ? { file: test.filePath } : {}),
          ...(test.line !== undefined ? { line: test.line } : {}),
          rule,
          severity: "error",
          message: test.message ?? test.trace ?? test.name,
        },
        test.testId,
      ),
    );
  }
  for (const error of report.results.errors ?? []) {
    findings.push(
      makeFinding({
        check,
        tool,
        rule: "ctrf-error",
        severity: "error",
        message: error.message ?? error.trace ?? "CTRF run error",
      }),
    );
  }
  return findings;
}
