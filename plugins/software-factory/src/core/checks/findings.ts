import { fingerprintText } from "../fingerprint.js";
import type { Finding, FindingSeverity } from "./types.js";

export type { Finding, FindingSeverity } from "./types.js";

/** A declared report exists but cannot be read as the format it claims. */
export class GateReportError extends Error {
  override name = "GateReportError";
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
