import type { CheckResult } from "../core/checks/types.js";
import { git } from "../core/git/exec.js";
import { newGateFailures } from "./gates.js";
import { committedSpikeReport, spikeReportRef } from "./spike-report.js";
import { makeCause } from "./cause.js";
import type {
  ArtifactStore,
  Cause,
  Concern,
  LaunchKind,
  Outcome,
  RecordEnd,
  RecordStart,
  StepRecord,
  TaskFile,
  WorkEdits,
} from "./types.js";

export function scriptMeta(
  iteration: number,
  step: string,
  opts: { slug?: string; round?: number; revision?: number } = {},
): RecordStart {
  return {
    iteration,
    step,
    round: opts.round ?? 1,
    actor: "script",
    ...(opts.slug ? { slug: opts.slug } : {}),
    ...(opts.revision !== undefined ? { revision: opts.revision } : {}),
  };
}

/** Opens a checks record before the gate run; `finishChecks` closes it after. */
export async function startChecks(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  opts: { step?: string } = {},
) {
  return store.startRecord(
    scriptMeta(meta.iteration, opts.step ?? "checks", meta),
  );
}

/**
 * Closes a record opened by `startChecks` with the gate results and wall time.
 * `tree` stamps the gated tree so the flake re-run keys once per tree.
 */
export async function finishChecks(
  turn: {
    meta: { startedAt: string };
    finish(end: RecordEnd): Promise<StepRecord>;
  },
  checks: CheckResult[],
  opts: { preexisting?: ReadonlySet<string>; tree?: string } = {},
): Promise<StepRecord> {
  const started = Date.parse(turn.meta.startedAt);
  const wallMs = Number.isFinite(started)
    ? Math.max(0, Date.now() - started)
    : 0;
  return turn.finish({
    ok: newGateFailures(checks, opts.preexisting ?? new Set()).length === 0,
    checks,
    testRuns: checks.length,
    wallMs,
    ...(opts.tree !== undefined ? { tree: opts.tree } : {}),
  });
}

/** One gate that went red, then green on the same tree: its red-run failures. */
export interface GateFlake {
  gate: string;
  tests: string[];
}

/**
 * A gate that proved itself flaky: red, then green on the same tree. The cause
 * names each gate with its red-run failing tests; the red checks stay on the
 * record so the flake's own fix has the output the green checks record drops.
 */
export async function appendGateFlake(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  flake: { tree?: string; flakes: GateFlake[]; checks: CheckResult[] },
): Promise<void> {
  const cause = flake.flakes
    .map((entry) => `${entry.gate}: ${entry.tests.join(", ")}`)
    .join("; ");
  await store.appendRecord(scriptMeta(meta.iteration, "gate-flake", meta), {
    ok: true,
    cause: makeCause("gate-flake", cause),
    checks: flake.checks,
    ...(flake.tree !== undefined ? { tree: flake.tree } : {}),
  });
}

/** Files and lines one commit changed, parsed from `git show --numstat`. */
export async function commitEdits(
  cwd: string,
  commit: string | null,
): Promise<WorkEdits> {
  if (!commit) return { files: 0, added: 0, removed: 0 };
  const shown = await git(cwd, ["show", "--numstat", "--format=", commit], {
    allowFail: true,
  });
  if (shown.code !== 0) return { files: 0, added: 0, removed: 0 };
  let files = 0;
  let added = 0;
  let removed = 0;
  for (const line of shown.stdout.split("\n")) {
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (!match) continue;
    files += 1;
    if (match[1] !== "-") added += Number(match[1]);
    if (match[2] !== "-") removed += Number(match[2]);
  }
  return { files, added, removed };
}

/** The last-call reviewer concerns, recorded as debt once the item merges. */
export async function appendDebt(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  concerns: Concern[],
  fallback: string,
): Promise<void> {
  // Concerns already marked debt live on the review record; only the rest need
  // converting, or the summary would report the same debt twice.
  const unconverted = concerns.filter((c) => c.kind !== "debt");
  const debt: Concern[] =
    unconverted.length > 0
      ? unconverted.map((c) => ({
          kind: "debt",
          calibration: c.calibration,
          text: c.text,
          ...(c.evidence ? { evidence: c.evidence } : {}),
        }))
      : concerns.length === 0
        ? [{ kind: "debt", calibration: "architect", text: fallback }]
        : [];
  if (debt.length === 0) return;
  await store.appendRecord(scriptMeta(meta.iteration, "debt", meta), {
    ok: true,
    outcome: {
      status: "done",
      summary: "last-call review concerns recorded as debt",
      concerns: debt,
      forward: [],
    },
  });
}

/**
 * A park's launch kind from its kind: infra-like parks are glitches, review
 * rounds spent on change requests are change requests, everything else failed.
 * The kind is the closed vocabulary, so a detail quoting the verdict enum
 * (`approve | changes | reject`) never decides the launch kind.
 */
export function parkLaunchKind(cause: Cause): LaunchKind {
  if (cause.kind === "overflow" || cause.kind === "infra-repeat") {
    return "glitch";
  }
  if (cause.kind === "change-requests-exhausted") return "change-request";
  return "failure";
}

/**
 * A park records the task revision it ends: a later amend bumps the file's
 * revision, and derive then ignores the parks of the revisions it amended past.
 */
export async function appendPark(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number; revision: number },
  cause: Cause,
): Promise<void> {
  await store.appendRecord(
    scriptMeta(meta.iteration, "park", {
      slug: meta.slug,
      round: meta.round,
      revision: meta.revision,
    }),
    {
      ok: true,
      cause,
      launchKind: parkLaunchKind(cause),
    },
  );
}

export async function appendFinish(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  task: TaskFile,
  commit?: string,
): Promise<void> {
  // A spike's report has one copy: the one its commit carries. The record
  // references `<commit>:<report path>`; nothing is copied into the goal.
  const report =
    task.kind === "spike" && commit
      ? await spikeFinishReport(store.goalDir, task.slug, commit)
      : undefined;
  await store.appendRecord(scriptMeta(meta.iteration, "finish", meta), {
    ok: true,
    commit,
    ...(report ? { report } : {}),
  });
}

/** The finish record's report reference, once the commit is known to carry it. */
async function spikeFinishReport(
  repoDir: string,
  slug: string,
  commit: string,
): Promise<string | undefined> {
  const ref = spikeReportRef(commit, slug);
  return (await committedSpikeReport(repoDir, ref)) === null ? undefined : ref;
}

/** A task an explicit leave decision cancels; the slug stays spent. */
export async function appendCancel(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  cause: Cause,
): Promise<void> {
  await store.appendRecord(scriptMeta(meta.iteration, "cancel", meta), {
    ok: true,
    cause,
  });
}

/** A fix turn's dispositions: its summary plus one numbered line per reply. */
export function formatFixDispositions(outcome: Outcome): string {
  const lines: string[] = [];
  const summary = outcome.summary.trim();
  if (summary) lines.push(summary);
  for (const entry of outcome.replies ?? [])
    lines.push(`- finding ${entry.finding}: ${entry.reply.trim()}`);
  return lines.join("\n");
}

/** Review findings for prompts: summary first, then concerns and forward lines. */
export function formatReviewFindings(outcome: Outcome): string {
  const lines: string[] = [];
  const summary = outcome.summary.trim();
  if (summary) lines.push(summary);
  for (const c of outcome.concerns)
    lines.push(
      `- [${c.kind}/${c.calibration}] ${c.text}${c.evidence ? ` (${c.evidence})` : ""}`,
    );
  lines.push(...outcome.forward.map((f) => `- forward: ${f}`));
  return lines.join("\n");
}
