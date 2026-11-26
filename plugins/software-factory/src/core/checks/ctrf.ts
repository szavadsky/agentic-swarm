import path from "node:path";
import { type CTRFReport, validate } from "ctrf";
import { GateReportError, makeFinding, type Finding } from "./findings.js";

/** Normalizes a CTRF test's filePath relative to `cwd` when inside it. */
function normalizeTestFile(filePath: string | undefined, cwd?: string): string {
  if (!filePath) return "";
  if (!cwd || !path.isAbsolute(filePath)) return filePath.replace(/\\/g, "/");
  const rel = path.relative(cwd, filePath);
  if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.replace(/\\/g, "/");
  }
  return filePath.replace(/\\/g, "/");
}

/** Stable display label for one CTRF test entry across worktrees. */
function ctrfTestLabel(
  test: CTRFReport["results"]["tests"][number],
  cwd?: string,
): string {
  const file = normalizeTestFile(test.filePath, cwd);
  const suite = (test.suite ?? []).filter(
    (name) => name !== test.filePath && name !== file && name !== "",
  );
  return [...(file ? [file] : []), ...suite, test.name].join(" > ");
}

/** Passing per-test durations in milliseconds from a validated CTRF report. */
export function ctrfTestRuntimes(
  report: CTRFReport,
  cwd?: string,
): Record<string, number> {
  const runtimes = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const test of report.results.tests) {
    if (test.status !== "passed") continue;
    if (
      typeof test.duration !== "number" ||
      !Number.isFinite(test.duration) ||
      test.duration < 0
    ) {
      continue;
    }
    const base = ctrfTestLabel(test, cwd);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const key = count === 1 ? base : `${base} (#${count})`;
    runtimes.set(key, test.duration);
  }
  return Object.fromEntries(
    [...runtimes.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

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
