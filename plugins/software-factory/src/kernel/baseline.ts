import fs from "node:fs";
import path from "node:path";
import { runProcess } from "../core/proc.js";
import { runWorktreeSetup } from "../core/checks/setup.js";
import { fingerprintText } from "../core/fingerprint.js";
import { git } from "../core/git/exec.js";
import type { CheckResult } from "../core/checks/types.js";
import { resolveGoalPaths } from "./config.js";
import type { ArtifactStore, ConfigBundle, RecordStart, StepRecord } from "./types.js";

const GATE_TIMEOUT_SEC = 900;
const OUTPUT_CAP = 4_000;

export interface BaselineResult {
  commit: string;
  ok: boolean;
  checks: CheckResult[];
  /** False when an identical base commit was already checked (reported once). */
  fresh: boolean;
}

/** The last recorded base-gate run; absent before pre-flight has checked a base. */
export interface BaseGateState {
  commit: string;
  ok: boolean;
  checks: CheckResult[];
}

/**
 * Pre-flight records one base run per commit. Everything that judges a task's
 * gates reads this: a failure already red on the base is not the task's.
 */
export function recordedBaseGates(records: StepRecord[]): BaseGateState | undefined {
  const latest = records
    .filter((r) => r.step === "baseline" && r.actor === "script" && r.endedAt && r.base && r.checks)
    .sort((a, b) => b.seq - a.seq)[0];
  if (!latest?.base || !latest.checks) return undefined;
  return { commit: latest.base, ok: latest.ok !== false, checks: latest.checks };
}

export function preexistingRed(base: BaseGateState | undefined): Set<string> {
  return new Set((base?.checks ?? []).filter((c) => !c.ok).map((c) => c.name));
}

function result(name: string, ok: boolean, summary: string, output = ""): CheckResult {
  return {
    name,
    ok,
    summary,
    output: output.slice(-OUTPUT_CAP),
    fingerprint: fingerprintText(`${name}:${ok}:${summary}`, { lowercase: false }),
  };
}

function baselineRecord(records: StepRecord[], commit: string): StepRecord | undefined {
  return records
    .filter((r) => r.step === "baseline" && r.actor === "script" && r.base === commit && r.endedAt)
    .sort((a, b) => b.seq - a.seq)[0];
}

/**
 * The scratch worktree lives under the run's runtime dir, which pre-flight
 * holds outside the repository. A gate that sweeps the ambient tmp prefix
 * (`os.tmpdir()/preflight-probe-*` — this package's own suite does) must not be
 * able to delete the worktree it runs in. The goal only shapes goalDir; the
 * worktree root is goal-independent.
 */
function scratchPath(configs: ConfigBundle, repoRoot: string): string {
  const worktreeRoot = resolveGoalPaths(configs, repoRoot, "preflight").worktreeRoot;
  const runtimeDir = path.join(worktreeRoot, ".factory-runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(runtimeDir, "preflight-probe-"));
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

async function runBaseGates(configs: ConfigBundle, repoRoot: string, commit: string): Promise<CheckResult[]> {
  if (configs.repo.gates.length === 0 && configs.repo.setup.length === 0) return [];
  const dir = scratchPath(configs, repoRoot);
  const root = path.resolve(repoRoot);
  try {
    const added = await git(root, ["worktree", "add", "--detach", dir, commit], { allowFail: true });
    if (added.code !== 0) {
      return [result("baseline", false, `could not create baseline worktree: ${added.stderr.trim()}`)];
    }
    const setup = await runWorktreeSetup({ commands: configs.repo.setup, cwd: dir });
    if (!setup.ok) {
      return [result("setup", false, setup.error ?? "setup failed")];
    }
    const checks: CheckResult[] = [];
    for (const gate of configs.repo.gates) {
      const res = await runProcess({
        cmd: gate.command,
        cwd: dir,
        timeoutSec: GATE_TIMEOUT_SEC,
        maxOutputBytes: OUTPUT_CAP * 4,
      });
      const ok = !res.timedOut && res.code === 0;
      checks.push(
        result(
          gate.id,
          ok,
          res.timedOut ? `timed out after ${GATE_TIMEOUT_SEC}s` : `exit ${res.code}`,
          `${res.stdout}\n${res.stderr}`.trim()
        )
      );
    }
    return checks;
  } finally {
    await git(root, ["worktree", "remove", "--force", dir], { allowFail: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Runs the repo's setup + gates once on the base branch in a scratch worktree.
 * A red base is recorded and warned about, never fatal; an existing record for
 * the same commit means the result was already reported and is reused.
 */
export async function checkBase(
  configs: ConfigBundle,
  store: ArtifactStore,
  repoRoot: string,
  baseBranch: string,
  commit: string
): Promise<BaselineResult> {
  const existing = baselineRecord(await store.listRecords(), commit);
  if (existing) return { commit, ok: existing.ok !== false, checks: existing.checks ?? [], fresh: false };

  const checks = await runBaseGates(configs, repoRoot, commit);
  const ok = checks.every((c) => c.ok);
  const meta: RecordStart = { iteration: 0, step: "baseline", round: 1, actor: "script", base: commit };
  await store.appendRecord(meta, { ok, checks });

  if (!ok) {
    const red = checks.filter((c) => !c.ok);
    console.warn(
      [
        `[factory] base "${baseBranch}" at ${commit.slice(0, 8)} is red; recorded once, continuing.`,
        ...red.map((c) => `  ${c.name}: ${c.summary}`),
      ].join("\n")
    );
  }
  return { commit, ok, checks, fresh: true };
}

export async function resolveBaseCommit(repoRoot: string, baseBranch: string): Promise<string | undefined> {
  const res = await git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${baseBranch}`], {
    allowFail: true,
  });
  return res.code === 0 ? res.stdout.trim() : undefined;
}
