import type { CheckResult } from "../core/checks/types.js";
import type { ParsedJunit } from "../core/checks/junit.js";
import type { Finding } from "../core/checks/findings.js";
import {
  ANSI,
  BUN_BANNER,
  BUN_FAIL,
  BUN_FILE,
  BUN_SUMMARY,
  BUN_UNHANDLED,
  SEPARATOR,
  TESTS_GATE_WALL,
  TSC_DASH,
  TSC_GLOBAL,
  TSC_PAREN,
  TSC_SUMMARY,
  caseLabel,
  findingDetails,
  gateCheckMeta,
  junitDetails,
  normaliseRoots,
} from "./gates-normalise.js";

/** A report finding's identity; the log fallback stays on the raw-output reader. */
function findingGateSignatures(
  check: CheckResult,
  findings: readonly Finding[],
): Set<string> | undefined {
  const signatures = new Set<string>();
  for (const finding of findings) {
    if (finding.tool === "log" || finding.severity !== "error") continue;
    const label =
      finding.rule !== undefined
        ? [finding.file, finding.rule].filter(Boolean).join(" > ")
        : [finding.file, finding.message].filter(Boolean).join(" > ");
    signatures.add(`${check.name} > ${label}`);
  }
  return signatures.size > 0 ? signatures : undefined;
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

interface BunScanState {
  file: string;
  /** Inside a bun file report; detail lines repeat the named failure. */
  reporting: boolean;
  /** Truncated output before its next file header; the header was cut away. */
  head: boolean;
  /** A separator-delimited block whose `# Unhandled error` marker was cut. */
  headErrorBlock: boolean;
  /** Inside bun's "Unhandled error between tests" block. */
  unhandled: boolean;
  opened: boolean;
  error: string | undefined;
  signatures: Set<string>;
}

function flushUnhandled(state: BunScanState): void {
  if (state.error)
    state.signatures.add(
      state.file ? `${state.file} > ${state.error}` : `test: ${state.error}`,
    );
}

/** Blank lines, the runner banner and the timing report name no failure. */
function isSkippableLine(line: string): boolean {
  return line === "" || BUN_BANNER.test(line) || TESTS_GATE_WALL.test(line);
}

/** One line inside bun's "Unhandled error between tests" block. */
function consumeUnhandledLine(state: BunScanState, line: string): void {
  if (SEPARATOR.test(line)) {
    if (!state.opened) state.opened = true;
    else {
      flushUnhandled(state);
      state.unhandled = false;
    }
    return;
  }
  // The code frame precedes the headline; the headline is the identity.
  if (line.startsWith("error:")) state.error = line;
}

/**
 * A line that names its own failure: a bun file header, a tsc diagnostic or a
 * `(fail)` line. Detail lines belong to the failure already named; their line
 * numbers and values drift with unrelated edits.
 */
function consumeNamedLine(state: BunScanState, line: string): boolean {
  const header = BUN_FILE.exec(line);
  if (header) {
    state.file = header[1]!;
    state.reporting = true;
    state.head = false;
    state.headErrorBlock = false;
    return true;
  }
  const tsc = TSC_PAREN.exec(line) ?? TSC_DASH.exec(line);
  if (tsc) {
    state.signatures.add(`${tsc[1]}:${tsc[2]} ${tsc[3]}`);
    state.reporting = false;
    return true;
  }
  const global = TSC_GLOBAL.exec(line);
  if (global) {
    state.signatures.add(`tsc ${global[1]}: ${global[2]}`);
    state.reporting = false;
    return true;
  }
  const fail = BUN_FAIL.exec(line);
  if (fail) {
    state.signatures.add(
      state.file ? `${state.file} > ${fail[1]}` : `test: ${fail[1]}`,
    );
    state.reporting = true;
    return true;
  }
  return false;
}

/** Tallies, separators and detail lines; only lines outside a reporter block name failures. */
function consumeDetailLine(state: BunScanState, line: string): void {
  if (SEPARATOR.test(line)) {
    if (state.head) state.headErrorBlock = !state.headErrorBlock;
    return;
  }
  if (TSC_SUMMARY.test(line) || BUN_SUMMARY.test(line)) {
    state.reporting = false;
    return;
  }
  if (state.head) {
    // The marker for an unhandled block was cut; its error line still names
    // the failure and is stable across runs.
    if (state.headErrorBlock && line.startsWith("error:"))
      state.signatures.add(`test: ${line}`);
    return;
  }
  if (!state.reporting) state.signatures.add(`line: ${line}`);
}

/**
 * Failure identities from bun/tsc output lines. In a capped report the head is
 * gone, so the file a line belongs to is unknown until the next bun file
 * header. Until then only lines that name themselves are identities: a
 * `(fail)` line becomes the root-independent `test: ...` (its file header was
 * cut away) and an unhandled block's `error:` line is kept. Detail lines,
 * whose line numbers and values drift with unrelated edits, are dropped rather
 * than becoming `line:` identities; when nothing names itself the gate matches
 * as an unidentified failure.
 */
function scanBunTscLines(
  lines: readonly string[],
  truncated: boolean,
): Set<string> {
  const state: BunScanState = {
    file: "",
    reporting: false,
    head: truncated,
    headErrorBlock: false,
    unhandled: false,
    opened: false,
    error: undefined,
    signatures: new Set<string>(),
  };
  for (const line of lines) {
    if (isSkippableLine(line)) continue;
    if (line === BUN_UNHANDLED) {
      state.unhandled = true;
      state.opened = false;
      state.error = undefined;
      continue;
    }
    if (state.unhandled) {
      consumeUnhandledLine(state, line);
      continue;
    }
    if (consumeNamedLine(state, line)) continue;
    consumeDetailLine(state, line);
  }
  // A block cut off before its closing separator still names its error.
  if (state.unhandled) flushUnhandled(state);
  return state.signatures;
}

/**
 * Failure identities of one gate run: a report's findings when it names one
 * (`test > file > name`, `tool > file > rule`), otherwise tsc diagnostics
 * collapse to `file:line code`, bun failures to `file > test`, bun's file-level
 * load errors to `file > error`, and any other output line outside a reporter
 * block is kept as `line: ...` after its run root is normalised. A red gate is
 * inherited only for the signatures it was red for, so a new failure under the
 * same gate still counts.
 *
 * Legacy records that stored `details.junit` are still read; new records carry
 * `details.findings`, and a report with no failure falls back to the output
 * lines, so a gate that exits red for a reason no report records is still
 * identifiable.
 */
export function gateSignatures(check: CheckResult): Set<string> {
  const meta = gateCheckMeta(check);
  const lines = check.output
    .split("\n")
    .map((line) => normaliseRoots(line.replace(ANSI, "").trim(), meta.roots));
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
  return scanBunTscLines(lines, meta.truncated);
}

/**
 * One inherited-failure key. `preexistingRed` and `newGateFailures` are the
 * only readers, so the separator stays internal to those two.
 */
export function gateSignatureKey(gate: string, signature: string): string {
  return `${gate}\u0000${signature}`;
}

/** A red gate that printed nothing: the only identity it offers is its name. */
export const UNIDENTIFIED_GATE_FAILURE = "<unidentified failure>";
