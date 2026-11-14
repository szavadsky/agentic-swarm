import { runProcess } from "../core/proc.js";
import { fingerprintText } from "../core/fingerprint.js";
import { KeyedMutex } from "../core/mutex.js";
import type { CheckResult } from "../core/checks/types.js";
import type { KernelRuntime } from "./types.js";

const GATE_TIMEOUT_SEC = 900;
/** Characters of gate output a fix turn gets to read. */
export const GATE_OUTPUT_CAP = 4000;

const ANSI = /\u001b\[[0-9;]*m/g;
/** `bun test v1.4.4 (38afee6c8)`: names the runner, not the failure. */
const BUN_BANNER = /^bun test v\d[^\s(]*(?: \([0-9a-f]+\))?$/;
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
const BUN_SUMMARY = /^(?:\d+ (?:pass|fail|skip|todo|errors?)|\d+ expect\(\) calls|Ran \d+ tests? across .*)$/;
/** tsc's tally; it carries no diagnostic identity. */
const TSC_SUMMARY = /^Found \d+ errors?(?: in \d+ files?)?\.$/;
const SEPARATOR = /^-{3,}$/;
/** An absolute path; its prefix is a run root, never part of the failure. */
const ABSOLUTE_PATH = /(?<![\w:/])\/(?:[^\s:'"()/]+\/)+[^\s:'"()/]+/g;

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
  let normalised = line;
  for (const root of [...roots].sort((a, b) => b.length - a.length)) {
    const prefix = root.replace(/\/+$/, "");
    if (!prefix) continue;
    const pattern = new RegExp(`(?<![\\w:/])${escapeRegExp(prefix)}(?=/|$)`, "g");
    normalised = normalised.replace(pattern, rootToken);
  }
  return normalised
    .replace(ABSOLUTE_PATH, (match) => `<root>/${match.slice(match.lastIndexOf("/") + 1)}`)
    .replaceAll(rootToken, "<root>");
}

/** What a gate producer knows about its own run but the signature reader cannot. */
interface GateCheckMeta {
  /** Absolute directories the gate ran from; their prefixes are not identity. */
  roots: string[];
  /** The output is the tail of a longer report; its head is gone. */
  truncated: boolean;
}

function gateCheckMeta(check: CheckResult): GateCheckMeta {
  const details = check.details;
  if (typeof details !== "object" || details === null) return { roots: [], truncated: false };
  const meta = details as { roots?: unknown; truncated?: unknown };
  return {
    roots: Array.isArray(meta.roots) ? meta.roots.filter((root): root is string => typeof root === "string") : [],
    truncated: meta.truncated === true,
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
 */
export function capGateOutput(text: string): CappedGateOutput {
  const trimmed = text.trim();
  if (trimmed.length <= GATE_OUTPUT_CAP) return { output: trimmed, truncated: false };
  const boundary = trimmed.indexOf("\n", trimmed.length - GATE_OUTPUT_CAP);
  // A single line longer than the cap has no complete line left to keep.
  return boundary === -1
    ? { output: "", truncated: true }
    : { output: trimmed.slice(boundary + 1), truncated: true };
}

/** A check that could not run; the baseline never records one as red. */
export interface GateInfra {
  kind: "infra";
  cause: string;
}

export function isInfraCheck(check: CheckResult): boolean {
  const details = check.details;
  return typeof details === "object" && details !== null && (details as { kind?: unknown }).kind === "infra";
}

/**
 * Failure identities of one gate run: tsc diagnostics collapse to
 * `file:line code`, bun failures to `file > test`, bun's file-level load errors
 * to `file > error`, and any other output line outside a reporter block is
 * kept as `line: ...` after its run root is normalised. A red gate is inherited
 * only for the signatures it was red for, so a new failure under the same gate
 * still counts.
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
  const { roots, truncated } = gateCheckMeta(check);
  const lines = check.output.split("\n").map((line) => normaliseRoots(line.replace(ANSI, "").trim(), roots));
  const signatures = new Set<string>();
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
    if (BUN_BANNER.test(line)) continue;
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
      if (headErrorBlock && line.startsWith("error:")) signatures.add(`test: ${line}`);
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
 * Branch checks and merged-result gates share ports, caches and build dirs;
 * kernel-0 has no parallel-safe declaration, so gate runs are serial per repo.
 */
const gateRuns = new KeyedMutex();

/**
 * Runs the repo-config gates in `cwd`. Gates are commands, not the v2 check
 * pipeline: kernel-0 only needs a red/green signal and the output a fix turn
 * must read.
 */
export async function runGates(runtime: KernelRuntime, cwd: string): Promise<CheckResult[]> {
  return gateRuns.runExclusive(runtime.paths.repoRoot, () => runGatesUnlocked(runtime, cwd));
}

async function runGatesUnlocked(runtime: KernelRuntime, cwd: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const gate of runtime.configs.repo.gates) {
    const res = await runProcess({
      cmd: gate.command,
      cwd,
      timeoutSec: GATE_TIMEOUT_SEC,
      maxOutputBytes: GATE_OUTPUT_CAP * 4,
    });
    const ok = !res.timedOut && res.code === 0;
    const capped = capGateOutput(`${res.stdout}\n${res.stderr}`);
    results.push({
      name: gate.id,
      ok,
      summary: ok ? "pass" : res.timedOut ? `timed out after ${GATE_TIMEOUT_SEC}s` : `exit ${res.code}`,
      output: capped.output,
      fingerprint: fingerprintText(`${gate.id}:${capped.output}`, { lowercase: false }),
      details: { roots: [cwd], truncated: capped.truncated },
    });
  }
  return results;
}

export function failingChecks(checks: readonly CheckResult[]): CheckResult[] {
  return checks.filter((c) => !c.ok);
}

/** Compact red-gate text for an implementer's next turn; empty when green. */
export function formatFailingChecks(checks: readonly CheckResult[] | undefined): string {
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
  preexisting: ReadonlySet<string>
): CheckResult[] {
  return failingChecks(checks).filter((check) => {
    const signatures = gateSignatures(check);
    // A silent red gate offers only its name, exactly as before signature
    // matching: there is no evidence that this run's failure is a new one.
    if (signatures.size === 0) {
      return !preexisting.has(gateSignatureKey(check.name, UNIDENTIFIED_GATE_FAILURE));
    }
    for (const signature of signatures) {
      if (!preexisting.has(gateSignatureKey(check.name, signature))) return true;
    }
    return false;
  });
}
