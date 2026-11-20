// biome-ignore-all lint/complexity: split-rest
import fs from "node:fs";
import path from "node:path";
import type { CheckResult } from "../core/checks/types.js";
import {
  capJunit,
  parseJunit,
  type ParsedCase,
  type ParsedJunit,
} from "../core/checks/junit.js";
import { fingerprintText } from "../core/fingerprint.js";
import { KeyedMutex } from "../core/mutex.js";
import { runProcess, type ProcessResult } from "../core/proc.js";
import type { GateConfig, GatePattern, KernelRuntime } from "./types.js";

export const GATE_TIMEOUT_SEC = 900;
/** Characters of gate output a fix turn gets to read. */
export const GATE_OUTPUT_CAP = 4000;

const ANSI = new RegExp("\\u001b\\[[0-9;]*m", "g");
/** `bun test v1.4.4 (38afee6c8)`: names the runner, not the failure. */
const BUN_BANNER = /^bun test v\d[^\s(]*(?: \([0-9a-f]+\))?$/;
/** `tests gate: wall 63.8s (...)`: run-tests.ts's timing report, not a failure. */
const TESTS_GATE_WALL = /^tests gate: wall \d+(?:\.\d+)?s(?:\s|$)/;
/** `src/a.ts(12,3): error TS2322:` — tsc's default format, the one a piped gate gets. */
const TSC_PAREN = /^(.+?)\((\d+),\d+\):\s+error\s+(TS\d+):/;
/** `src/a.ts:12:3 - error TS2322:` — tsc's `--pretty` (TTY) format. */
const TSC_DASH = /^(.+?):(\d+):\d+\s+-\s+error\s+(TS\d+):/;
/** A tsc diagnostic with no file of its own, such as a missing type package. */
const TSC_GLOBAL = /^error\s+(TS\d+):\s*(.+)$/;
/** Bun's default reporter: `(fail) suite > test [1.2ms]`. */
const BUN_FAIL = /^\(fail\)\s+(.+?)(?:\s+\[\d+(?:\.\d+)?ms\])?$/;
/** Bun prints a per-file header before that file's failures. */
const BUN_FILE = /^(.+?\.(?:test|spec)\.[cm]?[jt]sx?):$/;
/** A file-level failure bun reports instead of a test result. */
const BUN_UNHANDLED = "# Unhandled error between tests";
/** Bun's tally; it ends the per-file reporter block. */
const BUN_SUMMARY =
  /^(?:\d+ (?:pass|fail|skip|todo|errors?)|\d+ expect\(\) calls|Ran \d+ tests? across .*)$/;
/** tsc's tally; it carries no diagnostic identity. */
const TSC_SUMMARY = /^Found \d+ errors?(?: in \d+ files?)?\.$/;
const SEPARATOR = /^-{3,}$/;
/** An absolute path; its prefix is a run root, never part of the failure. */
const ABSOLUTE_PATH = /(?<![\w:/])\/(?:[^\s:'"()/]+\/)+[^\s:'"()/]+/g;
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
function normaliseRoots(line: string, roots: readonly string[]): string {
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
interface GateCheckMeta {
  /** Absolute directories the gate ran from; their prefixes are not identity. */
  roots: string[];
  /** The output is the tail of a longer report; its head is gone. */
  truncated: boolean;
  /** The runner whose printed failure report the output carries. */
  pattern?: GatePattern;
}

const GATE_PATTERNS: readonly GatePattern[] = ["pytest", "jest", "cargo"];

function gateCheckMeta(check: CheckResult): GateCheckMeta {
  const details = check.details;
  if (typeof details !== "object" || details === null)
    return { roots: [], truncated: false };
  const meta = details as {
    roots?: unknown;
    truncated?: unknown;
    pattern?: unknown;
  };
  return {
    roots: Array.isArray(meta.roots)
      ? meta.roots.filter((root): root is string => typeof root === "string")
      : [],
    truncated: meta.truncated === true,
    pattern: GATE_PATTERNS.find((pattern) => pattern === meta.pattern),
  };
}

export interface CappedGateOutput {
  output: string;
  /** The head was dropped; a bun report resumes at its next file header. */
  truncated: boolean;
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

/** A check that could not run; the baseline never records one as red. */
export interface GateInfra {
  kind: "infra";
  cause: string;
}

export function isInfraCheck(check: CheckResult): boolean {
  const details = check.details;
  if (
    typeof details === "object" &&
    details !== null &&
    (details as { kind?: unknown }).kind === "infra"
  ) {
    return true;
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

function junitDetails(check: CheckResult): ParsedJunit | undefined {
  const details = check.details;
  if (typeof details !== "object" || details === null) return undefined;
  const junit = (details as { junit?: unknown }).junit;
  if (typeof junit !== "object" || junit === null) return undefined;
  return Array.isArray((junit as { cases?: unknown }).cases)
    ? (junit as ParsedJunit)
    : undefined;
}

/**
 * pytest's `FAILED tests/a.py::test - assertion detail` summary and its verbose
 * `tests/a.py::test FAILED` line. The assertion text after ` - ` drifts with
 * the values under test, so the node id is the identity.
 */
function pytestSignatures(lines: readonly string[]): Set<string> {
  const signatures = new Set<string>();
  for (const line of lines) {
    const summary = /^(?:FAILED|ERROR)\s+(\S+?)(?:\s+-\s+.*)?$/.exec(line);
    if (summary) {
      signatures.add(summary[1]!);
      continue;
    }
    const verbose = /^(\S+)\s+(?:FAILED|ERROR)(?:\s|$)/.exec(line);
    if (verbose) signatures.add(verbose[1]!);
  }
  return signatures;
}

/**
 * jest's `FAIL src/a.test.ts` header followed by `● suite › test` bullets. The
 * bullet repeats before each assertion of one failure; the set keeps one.
 */
function jestSignatures(lines: readonly string[]): Set<string> {
  const signatures = new Set<string>();
  let file = "";
  for (const line of lines) {
    const failedFile = /^FAIL\s+(\S+)$/.exec(line);
    if (failedFile) {
      file = failedFile[1]!;
      continue;
    }
    const bullet = /^[●✕]\s+(.+)$/u.exec(line);
    if (bullet) {
      signatures.add(file ? `${file} > ${bullet[1]}` : `test: ${bullet[1]}`);
    }
  }
  return signatures;
}

/** libtest's `test tests::alpha ... FAILED`; passed tests name no failure. */
function cargoSignatures(lines: readonly string[]): Set<string> {
  const signatures = new Set<string>();
  for (const line of lines) {
    const failed = /^test\s+(.+?)\s+\.\.\.\s+FAILED$/.exec(line);
    if (failed) signatures.add(failed[1]!);
  }
  return signatures;
}

function patternSignatures(
  pattern: GatePattern,
  lines: readonly string[],
): Set<string> {
  switch (pattern) {
    case "pytest":
      return pytestSignatures(lines);
    case "jest":
      return jestSignatures(lines);
    case "cargo":
      return cargoSignatures(lines);
  }
}

/**
 * Failure identities of one gate run: tsc diagnostics collapse to
 * `file:line code`, bun failures to `file > test`, bun's file-level load errors
 * to `file > error`, and any other output line outside a reporter block is
 * kept as `line: ...` after its run root is normalised. A red gate is inherited
 * only for the signatures it was red for, so a new failure under the same gate
 * still counts.
 *
 * A JUnit report or a declared `format.pattern` is the identity when it names a
 * failure: its case names survive timing and assertion-value drift, which raw
 * output lines do not. A report with no failure and a pattern that matched
 * nothing fall back to the output lines, so a gate that exits red for a reason
 * no case records is still identifiable.
 *
 * In a capped report the head is gone, so the file a line belongs to is
 * unknown until the next bun file header. Until then only lines that name
 * themselves are identities: a `(fail)` line becomes the root-independent
 * `test: ...` (its file header was cut away) and an unhandled block's `error:`
 * line is kept. Detail lines, whose line numbers and values drift with
 * unrelated edits, are dropped rather than becoming `line:` identities; when
 * nothing names itself the gate matches as an unidentified failure.
 */
export function gateSignatures(check: CheckResult): Set<string> {
  const meta = gateCheckMeta(check);
  const lines = check.output
    .split("\n")
    .map((line) => normaliseRoots(line.replace(ANSI, "").trim(), meta.roots));
  const signatures = new Set<string>();

  const junit = junitDetails(check);
  if (junit) {
    for (const c of junit.cases) {
      if (c.status === "fail")
        signatures.add(`${check.name} > ${caseLabel(c)}`);
    }
    if (junit.suiteFailed && signatures.size === 0) {
      signatures.add(`${check.name} > suite-failure`);
    }
    if (signatures.size > 0) return signatures;
  }

  if (meta.pattern) {
    const fromPattern = patternSignatures(meta.pattern, lines);
    if (fromPattern.size > 0) return fromPattern;
  }

  const { truncated } = meta;
  let file = "";
  // Inside a bun file report. Its detail lines only repeat the failure the
  // header, `(fail)` line or unhandled block already names, and their line
  // numbers and values drift with unrelated edits.
  let reporting = false;
  // Truncated output before its next file header: the detail lines belong to a
  // failure block whose header the cut removed, so they carry no identity.
  let head = truncated;
  // A separator-delimited block whose `# Unhandled error` marker the cut removed.
  let headErrorBlock = false;
  // Inside bun's "Unhandled error between tests" block: marker, opening
  // separator, error text, closing separator (blank lines may separate them).
  let unhandled = false;
  let opened = false;
  let error: string | undefined;
  const flushUnhandled = (): void => {
    if (error) signatures.add(file ? `${file} > ${error}` : `test: ${error}`);
  };
  for (const line of lines) {
    if (!line) continue;
    if (BUN_BANNER.test(line) || TESTS_GATE_WALL.test(line)) continue;
    if (line === BUN_UNHANDLED) {
      unhandled = true;
      opened = false;
      error = undefined;
      continue;
    }
    if (unhandled) {
      if (SEPARATOR.test(line)) {
        if (!opened) opened = true;
        else {
          flushUnhandled();
          unhandled = false;
        }
        continue;
      }
      // The code frame precedes the headline; the headline is the identity.
      if (line.startsWith("error:")) error = line;
      continue;
    }
    const header = BUN_FILE.exec(line);
    if (header) {
      file = header[1]!;
      reporting = true;
      head = false;
      headErrorBlock = false;
      continue;
    }
    const tsc = TSC_PAREN.exec(line) ?? TSC_DASH.exec(line);
    if (tsc) {
      signatures.add(`${tsc[1]}:${tsc[2]} ${tsc[3]}`);
      reporting = false;
      continue;
    }
    const global = TSC_GLOBAL.exec(line);
    if (global) {
      signatures.add(`tsc ${global[1]}: ${global[2]}`);
      reporting = false;
      continue;
    }
    const fail = BUN_FAIL.exec(line);
    if (fail) {
      signatures.add(file ? `${file} > ${fail[1]}` : `test: ${fail[1]}`);
      reporting = true;
      continue;
    }
    if (SEPARATOR.test(line)) {
      if (head) headErrorBlock = !headErrorBlock;
      continue;
    }
    if (TSC_SUMMARY.test(line) || BUN_SUMMARY.test(line)) {
      reporting = false;
      continue;
    }
    if (head) {
      // The marker for an unhandled block was cut; its error line still names
      // the failure and is stable across runs.
      if (headErrorBlock && line.startsWith("error:"))
        signatures.add(`test: ${line}`);
      continue;
    }
    if (!reporting) signatures.add(`line: ${line}`);
  }
  // A block cut off before its closing separator still names its error.
  if (unhandled) flushUnhandled();
  return signatures;
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

/**
 * Branch checks and merged-result gates share ports, caches and build dirs only
 * as far as a repo declares; a gate that names a mutex in `serial` holds it for
 * its own command, and a gate that names none never waits. Keyed by the repo
 * that declared it and the name, so one repo's declaration cannot serialize
 * another's runs in the same process.
 */
const gateMutexes = new KeyedMutex();

/**
 * The directories a gate declared in `env`, created under its worktree and
 * exported as absolute paths. `cwd` is the worktree, so the same declaration
 * yields a separate directory per worktree and concurrent runs never share one.
 */
function gateEnvDirs(
  cwd: string,
  env: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const dirs: Record<string, string> = {};
  for (const [name, dir] of Object.entries(env)) {
    const absolute = path.resolve(cwd, dir);
    try {
      fs.mkdirSync(absolute, { recursive: true });
    } catch (error) {
      throw new Error(
        `cannot create env dir ${name}="${dir}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    dirs[name] = absolute;
  }
  return dirs;
}

/**
 * Runs one declared gate command with its env dirs created and the mutexes it
 * names held. Names are taken in sorted order, so two gates naming the same
 * pair in different order cannot deadlock; a gate holds them only for its own
 * command, so the rest of the run — and every other worktree's run — proceeds.
 */
function runGateCommand(
  repoRoot: string,
  cwd: string,
  gate: GateConfig,
  command: string,
  extraEnv?: Record<string, string>,
): Promise<ProcessResult> {
  const ordered = [...new Set(gate.serial)].sort();
  const launch = (index: number): Promise<ProcessResult> => {
    const name = ordered[index];
    if (name === undefined) {
      let env: Record<string, string> | undefined;
      try {
        env = gateEnvDirs(cwd, gate.env);
      } catch (error) {
        // An env dir that cannot be created is an environment failure, not a
        // verdict on the tree: report it as a command that could not start so
        // callers record infra instead of rejecting the whole run.
        return Promise.resolve({
          code: 126,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: false,
          aborted: false,
          durationMs: 0,
        });
      }
      if (extraEnv) env = { ...env, ...extraEnv };
      return runProcess({
        cmd: command,
        cwd,
        env,
        timeoutSec: GATE_TIMEOUT_SEC,
        maxOutputBytes: GATE_OUTPUT_CAP * 4,
      });
    }
    return gateMutexes.runExclusive(`${repoRoot}\u0000${name}`, () =>
      launch(index + 1),
    );
  };
  return launch(0);
}

/** A case's identity within its gate: the report's file, then its name. */
function caseLabel(c: ParsedCase): string {
  return c.file ? `${c.file} > ${c.name}` : c.name;
}

/** Cases a red gate's summary names before it counts the rest. */
const SUMMARY_CASES = 5;
/** Characters of one case name in a summary. */
const SUMMARY_NAME_CHARS = 120;

/** A red gate's summary names what failed; `exit 0` says nothing. */
function junitSummary(parsed: ParsedJunit, code: number | null): string {
  const failing = parsed.cases
    .filter((c) => c.status === "fail")
    .map(caseLabel);
  if (failing.length > 0) {
    const shown = failing
      .slice(0, SUMMARY_CASES)
      .map((name) => name.slice(0, SUMMARY_NAME_CHARS));
    const rest = failing.length - shown.length;
    return `${failing.length} failing: ${shown.join(", ")}${rest > 0 ? `, +${rest} more` : ""}`;
  }
  if (parsed.suiteFailed) return "suite failure";
  if (parsed.cases.length === 0) return "empty JUnit report";
  return `exit ${code}`;
}

/** A red JUnit gate's identity: its failing cases, never its passing ones. */
function junitIdentity(parsed: ParsedJunit | undefined): string {
  if (!parsed) return "";
  const failing = parsed.cases
    .filter((c) => c.status === "fail")
    .map(caseLabel)
    .sort();
  if (failing.length > 0) return failing.join(",");
  return parsed.suiteFailed ? "suite-failure" : "";
}

/** One declared gate run: its command result and the check built from it. */
export interface DeclaredGateRun {
  res: ProcessResult;
  check: CheckResult;
}

/**
 * Runs one gate as declared and records what it produced. A `format.junit`
 * gate writes its report to the declared worktree-relative path — the kernel
 * exports the absolute path as `FACTORY_JUNIT_PATH` for runners that honour it
 * and reads the same file for the case identities. A `format.pattern` gate's
 * runner is recorded so `gateSignatures` reads its printed failures. Both
 * `runGates` and the baseline use this, so a gate executes and is recorded
 * identically on base and in a task worktree.
 */
export async function runDeclaredGate(
  repoRoot: string,
  cwd: string,
  gate: GateConfig,
): Promise<DeclaredGateRun> {
  const junitPath = gate.format?.junit
    ? path.resolve(cwd, gate.format.junit)
    : undefined;
  if (junitPath) fs.rmSync(junitPath, { force: true });
  const res = await runGateCommand(
    repoRoot,
    cwd,
    gate,
    gate.command,
    junitPath ? { FACTORY_JUNIT_PATH: junitPath } : undefined,
  );

  let parsed: ParsedJunit | undefined;
  let junitError: string | undefined;
  if (junitPath) {
    try {
      if (fs.existsSync(junitPath)) {
        parsed = parseJunit(fs.readFileSync(junitPath, "utf8"));
      } else {
        junitError = "JUnit report not generated";
      }
    } catch (error) {
      junitError = `JUnit report unreadable: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      fs.rmSync(junitPath, { force: true });
    }
  }

  const capped = capGateOutput(`${res.stdout}\n${res.stderr}`, [cwd]);
  const ok =
    !res.timedOut &&
    res.code === 0 &&
    junitError === undefined &&
    !(parsed?.suiteFailed ?? false) &&
    !(parsed?.cases.some((c) => c.status === "fail") ?? false) &&
    !(parsed !== undefined && parsed.cases.length === 0);
  const summary = ok
    ? "pass"
    : res.timedOut
      ? `timed out after ${GATE_TIMEOUT_SEC}s`
      : res.code === 126 || res.code === 127
        ? `exit ${res.code}`
        : junitError
          ? junitError
          : parsed
            ? junitSummary(parsed, res.code)
            : `exit ${res.code}`;

  const details: Record<string, unknown> = {
    roots: [cwd],
    truncated: capped.truncated,
  };
  if (gate.format?.pattern) details.pattern = gate.format.pattern;
  // The record keeps a capped report; the verdict above read every case.
  if (parsed) details.junit = capJunit(parsed);
  if (junitError) details.error = junitError;

  return {
    res,
    check: {
      name: gate.id,
      ok,
      summary,
      output: capped.output,
      fingerprint: fingerprintText(
        `${gate.id}:${junitIdentity(parsed) || capped.output}`,
        { lowercase: false },
      ),
      details,
    },
  };
}

/**
 * Runs the repo-config gates in `cwd`. Gates are commands, not the v2 check
 * pipeline: kernel-0 only needs a red/green signal and the output a fix turn
 * must read. `only` re-runs a subset after a red run. Runs in different
 * worktrees are independent; only mutexes a gate declares make it wait.
 */
export async function runGates(
  runtime: KernelRuntime,
  cwd: string,
  opts: { only?: ReadonlySet<string> } = {},
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const only = opts.only;
  const gates =
    only === undefined
      ? runtime.configs.repo.gates
      : runtime.configs.repo.gates.filter((gate) => only.has(gate.id));
  for (const gate of gates) {
    const { check } = await runDeclaredGate(runtime.paths.repoRoot, cwd, gate);
    results.push(check);
  }
  return results;
}

export function failingChecks(checks: readonly CheckResult[]): CheckResult[] {
  return checks.filter((c) => !c.ok);
}

/** Compact red-gate text for an implementer's next turn; empty when green. */
export function formatFailingChecks(
  checks: readonly CheckResult[] | undefined,
): string {
  if (!checks || checks.length === 0) return "";
  return failingChecks(checks)
    .map((c) => `### ${c.name}: ${c.summary}\n${c.output}`)
    .join("\n\n");
}

/**
 * Failing gates that are the task's own: an inherited failure is dropped only
 * when every signature it fails for was already red on base (KERNEL0 §6); one
 * new signature under the same gate name still forces a fix round and blocks
 * the merge.
 */
export function newGateFailures(
  checks: readonly CheckResult[],
  preexisting: ReadonlySet<string>,
): CheckResult[] {
  return failingChecks(checks).filter((check) => {
    const signatures = gateSignatures(check);
    // A silent red gate offers only its name, exactly as before signature
    // matching: there is no evidence that this run's failure is a new one.
    if (signatures.size === 0) {
      return !preexisting.has(
        gateSignatureKey(check.name, UNIDENTIFIED_GATE_FAILURE),
      );
    }
    for (const signature of signatures) {
      if (!preexisting.has(gateSignatureKey(check.name, signature)))
        return true;
    }
    return false;
  });
}

/**
 * Failing test names of one red gate for its `gate-flake` record: the sorted
 * failure identities of the red run. A silent red gate offers only its name,
 * recorded as the unidentified failure its checks record matches on.
 */
export function gateFlakeTests(check: CheckResult): string[] {
  const signatures = gateSignatures(check);
  if (signatures.size === 0) return [UNIDENTIFIED_GATE_FAILURE];
  return [...signatures].sort();
}
