import { fingerprintText } from "../fingerprint.js";

/** A declared report exists but cannot be read as the format it claims. */
export class GateReportError extends Error {
  override name = "GateReportError";
}

/** How a finding affects the tree, mapped from CTRF status or SARIF level. */
export type FindingSeverity = "error" | "warning" | "info";

/**
 * One gate finding. CTRF tests, SARIF results and log regexes all land here, so
 * a fix turn and the pre-existing check read one vocabulary.
 */
export interface Finding {
  /** The gate that produced it. */
  check: string;
  /** The producer the report names: a CTRF tool, a SARIF driver or `regex`/`log`. */
  tool: string;
  /** The file the finding points at, when the report names one. */
  file?: string;
  /** One-based line, when the report names one. */
  line?: number;
  /** A rule id, test name or test id; the stable part of a test finding. */
  rule?: string;
  severity: FindingSeverity;
  message: string;
  /** Stable identity a later run matches against the base. */
  fingerprint: string;
}

/**
 * The fingerprint covers what names the finding, not what it printed: a test's
 * assertion values, a report id and timings drift between runs, while the rule
 * (or, when there is none, the message) is the identity.
 */
export function findingFingerprint(
  finding: Omit<Finding, "fingerprint">,
): string {
  const identity = [
    finding.check,
    finding.tool,
    finding.file ?? "",
    finding.line?.toString() ?? "",
    finding.rule ?? finding.message,
  ].join("\u0000");
  return fingerprintText(identity, { lowercase: false });
}

/**
 * `identity` overrides the fields above when the report carries a stronger
 * stable id (CTRF's `testId` keeps the file and classname a rule label drops).
 */
export function makeFinding(
  finding: Omit<Finding, "fingerprint">,
  identity?: string,
): Finding {
  return {
    ...finding,
    fingerprint:
      identity === undefined
        ? findingFingerprint(finding)
        : fingerprintText(`${finding.check}\u0000${identity}`, {
            lowercase: false,
          }),
  };
}

/** Findings a check record keeps; failures come first and the tail is dropped. */
const FINDINGS_CAP = 200;

export function capFindings(findings: readonly Finding[]): Finding[] {
  return [...findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, FINDINGS_CAP);
}

function severityRank(severity: FindingSeverity): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}
