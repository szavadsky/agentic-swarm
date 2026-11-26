import fs from "node:fs";
import path from "node:path";
import type { CheckResult } from "../core/checks/types.js";
import type { ParsedCase, ParsedJunit } from "../core/checks/junit.js";
import { ctrfFindings, parseCtrfReport } from "../core/checks/ctrf.js";
import { capFindings, type Finding } from "../core/checks/findings.js";
import type {
  CappedGateOutput,
  GateArtifacts,
  GateCheckMeta,
  GateReports,
} from "./gates-types.js";
import { junitFindings } from "../core/checks/junit-findings.js";
import { logFindings, regexFindings } from "../core/checks/log-findings.js";
import { parseSarifLog, sarifFindings } from "../core/checks/sarif.js";
import type { GateConfig } from "./types.js";

/** Characters of gate output a fix turn gets to read. */
export const GATE_OUTPUT_CAP = 4000;

export const ANSI = new RegExp("\\u001b\\[[0-9;]*m", "g");
/** `bun test v1.4.4 (38afee6c8)`: names the runner, not the failure. */
export const BUN_BANNER = /^bun test v\d[^\s(]*(?: \([0-9a-f]+\))?$/;
/** `tests gate: wall 63.8s (...)`: run-tests.ts's timing report, not a failure. */
export const TESTS_GATE_WALL = /^tests gate: wall \d+(?:\.\d+)?s(?:\s|$)/;
/** `src/a.ts(12,3): error TS2322:` — tsc's default format, the one a piped gate gets. */
export const TSC_PAREN = /^(.+?)\((\d+),\d+\):\s+error\s+(TS\d+):/;
/** `src/a.ts:12:3 - error TS2322:` — tsc's `--pretty` (TTY) format. */
export const TSC_DASH = /^(.+?):(\d+):\d+\s+-\s+error\s+(TS\d+):/;
/** A tsc diagnostic with no file of its own, such as a missing type package. */
export const TSC_GLOBAL = /^error\s+(TS\d+):\s*(.+)$/;
/** Bun's default reporter: `(fail) suite > test [1.2ms]`. */
export const BUN_FAIL = /^\(fail\)\s+(.+?)(?:\s+\[\d+(?:\.\d+)?ms\])?$/;
/** Bun prints a per-file header before that file's failures. */
export const BUN_FILE = /^(.+?\.(?:test|spec)\.[cm]?[jt]sx?):$/;
/** A file-level failure bun reports instead of a test result. */
export const BUN_UNHANDLED = "# Unhandled error between tests";
/** Bun's tally; it ends the per-file reporter block. */
export const BUN_SUMMARY =
  /^(?:\d+ (?:pass|fail|skip|todo|errors?)|\d+ expect\(\) calls|Ran \d+ tests? across .*)$/;
/** tsc's tally; it carries no diagnostic identity. */
export const TSC_SUMMARY = /^Found \d+ errors?(?: in \d+ files?)?\.$/;
export const SEPARATOR = /^-{3,}$/;
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
 * cannot become a failure identity, and the `truncated` flag lets signature
 * matching resume at a report block instead of at an arbitrary detail line.
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
  if (artifacts.ctrf) {
    const findings = ctrfFindings(gate.id, parseCtrfReport(artifacts.ctrf));
    if (findings.length > 0) return capFindings(findings);
  }
  if (artifacts.junit) {
    const findings = await junitFindings(gate.id, artifacts.junit);
    if (findings.length > 0) return capFindings(findings);
  }
  if (artifacts.sarif) {
    const findings = sarifFindings(gate.id, parseSarifLog(artifacts.sarif));
    if (findings.length > 0) return capFindings(findings);
  }
  const fromRegex = regexFindings(
    gate.id,
    artifacts.log,
    gate.format?.regex ?? [],
  );
  if (fromRegex.length > 0) return capFindings(fromRegex);
  return capFindings(logFindings(gate.id, artifacts.log, artifacts.exitCode));
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
