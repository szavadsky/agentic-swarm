import fs from "node:fs";
import path from "node:path";
import { runWorktreeSetup } from "../core/checks/setup.js";
import type { CheckResult } from "../core/checks/types.js";
import { fingerprintText } from "../core/fingerprint.js";
import { isAncestor } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import type { ProcessResult } from "../core/proc.js";
import { resolveGoalPaths } from "./config.js";
import {
  capGateOutput,
  formatFailingChecks,
  type GateInfra,
  gateSignatureKey,
  gateSignatures,
  gateTimeoutSec,
  isInfraCheck,
  isStaleGateCheck,
  reapGateProcesses,
  runDeclaredGate,
  UNIDENTIFIED_GATE_FAILURE,
} from "./gates.js";
import type {
  ArtifactStore,
  ConfigBundle,
  GateConfig,
  RecordStart,
  StepRecord,
} from "./types.js";

/** Record step for a baseline that could not run: infra, never a red verdict. */
const BASELINE_INFRA_STEP = "baseline-infra";

export interface BaselineResult {
  commit: string;
  ok: boolean;
  checks: CheckResult[];
  /** False when an identical base commit was already checked (reported once). */
  fresh: boolean;
  /** The baseline could not run; it is journaled as infra, never red, and retried next launch. */
  infra?: boolean;
}

/** The last recorded base-gate run; absent before pre-flight has checked a base. */
export interface BaseGateState {
  commit: string;
  ok: boolean;
  checks: CheckResult[];
}

/**
 * Pre-flight records one base run per commit. Everything that judges a task's
 * gates reads this: a failure already red on the base is not the task's. An
 * infra run marks the baseline untrustworthy (`baseline-infra`) so an older
 * red record cannot be inherited into tasks that start from a newer head.
 */
export function recordedBaseGates(
  records: StepRecord[],
): BaseGateState | undefined {
  const latest = records
    .filter(
      (r) =>
        (r.step === "baseline" || r.step === BASELINE_INFRA_STEP) &&
        r.actor === "script" &&
        r.endedAt &&
        r.base,
    )
    .sort((a, b) => b.seq - a.seq)[0];
  if (!latest || latest.step !== "baseline" || !latest.base || !latest.checks)
    return undefined;
  return {
    commit: latest.base,
    ok: latest.ok !== false,
    checks: latest.checks,
  };
}

/** What a prompt says when pre-flight recorded no trustworthy base run. */
export const BASE_GATES_NOT_RECORDED = "not recorded";

/**
 * The base tree's recorded gate result for a prompt: the commit and colour,
 * with the failing checks when red. `not recorded` is distinct from green — an
 * absent record cannot support a "pre-existing" claim, so the reviewer needs
 * that state named rather than rendered as a clean base.
 */
export function formatBaseGates(base: BaseGateState | undefined): string {
  if (!base) return BASE_GATES_NOT_RECORDED;
  const commit = base.commit.slice(0, 10);
  if (base.ok) return `base ${commit}: green`;
  const failures = formatFailingChecks(base.checks);
  return failures
    ? `base ${commit} was red before any task (pre-existing):\n${failures}`
    : `base ${commit}: red`;
}

/**
 * Inherited red, one key per failing signature. A gate that was red on baseline
 * suppresses only the failures it already showed; a silent red gate offers only
 * its name. Infra checks were never a red verdict and contribute nothing, and
 * stale checks (recorded before run roots were stored) contribute nothing:
 * their basename-collapsed paths must never match a current run's below-root
 * tail.
 */
export function preexistingRed(base: BaseGateState | undefined): Set<string> {
  const inherited = new Set<string>();
  for (const check of base?.checks ?? []) {
    if (check.ok || isInfraCheck(check) || isStaleGateCheck(check)) continue;
    const signatures = gateSignatures(check);
    if (signatures.size === 0) {
      inherited.add(gateSignatureKey(check.name, UNIDENTIFIED_GATE_FAILURE));
      continue;
    }
    for (const signature of signatures) {
      inherited.add(gateSignatureKey(check.name, signature));
    }
  }
  return inherited;
}

/** A check that could not run; `checkBase` refuses to record it as red. */
function infra(name: string, cause: string, output = ""): CheckResult {
  const capped = capGateOutput(output);
  return {
    name,
    ok: false,
    summary: cause,
    output: capped.output,
    fingerprint: fingerprintText(`${name}:false:${cause}`, {
      lowercase: false,
    }),
    details: { kind: "infra", cause } satisfies GateInfra,
  };
}

function baselineRecord(
  records: StepRecord[],
  commit: string,
): StepRecord | undefined {
  return records
    .filter(
      (r) =>
        r.step === "baseline" &&
        r.actor === "script" &&
        r.base === commit &&
        r.endedAt,
    )
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
  const worktreeRoot = resolveGoalPaths(
    configs,
    repoRoot,
    "preflight",
  ).worktreeRoot;
  const runtimeDir = path.join(worktreeRoot, ".factory-runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(runtimeDir, "preflight-probe-"));
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

/** A gate's check; a timeout or unstartable command is infra, not a red tree. */
function gateCheck(
  gate: GateConfig,
  res: ProcessResult,
  check: CheckResult,
): CheckResult {
  if (res.timedOut) {
    return infra(
      gate.id,
      `timed out after ${gateTimeoutSec(gate)}s`,
      check.output,
    );
  }
  // 126/127 means the command itself could not start: an environment failure,
  // not a verdict on the tree under test.
  if (res.code === 126 || res.code === 127) {
    return infra(gate.id, `could not run: exit ${res.code}`, check.output);
  }
  return check;
}

async function runBaseGates(
  configs: ConfigBundle,
  repoRoot: string,
  commit: string,
  mergeFrom?: string,
): Promise<CheckResult[]> {
  if (configs.repo.gates.length === 0 && configs.repo.setup.length === 0)
    return [];
  const dir = scratchPath(configs, repoRoot);
  const root = path.resolve(repoRoot);
  try {
    const added = await git(
      root,
      ["worktree", "add", "--detach", dir, commit],
      { allowFail: true },
    );
    if (added.code !== 0) {
      return [
        infra(
          "baseline",
          `could not create baseline worktree: ${added.stderr.trim()}`,
        ),
      ];
    }
    if (mergeFrom) {
      // The followBase merge tasks start from, staged but never committed: the
      // gates must see the tree the integration head gets after base is merged
      // in, not the tree either side has on its own.
      const merge = await git(
        dir,
        ["merge", "--no-commit", "--no-ff", mergeFrom],
        { allowFail: true },
      );
      if (merge.code !== 0) {
        const reason = (merge.stderr || merge.stdout).trim();
        return [
          infra(
            "baseline",
            `the base follow would not merge: ${reason}`,
            reason,
          ),
        ];
      }
    }
    const setup = await runWorktreeSetup({
      commands: configs.repo.setup,
      cwd: dir,
    });
    if (!setup.ok) {
      return [infra("setup", setup.error ?? "setup failed")];
    }
    const checks: CheckResult[] = [];
    for (const gate of configs.repo.gates) {
      const { res, check } = await runDeclaredGate(repoRoot, dir, gate);
      checks.push(gateCheck(gate, res, check));
    }
    return checks;
  } finally {
    await reapGateProcesses(dir);
    await git(root, ["worktree", "remove", "--force", dir], {
      allowFail: true,
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Runs the repo's setup + gates once on the head tasks start from, in a scratch
 * worktree. Tasks branch from the integration head, not from the base branch,
 * and recovery follows base into that head before dispatching: a fast-forward
 * when the integration only lags, a merge when it has diverged. The divergent
 * case is gated with that merge staged, so base's own red is not blamed on the
 * first task. A red base is recorded and warned about, never fatal; an existing
 * record for the same state means the result was already reported and is
 * reused. A run that could not execute is infra: it is warned about and never
 * cached as base-red.
 */
/** The commit and branch the follow lands on, plus base when it must merge. */
interface BaseTarget {
  target: string;
  targetBranch: string;
  mergeFrom: string | undefined;
}

/** Resolves the integration head the follow produces from base and commit. */
async function baseTarget(
  repoRoot: string,
  baseBranch: string,
  commit: string,
  integrationBranch: string,
): Promise<BaseTarget> {
  const integrationCommit = await resolveBaseCommit(
    repoRoot,
    integrationBranch,
  );
  let target = commit;
  let targetBranch = baseBranch;
  // Set when the follow merges base into a divergent integration head: what
  // the follow produces depends on both refs, so gate their merge result.
  let mergeFrom: string | undefined;
  if (
    integrationCommit &&
    !(await isAncestor(repoRoot, integrationCommit, commit))
  ) {
    // The integration carries commits base lacks; the follow adds base to it,
    // by fast-forward when the integration only lags (target stays base's tip)
    // and by a merge otherwise.
    target = integrationCommit;
    targetBranch = integrationBranch;
    if (!(await isAncestor(repoRoot, commit, integrationCommit)))
      mergeFrom = commit;
  }
  return { target, targetBranch, mergeFrom };
}

/** The reusable baseline record for this target, or undefined when stale. */
async function reusableBaseline(
  store: ArtifactStore,
  target: string,
  mergeFrom: string | undefined,
): Promise<StepRecord | undefined> {
  // A merge preview is a function of base too, so a record keyed by the
  // integration commit alone may predate the base it was gated with. A record
  // from before run roots were stored is stale: reusing it would collapse its
  // basename-only paths into current runs, so it is re-gated instead.
  if (mergeFrom) return undefined;
  const found = baselineRecord(await store.listRecords(), target);
  return found && (found.checks ?? []).some(isStaleGateCheck)
    ? undefined
    : found;
}

/** Records a baseline that could not run as infra and warns, never red. */
async function recordInfraBase(
  store: ArtifactStore,
  target: string,
  described: string,
  checks: CheckResult[],
  infraChecks: CheckResult[],
): Promise<BaselineResult> {
  await store.appendRecord(
    {
      iteration: 0,
      step: BASELINE_INFRA_STEP,
      round: 1,
      actor: "script",
      base: target,
    },
    { ok: false, checks },
  );
  console.warn(
    [
      `[factory] ${described} could not be checked; not recorded as red, retried next launch.`,
      ...infraChecks.map((c) => `  ${c.name}: ${c.summary}`),
    ].join("\n"),
  );
  return { commit: target, ok: false, checks, fresh: true, infra: true };
}

/** Records a base-gate run and warns once when it is red. */
async function recordBaseResult(
  store: ArtifactStore,
  target: string,
  described: string,
  checks: CheckResult[],
): Promise<boolean> {
  const ok = checks.every((c) => c.ok);
  const meta: RecordStart = {
    iteration: 0,
    step: "baseline",
    round: 1,
    actor: "script",
    base: target,
  };
  await store.appendRecord(meta, { ok, checks });
  if (!ok) {
    const red = checks.filter((c) => !c.ok);
    console.warn(
      [
        `[factory] ${described} is red; recorded once, continuing.`,
        ...red.map((c) => `  ${c.name}: ${c.summary}`),
      ].join("\n"),
    );
  }
  return ok;
}

/**
 * Runs the repo's setup + gates once on the head tasks start from, in a scratch
 * worktree. Tasks branch from the integration head, not from the base branch,
 * and recovery follows base into that head before dispatching: a fast-forward
 * when the integration only lags, a merge when it has diverged. The divergent
 * case is gated with that merge staged, so base's own red is not blamed on the
 * first task. A red base is recorded and warned about, never fatal; an existing
 * record for the same state means the result was already reported and is
 * reused. A run that could not execute is infra: it is warned about and never
 * cached as base-red.
 */
export async function checkBase(
  configs: ConfigBundle,
  store: ArtifactStore,
  repoRoot: string,
  baseBranch: string,
  commit: string,
): Promise<BaselineResult> {
  // Same naming as resolveGoalPaths: the goal's stable integration branch.
  const integrationBranch = `factory/${path.basename(store.goalDir)}`;
  const { target, targetBranch, mergeFrom } = await baseTarget(
    repoRoot,
    baseBranch,
    commit,
    integrationBranch,
  );
  const existing = await reusableBaseline(store, target, mergeFrom);
  if (existing)
    return {
      commit: target,
      ok: existing.ok !== false,
      checks: existing.checks ?? [],
      fresh: false,
    };

  const described = mergeFrom
    ? `base "${targetBranch}" at ${target.slice(0, 8)} with "${baseBranch}" merged`
    : `base "${targetBranch}" at ${target.slice(0, 8)}`;
  const checks = await runBaseGates(configs, repoRoot, target, mergeFrom);
  const infraChecks = checks.filter(isInfraCheck);
  if (infraChecks.length > 0)
    return await recordInfraBase(store, target, described, checks, infraChecks);
  const ok = await recordBaseResult(store, target, described, checks);
  return { commit: target, ok, checks, fresh: true };
}

export async function resolveBaseCommit(
  repoRoot: string,
  baseBranch: string,
): Promise<string | undefined> {
  const res = await git(
    repoRoot,
    ["rev-parse", "--verify", "--quiet", `refs/heads/${baseBranch}`],
    {
      allowFail: true,
    },
  );
  return res.code === 0 ? res.stdout.trim() : undefined;
}
