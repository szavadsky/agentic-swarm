import fs from "node:fs";
import path from "node:path";
import type { CheckResult } from "../core/checks/types.js";
import type { ParsedCase, ParsedJunit } from "../core/checks/junit.js";
import {
  ctrfFindings,
  ctrfTestRuntimes,
  parseCtrfReport,
} from "../core/checks/ctrf.js";
import { capFindings, type Finding } from "../core/checks/findings.js";
import type {
  CappedGateOutput,
  GateArtifacts,
  GateCheckMeta,
  GateReports,
  NormalisedGateReports,
} from "./gates-types.js";
import { junitToCtrf } from "../core/checks/junit-findings.js";
import { logFindings, regexFindings } from "../core/checks/log-findings.js";
import { parseSarifLog, sarifFindings } from "../core/checks/sarif.js";
import type { GateConfig } from "./types.js";

/** Characters of gate output a fix turn gets to read. */
export const GATE_OUTPUT_CAP = 4000;

export const ANSI = new RegExp("\\u001b\\[[0-9;]*m", "g");
/** An absolute path; its prefix is a run root, never part of the failure. */
export const ABSOLUTE_PATH = /(?<![\w:/])\/(?:[^\s:'"()/]+\/)+[^\s:'"()/]+/g;
/** Stateless membership test for the pattern above (`/g` makes `.test` stateful). */
const ABSOLUTE_PATH_TEST = new RegExp(ABSOLUTE_PATH.source);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The task worktree, the baseline scratch worktree and the gate export temp dir
 * all print absolute paths with a different prefix, so a failure seen from one
 * root must not look new from another. Replacing only the roots its caller
 * knows keeps the directories below the root, so two failures that differ only
 * there stay distinct. A path outside every known root falls back to its
 * basename: the gate may create its own temp root (the export dir), and that
 * random prefix must not leak into an identity.
 */
export function normaliseRoots(line: string, roots: readonly string[]): string {
  // Ends in a word character so the basename fallback below cannot re-match the
  // path that follows the token.
  const rootToken = "\u0000root";
  // Already-normalised output is stored capped, so the signature reader meets
  // `<root>` again: protect it first, or the fallback below would re-match the
  // `/dir/file` tail as a new absolute path.
  let normalised = line.replaceAll("<root>", rootToken);
  for (const root of [...roots].sort((a, b) => b.length - a.length)) {
    const prefix = root.replace(/\/+$/, "");
    if (!prefix) continue;
    const pattern = new RegExp(
      `(?<![\\w:/])${escapeRegExp(prefix)}(?=/|$)`,
      "g",
    );
    normalised = normalised.replace(pattern, rootToken);
  }
  return normalised
    .replace(
      ABSOLUTE_PATH,
      (match) => `<root>/${match.slice(match.lastIndexOf("/") + 1)}`,
    )
    .replaceAll(rootToken, "<root>");
}

/** What a gate producer knows about its own run but the signature reader cannot. */
export function gateCheckMeta(check: CheckResult): GateCheckMeta {
  const details = check.details;
  if (typeof details !== "object" || details === null)
    return { roots: [], truncated: false };
  const meta = details as { roots?: unknown; truncated?: unknown };
  return {
    roots: Array.isArray(meta.roots)
      ? meta.roots.filter((root): root is string => typeof root === "string")
      : [],
    truncated: meta.truncated === true,
  };
}

/**
 * Caps gate output for the prompt on a line boundary: a half line at the cut
 * cannot become a failure identity.
 *
 * When the run roots are known they are normalised before cutting: the window
 * is the last `GATE_OUTPUT_CAP` characters, so a longer root would otherwise
 * push the cut later and drop head names a shorter root keeps, reading an
 * unchanged red as new. The stored tail is the normalised text, which is what
 * the signatures read.
 */
export function capGateOutput(
  text: string,
  roots: readonly string[] = [],
): CappedGateOutput {
  const trimmed = text.trim();
  const normalised =
    roots.length === 0
      ? trimmed
      : trimmed
          .split("\n")
          .map((line) => normaliseRoots(line, roots))
          .join("\n");
  if (normalised.length <= GATE_OUTPUT_CAP)
    return { output: normalised, truncated: false };
  const boundary = normalised.indexOf(
    "\n",
    normalised.length - GATE_OUTPUT_CAP,
  );
  // A single line longer than the cap has no complete line left to keep.
  return boundary === -1
    ? { output: "", truncated: true }
    : { output: normalised.slice(boundary + 1), truncated: true };
}

/** A red the task is shown but never charged: an advisory gate or task. */
export function isAdvisoryCheck(check: CheckResult): boolean {
  return check.advisory === true;
}

export function isInfraCheck(check: CheckResult): boolean {
  const details = check.details;
  if (typeof details === "object" && details !== null) {
    const record = details as { kind?: unknown; verdict?: unknown };
    if (record.verdict === "red") return false;
    if (record.kind === "infra") return true;
  }
  // A missing gate runner reports `exit 127` with no details at all (00801):
  // the summary is kernel-owned — a failing task cannot forge it — so the
  // shell's cannot-execute codes are infra evidence on their own.
  return !check.ok && /exit 12[67]/.test(check.summary);
}

/**
 * A red check recorded before run roots were stored whose output prints an
 * absolute path: without roots its paths collapse to basenames while current
 * runs keep the tail below their known root, so it must never contribute
 * inherited red. `checkBase` re-runs a baseline containing one instead of
 * reusing it. Outputs without absolute paths (reason lines, relative
 * diagnostics, silent) match the same with or without roots and stay usable.
 */
export function isStaleGateCheck(check: CheckResult): boolean {
  if (check.ok || isInfraCheck(check)) return false;
  const details = check.details;
  if (
    typeof details === "object" &&
    details !== null &&
    Array.isArray((details as { roots?: unknown }).roots)
  )
    return false;
  return ABSOLUTE_PATH_TEST.test(check.output);
}

export function junitDetails(check: CheckResult): ParsedJunit | undefined {
  const details = check.details;
  if (typeof details !== "object" || details === null) return undefined;
  const junit = (details as { junit?: unknown }).junit;
  if (typeof junit !== "object" || junit === null) return undefined;
  return Array.isArray((junit as { cases?: unknown }).cases)
    ? (junit as ParsedJunit)
    : undefined;
}

/** A case's identity within its gate: the report's file, then its name. */
export function caseLabel(c: ParsedCase): string {
  return c.file ? `${c.file} > ${c.name}` : c.name;
}

function nonEmptyRuntimes(
  runtimes: Record<string, number>,
): Record<string, number> | undefined {
  return Object.keys(runtimes).length > 0 ? runtimes : undefined;
}

/**
 * Normalises a gate's reports into the shared finding model and extracts
 * passing per-test runtimes when CTRF (or JUnit converted to CTRF) is present.
 */
export async function normaliseGateReports(
  gate: GateConfig,
  artifacts: GateArtifacts,
  cwd?: string,
): Promise<NormalisedGateReports> {
  let testRuntimes: Record<string, number> | undefined;
  if (artifacts.ctrf) {
    const report = parseCtrfReport(artifacts.ctrf);
    testRuntimes = nonEmptyRuntimes(ctrfTestRuntimes(report, cwd));
    const findings = ctrfFindings(gate.id, report);
    if (findings.length > 0) {
      return {
        findings: capFindings(findings),
        ...(testRuntimes ? { testRuntimes } : {}),
      };
    }
  }
  if (artifacts.junit) {
    const report = await junitToCtrf(gate.id, artifacts.junit);
    testRuntimes ??= nonEmptyRuntimes(ctrfTestRuntimes(report, cwd));
    const findings = ctrfFindings(gate.id, report);
    if (findings.length > 0) {
      return {
        findings: capFindings(findings),
        ...(testRuntimes ? { testRuntimes } : {}),
      };
    }
  }
  const withRuntimes = (findings: Finding[]): NormalisedGateReports => ({
    findings: capFindings(findings),
    ...(testRuntimes ? { testRuntimes } : {}),
  });
  if (artifacts.sarif) {
    const findings = sarifFindings(gate.id, parseSarifLog(artifacts.sarif));
    if (findings.length > 0) return withRuntimes(findings);
  }
  const fromRegex = regexFindings(
    gate.id,
    artifacts.log,
    gate.format?.regex ?? [],
  );
  if (fromRegex.length > 0) return withRuntimes(fromRegex);
  return withRuntimes(
    logFindings(
      gate.id,
      artifacts.log,
      artifacts.exitCode,
      gate.format?.noise ?? [],
    ),
  );
}

/**
 * One model for a gate's findings. A native CTRF report wins, a JUnit report
 * is converted to CTRF, and a SARIF log is validated against the OASIS 2.1.0
 * schema. With no report, the repo-declared log regexes are the escape hatch;
 * when they match nothing the red log itself names the findings by exit code.
 * A declared report that cannot be read throws: the caller records a red check
 * rather than pretending the gate printed no failure.
 */
export async function normaliseFindings(
  gate: GateConfig,
  artifacts: GateArtifacts,
): Promise<Finding[]> {
  return (await normaliseGateReports(gate, artifacts)).findings;
}

/** Findings a check record keeps, when it carries the new model. */
export function findingDetails(check: CheckResult): Finding[] | undefined {
  const details = check.details;
  if (typeof details !== "object" || details === null) return undefined;
  const findings = (details as { findings?: unknown }).findings;
  if (!Array.isArray(findings)) return undefined;
  return findings.filter(isFinding);
}

function isFinding(value: unknown): value is Finding {
  if (typeof value !== "object" || value === null) return false;
  const finding = value as Partial<Finding>;
  return (
    typeof finding.check === "string" &&
    typeof finding.tool === "string" &&
    typeof finding.message === "string" &&
    typeof finding.fingerprint === "string" &&
    (finding.severity === "error" ||
      finding.severity === "warning" ||
      finding.severity === "info")
  );
}

/** The worktree-relative report paths a gate declares, resolved against its cwd. */
export function gateReportPaths(gate: GateConfig, cwd: string) {
  return {
    junit: gate.format?.junit
      ? path.resolve(cwd, gate.format.junit)
      : undefined,
    ctrf: gate.format?.ctrf ? path.resolve(cwd, gate.format.ctrf) : undefined,
    sarif: gate.format?.sarif
      ? path.resolve(cwd, gate.format.sarif)
      : undefined,
  };
}

function readReport(
  file: string,
  label: string,
): { text?: string; error?: string } {
  try {
    if (!fs.existsSync(file)) return { error: `${label} report not generated` };
    const text = fs.readFileSync(file, "utf8");
    if (text.trim() === "") return { error: `${label} report is empty` };
    return { text };
  } catch (error) {
    return {
      error: `${label} report unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** Reads and consumes every report the gate declared, or names the first fault. */
export function readGateReports(cwd: string, gate: GateConfig): GateReports {
  const paths = gateReportPaths(gate, cwd);
  const contents: GateReports["contents"] = {};
  let error: string | undefined;
  for (const [kind, label] of [
    ["junit", "JUnit"],
    ["ctrf", "CTRF"],
    ["sarif", "SARIF"],
  ] as const) {
    const file = paths[kind];
    if (!file) continue;
    const report = readReport(file, label);
    if (report.error) error ??= report.error;
    else if (report.text !== undefined) contents[kind] = report.text;
  }
  return {
    contents,
    ...(error ? { error } : {}),
    testReport: Boolean(paths.junit || paths.ctrf),
  };
}
