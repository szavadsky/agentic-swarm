import type { CheckResult } from "../core/checks/types.js";
import type { ParsedJunit } from "../core/checks/junit.js";
import type { Finding } from "../core/checks/findings.js";
import {
  ANSI,
  caseLabel,
  findingDetails,
  gateCheckMeta,
  junitDetails,
  normaliseRoots,
} from "./gates-normalise.js";

/** The failures a report names; a `log` finding is console text, not a report finding. */
function reportFailures(findings: readonly Finding[]): Finding[] {
  return findings.filter(
    (finding) => finding.tool !== "log" && finding.severity === "error",
  );
}

/** A report finding's human label; the matching identity is its fingerprint. */
function findingGateSignatures(
  check: CheckResult,
  findings: readonly Finding[],
): Set<string> | undefined {
  const failures = reportFailures(findings);
  if (failures.length === 0) return undefined;
  return new Set(
    failures.map((finding) => {
      const label =
        finding.rule !== undefined
          ? [finding.file, finding.rule].filter(Boolean).join(" > ")
          : [finding.file, finding.message].filter(Boolean).join(" > ");
      return `${check.name} > ${label}`;
    }),
  );
}

/**
 * A report's failure fingerprints: the finding model's stable identity, which a
 * later run matches against the base. The log fallback names no report finding,
 * so it keeps the raw-output line identities instead.
 */
function gateFindingFingerprints(check: CheckResult): Set<string> | undefined {
  const findings = findingDetails(check);
  if (!findings) return undefined;
  const failures = reportFailures(findings);
  if (failures.length === 0) return undefined;
  return new Set(failures.map((finding) => finding.fingerprint));
}

/** A red JUnit gate's failure identities; undefined when the report names none. */
function junitGateSignatures(
  check: CheckResult,
  junit: ParsedJunit,
): Set<string> | undefined {
  const signatures = new Set<string>();
  for (const c of junit.cases) {
    if (c.status === "fail") signatures.add(`${check.name} > ${caseLabel(c)}`);
  }
  if (junit.suiteFailed && signatures.size === 0) {
    signatures.add(`${check.name} > suite-failure`);
  }
  return signatures.size > 0 ? signatures : undefined;
}

/**
 * Human-readable failure signatures of one gate run: a report's or repo log
 * regex's findings when it names one (`check > file > rule`), otherwise each
 * non-empty output line as `line: ...` after ANSI stripping and run-root
 * normalisation. Pre-existing matching prefers the finding model's fingerprint
 * (`gateFailureIdentities`) and reads these signatures only for a gate that
 * named no structured failure.
 *
 * Legacy records that stored `details.junit` are still read; new records carry
 * `details.findings`, and a gate with no structured failure falls back to the
 * output lines, so a shell-only gate that exits red is still identifiable.
 */
export function gateSignatures(check: CheckResult): Set<string> {
  const meta = gateCheckMeta(check);
  const findings = findingDetails(check);
  if (findings) {
    const fromFindings = findingGateSignatures(check, findings);
    if (fromFindings) return fromFindings;
  }
  const junit = junitDetails(check);
  if (junit) {
    const fromJunit = junitGateSignatures(check, junit);
    if (fromJunit) return fromJunit;
  }
  const signatures = new Set<string>();
  for (const raw of check.output.split("\n")) {
    const line = normaliseRoots(raw.replace(ANSI, "").trim(), meta.roots);
    if (line !== "") signatures.add(`line: ${line}`);
  }
  return signatures;
}

/**
 * One inherited-failure key. `preexistingRed` and `newGateFailures` are the
 * only readers, so the separator stays internal to those two.
 */
export function gateSignatureKey(gate: string, signature: string): string {
  return `${gate}\u0000${signature}`;
}

/**
 * The identities a run is matched on against the base: a report's finding
 * fingerprints when it names failures (the finding model's stable identity),
 * otherwise the output-line signatures keyed by their gate. Empty when the gate
 * named no failure at all.
 */
export function gateFailureIdentities(check: CheckResult): Set<string> {
  const fingerprints = gateFindingFingerprints(check);
  if (fingerprints) return fingerprints;
  return new Set(
    [...gateSignatures(check)].map((signature) =>
      gateSignatureKey(check.name, signature),
    ),
  );
}

/** A red gate that printed nothing: the only identity it offers is its name. */
export const UNIDENTIFIED_GATE_FAILURE = "<unidentified failure>";
