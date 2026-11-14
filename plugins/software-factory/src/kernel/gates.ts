import { runProcess } from "../core/proc.js";
import { fingerprintText } from "../core/fingerprint.js";
import { KeyedMutex } from "../core/mutex.js";
import type { CheckResult } from "../core/checks/types.js";
import type { KernelRuntime } from "./types.js";

const GATE_TIMEOUT_SEC = 900;
const OUTPUT_CAP = 4000;

const ANSI = /\u001b\[[0-9;]*m/g;
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
 * `file:line code`, bun failures to `file > test`, and a gate that prints
 * neither falls back to its output lines. A red gate is inherited only for the
 * signatures it was red for, so a new failure under the same gate still counts.
 */
export function gateSignatures(check: CheckResult): Set<string> {
  const lines = check.output.split("\n").map((line) => line.replace(ANSI, "").trim());
  const signatures = new Set<string>();
  let file = "";
  let structured = false;
  for (const line of lines) {
    if (!line) continue;
    const header = BUN_FILE.exec(line);
    if (header) {
      file = header[1]!;
      continue;
    }
    const tsc = TSC_PAREN.exec(line) ?? TSC_DASH.exec(line);
    if (tsc) {
      signatures.add(`${tsc[1]}:${tsc[2]} ${tsc[3]}`);
      structured = true;
      continue;
    }
    const global = TSC_GLOBAL.exec(line);
    if (global) {
      signatures.add(`tsc ${global[1]}: ${global[2]}`);
      structured = true;
      continue;
    }
    const fail = BUN_FAIL.exec(line);
    if (fail) {
      signatures.add(file ? `${file} > ${fail[1]}` : `test: ${fail[1]}`);
      structured = true;
    }
  }
  if (!structured) {
    for (const line of lines) if (line) signatures.add(`line: ${line}`);
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
      maxOutputBytes: OUTPUT_CAP * 4,
    });
    const ok = !res.timedOut && res.code === 0;
    const output = `${res.stdout}\n${res.stderr}`.trim().slice(-OUTPUT_CAP);
    results.push({
      name: gate.id,
      ok,
      summary: ok ? "pass" : res.timedOut ? `timed out after ${GATE_TIMEOUT_SEC}s` : `exit ${res.code}`,
      output,
      fingerprint: fingerprintText(`${gate.id}:${output}`, { lowercase: false }),
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
