import fs from "node:fs";
import path from "node:path";
import {
  capJunit,
  type ParsedJunit,
  parseJunit,
} from "../core/checks/junit.js";
import type { CheckAttribution, CheckResult } from "../core/checks/types.js";
import { fingerprintText } from "../core/fingerprint.js";
import { KeyedMutex } from "../core/mutex.js";
import { type ProcessResult, runProcess } from "../core/proc.js";
import { trackGateGroup } from "./gate-processes.js";
import {
  type CappedGateOutput,
  capGateOutput,
  caseLabel,
  GATE_OUTPUT_CAP,
  isInfraCheck,
} from "./gates-normalise.js";
import {
  gateSignatureKey,
  gateSignatures,
  UNIDENTIFIED_GATE_FAILURE,
} from "./gates-signatures.js";
import { resolveGates } from "./infra.js";
import type { GateConfig, GatePattern, KernelRuntime } from "./types.js";

export const GATE_TIMEOUT_SEC = 900;

/**
 * The wall one gate runs under: its declared `timeoutSec` when that is a
 * positive finite number, else the shared default. `runProcess` treats zero or
 * a negative wall as no timeout at all, so an invalid declaration must land on
 * the ceiling rather than disable it.
 */
export function gateTimeoutSec(gate: Pick<GateConfig, "timeoutSec">): number {
  const wall = gate.timeoutSec;
  return typeof wall === "number" && Number.isFinite(wall) && wall > 0
    ? wall
    : GATE_TIMEOUT_SEC;
}

export { reapGateProcesses } from "./gate-processes.js";
export {
  capGateOutput,
  GATE_OUTPUT_CAP,
  type GateInfra,
  isInfraCheck,
  isStaleGateCheck,
} from "./gates-normalise.js";
export {
  gateSignatureKey,
  gateSignatures,
  UNIDENTIFIED_GATE_FAILURE,
} from "./gates-signatures.js";

/**
 * Branch checks and merged-result gates share ports, caches and build dirs only
 * as far as a repo declares; a gate that names a mutex in `serial` holds it for
 * its own command, and a gate that names none never waits. Keyed by the repo
 * root and the declared name, so two worktrees of one repo naming the same
 * mutex wait for each other while gates of different repos and gates naming
 * none stay parallel.
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
 * command, so the rest of the run — and every other repo's run — proceeds.
 * Mutexes are scoped to `repoRoot`, so worktrees of one repo share them.
 */
function runGateCommand(
  cwd: string,
  gate: GateConfig,
  command: string,
  repoRoot: string,
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
      let release: (() => void) | undefined;
      const run = runProcess({
        cmd: command,
        cwd,
        env,
        timeoutSec: gateTimeoutSec(gate),
        maxOutputBytes: GATE_OUTPUT_CAP * 4,
        onSpawn: (pid) => {
          release = trackGateGroup(cwd, pid);
        },
      });
      return run.finally(() => release?.());
    }
    return gateMutexes.runExclusive(
      `${path.resolve(repoRoot)}\u0000${name}`,
      () => launch(index + 1),
    );
  };
  return launch(0);
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

/** The JUnit report a gate wrote, or why it is missing or unreadable. */
function readJunitReport(junitPath: string | undefined): {
  parsed?: ParsedJunit;
  error?: string;
} {
  if (!junitPath) return {};
  try {
    if (!fs.existsSync(junitPath))
      return { error: "JUnit report not generated" };
    return { parsed: parseJunit(fs.readFileSync(junitPath, "utf8")) };
  } catch (error) {
    return {
      error: `JUnit report unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    fs.rmSync(junitPath, { force: true });
  }
}

/** A gate is green only when the command, its report and every case agree. */
function gatePassed(
  res: ProcessResult,
  parsed: ParsedJunit | undefined,
  junitError: string | undefined,
): boolean {
  if (res.timedOut || res.code !== 0 || junitError !== undefined) return false;
  if (parsed?.suiteFailed) return false;
  if (parsed?.cases.some((c) => c.status === "fail")) return false;
  return !(parsed !== undefined && parsed.cases.length === 0);
}

/** The one line a fix turn reads: why the gate is red, or `pass`. */
function gateSummary(
  gate: GateConfig,
  res: ProcessResult,
  parsed: ParsedJunit | undefined,
  junitError: string | undefined,
  ok: boolean,
): string {
  if (ok) return "pass";
  if (res.timedOut) return `timed out after ${gateTimeoutSec(gate)}s`;
  if (res.code === 126 || res.code === 127) return `exit ${res.code}`;
  if (junitError) return junitError;
  if (parsed) return junitSummary(parsed, res.code);
  return `exit ${res.code}`;
}

/** What the record keeps of one gate run: roots, capped output and its report. */
function gateDetails(
  gate: GateConfig,
  cwd: string,
  capped: CappedGateOutput,
  parsed: ParsedJunit | undefined,
  junitError: string | undefined,
  res?: ProcessResult,
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    roots: [cwd],
    truncated: capped.truncated,
  };
  if (res?.timedOut) {
    details.kind = "infra";
    details.cause = `timed out after ${gateTimeoutSec(gate)}s`;
  } else if (res && (res.code === 126 || res.code === 127)) {
    details.kind = "infra";
    details.cause = `exit ${res.code}`;
  }
  if (gate.format?.pattern) details.pattern = gate.format.pattern;
  // The record keeps a capped report; the verdict above read every case.
  if (parsed) details.junit = capJunit(parsed);
  if (junitError) details.error = junitError;
  return details;
}

/**
 * Runs one gate as declared and records what it produced. A `format.junit`
 * gate writes its report to the declared worktree-relative path — the kernel
 * exports the absolute path as `FACTORY_JUNIT_PATH` for runners that honour it
 * and reads the same file for the case identities. A `format.pattern` gate's
 * runner is recorded so `gateSignatures` reads its printed failures. Both
 * `runGates` and the baseline use this, so a gate executes and is recorded
 * identically on base and in a task worktree. `repoRoot` names the repository
 * whose worktrees share the gate's `serial` mutexes; it defaults to `cwd` for
 * a caller running one tree in isolation.
 */
export async function runDeclaredGate(
  cwd: string,
  gate: GateConfig,
  repoRoot = cwd,
): Promise<DeclaredGateRun> {
  const junitPath = gate.format?.junit
    ? path.resolve(cwd, gate.format.junit)
    : undefined;
  if (junitPath) fs.rmSync(junitPath, { force: true });
  const res = await runGateCommand(
    cwd,
    gate,
    gate.command,
    repoRoot,
    junitPath ? { FACTORY_JUNIT_PATH: junitPath } : undefined,
  );

  const { parsed, error: junitError } = readJunitReport(junitPath);
  const capped = capGateOutput(`${res.stdout}\n${res.stderr}`, [cwd]);
  const ok = gatePassed(res, parsed, junitError);
  return {
    res,
    check: {
      name: gate.id,
      ok,
      summary: gateSummary(gate, res, parsed, junitError, ok),
      output: capped.output,
      fingerprint: fingerprintText(
        `${gate.id}:${junitIdentity(parsed) || capped.output}`,
        { lowercase: false },
      ),
      details: gateDetails(gate, cwd, capped, parsed, junitError, res),
    },
  };
}

/**
 * Runs the repo-config and discovered gates in `cwd`. Gates are commands, not
 * the v2 check pipeline: kernel-0 only needs a red/green signal and the output
 * a fix turn must read. `only` re-runs a subset after a red run. Runs in
 * different worktrees of one repo still wait on the mutexes a gate declares;
 * gates naming none run in parallel.
 */
export async function runGates(
  runtime: KernelRuntime,
  cwd: string,
  opts: { only?: ReadonlySet<string> } = {},
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const only = opts.only;
  const declared = resolveGates(
    runtime.store.goalDir,
    runtime.configs.repo.gates,
  );
  const gates =
    only === undefined
      ? declared
      : declared.filter((gate) => only.has(gate.id));
  for (const gate of gates) {
    const { check } = await runDeclaredGate(cwd, gate, runtime.paths.repoRoot);
    results.push(check);
  }
  return results;
}

export function failingChecks(checks: readonly CheckResult[]): CheckResult[] {
  return checks.filter((c) => !c.ok);
}

/**
 * Stamps each failing check with its owner, from the `preexisting` set the run
 * was judged by, so derive reads the attribution instead of looking the
 * baseline up again. Green checks and infra reds carry none: an infra gate
 * that could not start is not a red verdict on the tree.
 */
export function stampAttribution(
  checks: readonly CheckResult[],
  preexisting: ReadonlySet<string>,
): CheckResult[] {
  const own = new Set(newGateFailures(checks, preexisting));
  return checks.map((check) => {
    if (check.ok || isInfraCheck(check)) return check;
    const attribution: CheckAttribution = own.has(check) ? "new" : "inherited";
    return { ...check, attribution };
  });
}

/**
 * The failing checks a record charges the task: every red it holds except the
 * ones stamped `inherited` when it closed. A record written before the stamp
 * carries none, so its reds keep the reading they had then.
 */
export function attributedFailures(
  checks: readonly CheckResult[] | undefined,
): CheckResult[] {
  return failingChecks(checks ?? []).filter(
    (check) => check.attribution !== "inherited",
  );
}

/** Whether a record's checks carry the close-time attribution stamp. */
export function checksAttributed(
  checks: readonly CheckResult[] | undefined,
): boolean {
  return (checks ?? []).some((check) => check.attribution !== undefined);
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
 * The red a gate run charges its tree: the failures that are new against the
 * base's pre-existing set, minus infra stops — a gate that could not start is
 * no verdict on the tree.
 */
export function newRedChecks(
  checks: readonly CheckResult[],
  preexisting: ReadonlySet<string>,
): CheckResult[] {
  return newGateFailures(checks, preexisting).filter(
    (check) => !isInfraCheck(check),
  );
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
