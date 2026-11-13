import { runProcess } from "../core/proc.js";
import { fingerprintText } from "../core/fingerprint.js";
import { KeyedMutex } from "../core/mutex.js";
import type { CheckResult } from "../core/checks/types.js";
import type { KernelRuntime } from "./types.js";

const GATE_TIMEOUT_SEC = 900;
const OUTPUT_CAP = 4000;

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
