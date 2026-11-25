import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../core/checks/findings.js";
import type { CheckAttribution, CheckResult } from "../core/checks/types.js";
import { fingerprintText } from "../core/fingerprint.js";
import { KeyedMutex } from "../core/mutex.js";
import { type ProcessResult, runProcess } from "../core/proc.js";
import type { CappedGateOutput, DeclaredGateRun } from "./gates-types.js";
import { trackGateGroup } from "./gate-processes.js";
import {
  capGateOutput,
  gateReportPaths,
  GATE_OUTPUT_CAP,
  isAdvisoryCheck,
  isInfraCheck,
  normaliseFindings,
  readGateReports,
} from "./gates-normalise.js";
import {
  gateFailureIdentities,
  gateSignatureKey,
  gateSignatures,
  UNIDENTIFIED_GATE_FAILURE,
} from "./gates-signatures.js";
import { resolveGates } from "./infra.js";
import type { GateConfig, KernelRuntime } from "./types.js";

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
export type { GateInfra } from "./gates-types.js";
export {
  capGateOutput,
  GATE_OUTPUT_CAP,
  isAdvisoryCheck,
  isInfraCheck,
  isStaleGateCheck,
} from "./gates-normalise.js";
export {
  gateFailureIdentities,
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

/** A finding's stable display label: its file, then its rule or message. */
function findingLabel(finding: Finding): string {
  const name = finding.rule ?? finding.message;
  return finding.file ? `${finding.file} > ${name}` : name;
}

/** A red test report's summary names what failed; other gates keep exit code. */
function reportSummary(findings: readonly Finding[]): string {
  const failing = findings.filter((finding) => finding.severity === "error");
  const shown = failing
    .slice(0, SUMMARY_CASES)
    .map((finding) => findingLabel(finding).slice(0, SUMMARY_NAME_CHARS));
  const rest = failing.length - shown.length;
  return `${failing.length} failing: ${shown.join(", ")}${rest > 0 ? `, +${rest} more` : ""}`;
}

/** A gate is green only when the command and its test report agree. */
function gatePassed(
  res: ProcessResult,
  findings: readonly Finding[],
  reportError: string | undefined,
  testReport: boolean,
): boolean {
  if (res.timedOut || res.code !== 0 || reportError !== undefined) return false;
  if (!testReport) return true;
  return !findings.some((finding) => finding.severity === "error");
}

/** The one line a fix turn reads: why the gate is red, or `pass`. */
function gateSummary(
  gate: GateConfig,
  res: ProcessResult,
  findings: readonly Finding[],
  reportError: string | undefined,
  ok: boolean,
  testReport: boolean,
): string {
  if (ok) return "pass";
  if (res.timedOut) return `timed out after ${gateTimeoutSec(gate)}s`;
  if (res.code === 126 || res.code === 127) return `exit ${res.code}`;
  if (reportError) return reportError;
  if (testReport && findings.some((finding) => finding.severity === "error"))
    return reportSummary(findings);
  return `exit ${res.code}`;
}

/** What the record keeps of one gate run: roots, capped output and findings. */
function gateDetails(
  gate: GateConfig,
  cwd: string,
  capped: CappedGateOutput,
  findings: readonly Finding[],
  reportError: string | undefined,
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
  if (findings.length > 0) details.findings = findings;
  if (reportError) details.error = reportError;
  return details;
}

/**
 * Runs one gate as declared and records what it produced. A declared report is
 * written to its worktree-relative path — `junit` is also exported as
 * `FACTORY_JUNIT_PATH` for runners that honour it — and read once into the one
 * findings model; a gate with no report falls back to its log and exit code.
 * Both `runGates` and the baseline use this, so a gate executes and is recorded
 * identically on base and in a task worktree. `repoRoot` names the repository
 * whose worktrees share the gate's `serial` mutexes; it defaults to `cwd` for
 * a caller running one tree in isolation.
 */
export async function runDeclaredGate(
  cwd: string,
  gate: GateConfig,
  repoRoot = cwd,
): Promise<DeclaredGateRun> {
  const paths = gateReportPaths(gate, cwd);
  for (const file of Object.values(paths)) {
    if (file) fs.rmSync(file, { force: true });
  }
  const res = await runGateCommand(
    cwd,
    gate,
    gate.command,
    repoRoot,
    paths.junit ? { FACTORY_JUNIT_PATH: paths.junit } : undefined,
  );

  const reports = readGateReports(cwd, gate);
  const capped = capGateOutput(`${res.stdout}\n${res.stderr}`, [cwd]);
  let findings: Finding[] = [];
  let reportError = reports.error;
  if (!reportError) {
    try {
      findings = await normaliseFindings(gate, {
        ...reports.contents,
        exitCode: res.code,
        log: capped.output,
      });
    } catch (error) {
      reportError = error instanceof Error ? error.message : String(error);
    }
  }
  const ok = gatePassed(res, findings, reportError, reports.testReport);
  return {
    res,
    check: {
      name: gate.id,
      ok,
      summary: gateSummary(
        gate,
        res,
        findings,
        reportError,
        ok,
        reports.testReport,
      ),
      output: capped.output,
      fingerprint: fingerprintText(
        `${gate.id}:${
          findings.length > 0
            ? findings
                .map((finding) => finding.fingerprint)
                .sort()
                .join(",")
            : capped.output
        }`,
        { lowercase: false },
      ),
      ...(gate.advisory && !ok ? { advisory: true } : {}),
      details: gateDetails(gate, cwd, capped, findings, reportError, res),
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

/** The reds that block: every failure except an advisory one. */
function blockingFailures(checks: readonly CheckResult[]): CheckResult[] {
  return failingChecks(checks).filter((c) => !isAdvisoryCheck(c));
}

/**
 * Marks every red of a task's run advisory. The task still records and shows
 * the output; no gate, fix round or merge charges it.
 */
export function advisoryChecks(checks: readonly CheckResult[]): CheckResult[] {
  return checks.map((check) =>
    check.ok || isAdvisoryCheck(check) ? check : { ...check, advisory: true },
  );
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
    if (check.ok || isInfraCheck(check) || isAdvisoryCheck(check)) return check;
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
  return blockingFailures(checks ?? []).filter(
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
    .map(
      (c) =>
        `### ${c.name}${isAdvisoryCheck(c) ? " (advisory)" : ""}: ${c.summary}\n${c.output}`,
    )
    .join("\n\n");
}

/**
 * Failing gates that are the task's own: an inherited failure is dropped only
 * when every identity it fails for is already in the base's pre-existing set
 * (KERNEL0 §6); one new identity under the same gate name still forces a fix
 * round and blocks the merge. The identity is the finding model's fingerprint
 * when the run named report failures, else the output-line signature.
 */
export function newGateFailures(
  checks: readonly CheckResult[],
  preexisting: ReadonlySet<string>,
): CheckResult[] {
  return blockingFailures(checks).filter((check) => {
    const identities = gateFailureIdentities(check);
    // A silent red gate offers only its name, exactly as before signature
    // matching: there is no evidence that this run's failure is a new one.
    if (identities.size === 0) {
      return !preexisting.has(
        gateSignatureKey(check.name, UNIDENTIFIED_GATE_FAILURE),
      );
    }
    for (const identity of identities) {
      if (!preexisting.has(identity)) return true;
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
