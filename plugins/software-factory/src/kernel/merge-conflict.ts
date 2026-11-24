import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { commitAll, isAncestor } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { hasConflictMarkers, unmergedFiles } from "../core/git/merge.js";
import { porcelainStatus } from "../core/git/status.js";
import { formatBaseGates, recordedBaseGates } from "./baseline.js";
import { gateCommandsText } from "./infra.js";
import { commitEdits, scriptMeta } from "./record.js";
import type { KernelRuntime, RecordEnd, StepRecord } from "./types.js";
import { headSha, integrationHead, mergeRef, treeSha } from "./worktree.js";

/**
 * The one resolve ask for a task branch that conflicts with the integration
 * head. The continuation first turn carries it when a `base:` merge conflicts,
 * so a reword stays one edit.
 */
export function mergeConflictAsk(head: string, paths: string[]): string {
  const named = paths.join(", ") || "git reported no unmerged paths";
  return [
    `The integration head ${head.slice(0, 10)} conflicts with this task branch.`,
    `Conflicted files: ${named}.`,
    "Resolve the conflict in the worktree, keeping both sides' intent. Do not rebase, do not switch branches; the script commits the merge.",
  ].join("\n");
}
export async function mergeHeadSha(cwd: string): Promise<string | null> {
  const res = await git(
    cwd,
    ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
    {
      allowFail: true,
    },
  );
  if (res.code !== 0) return null;
  const sha = res.stdout.trim();
  return sha ? sha : null;
}

/** Aborts a merge left in flight; no-op when there is none. */
export async function abortMerge(cwd: string): Promise<void> {
  await git(cwd, ["merge", "--abort"], { allowFail: true });
}

/**
 * The steward prompt's variables for the merge it resolves. Shared by the
 * wave-end steward and the flow's resolve step so one conflict ask serves both.
 */
export function resolveVars(
  runtime: KernelRuntime,
  worktree: string,
  branch: string,
  head: string,
  conflicts: string[],
  records: StepRecord[],
  gateLogPath?: string,
): Record<string, string> {
  const base = recordedBaseGates(records);
  return {
    worktree,
    branch,
    integration_head: head,
    conflicts: conflicts.join(", ") || "none",
    gate_log_path: gateLogPath ?? "none",
    gate_commands: gateCommandsText(
      runtime.store.goalDir,
      runtime.configs.repo.gates,
    ),
    base_gates: formatBaseGates(base),
  };
}

/**
 * Commits the merge the resolve turn settled in the worktree. A file still
 * carrying conflict markers is not settled: the empty end leaves the worktree
 * for the caller's unresolved path to abort.
 */
export async function settleMergeTurn(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  cwd: string,
  message: string,
): Promise<RecordEnd> {
  await git(cwd, ["add", "-A"]);
  const flagged = await hasConflictMarkers(cwd);
  if (flagged.length > 0) return {};
  const turn = await runtime.store.startRecord(
    scriptMeta(meta.iteration, "commit", meta),
  );
  const started = Date.parse(turn.meta.startedAt);
  const committed = await commitAll(runtime.repo, cwd, message);
  const head = await headSha(cwd);
  const tree = await treeSha(cwd);
  const edits = await commitEdits(cwd, committed);
  const wallMs = Number.isFinite(started)
    ? Math.max(0, Date.now() - started)
    : 0;
  await turn.finish({
    ok: true,
    commit: committed ?? head,
    tree,
    edits,
    wallMs,
  });
  return { commit: committed ?? head, tree, edits };
}

/**
 * What the resolve turn must not touch beyond its conflict set. `touched` is
 * every path the in-progress merge changed; `baseline` hashes the cleanly
 * merged half so the turn's edits of them are distinguishable from the merge's
 * own content after the merge commit hides the worktree diff.
 */
export interface ConflictSnapshot {
  baseHead: string;
  touched: readonly string[];
  baseline: ReadonlyMap<string, string>;
}

function fileHash(file: string): string {
  try {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

/** Snapshots the conflicted worktree before the resolve turn runs. */
export async function snapshotConflictMerge(
  cwd: string,
  conflicts: readonly string[],
): Promise<ConflictSnapshot> {
  const baseHead = await headSha(cwd);
  const touched = new Set<string>(conflicts);
  for (const entry of await porcelainStatus(cwd)) {
    touched.add(entry.path);
    if (entry.from) touched.add(entry.from);
  }
  const conflictSet = new Set(conflicts);
  const baseline = new Map<string, string>();
  for (const rel of touched) {
    if (conflictSet.has(rel)) continue;
    baseline.set(rel, fileHash(path.join(cwd, rel)));
  }
  return { baseHead, touched: [...touched].sort(), baseline };
}

/**
 * Tracked paths the resolve turn changed outside its conflict set: a path the
 * merge did not touch at all, or a cleanly merged path whose content no longer
 * matches the snapshot. Both are un-reviewed work and must return to review.
 */
export async function outsideConflictChanges(
  cwd: string,
  snapshot: ConflictSnapshot,
  conflicts: readonly string[],
  commit: string,
): Promise<string[]> {
  const conflictSet = new Set(conflicts);
  const touched = new Set(snapshot.touched);
  const outside = new Set<string>();
  const diff = await git(cwd, [
    "diff",
    "--name-only",
    snapshot.baseHead,
    commit,
  ]);
  for (const rel of diff.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    if (!conflictSet.has(rel) && !touched.has(rel)) outside.add(rel);
  }
  for (const [rel, before] of snapshot.baseline) {
    if (fileHash(path.join(cwd, rel)) !== before) outside.add(rel);
  }
  return [...outside].sort();
}

export type ResolvePreparation =
  | {
      kind: "conflict";
      head: string;
      conflicts: string[];
      snapshot: ConflictSnapshot;
    }
  | { kind: "clean" }
  | { kind: "error"; cause: string };

interface PendingMerge {
  kind: "pending";
  head: string;
  conflicts: string[];
}

async function unmergedOrDiff(cwd: string, ref: string): Promise<string[]> {
  const conflicts = await unmergedFiles(cwd);
  if (conflicts.length > 0) return conflicts;
  const diff = await git(cwd, ["diff", "--name-only", "HEAD", ref], {
    allowFail: true,
  });
  return diff.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

async function mergeFreshHead(
  runtime: KernelRuntime,
  cwd: string,
): Promise<PendingMerge | ResolvePreparation> {
  const status = await git(cwd, ["status", "--porcelain"], {
    allowFail: true,
  });
  if (status.code !== 0 || status.stdout.trim() !== "") {
    return {
      kind: "error",
      cause:
        "the task worktree has uncommitted changes; a resolve turn needs a clean branch",
    };
  }
  const head = await integrationHead(runtime);
  const attempt = await mergeRef(cwd, head, runtime.repo.identityEnv(), {
    leaveConflict: true,
  });
  if (attempt.ok) return { kind: "clean" };
  return { kind: "pending", head, conflicts: attempt.paths };
}

/**
 * Puts the task branch into the merge the resolve turn settles: a creation
 * merge already in flight is kept, a crashed turn's MERGE_HEAD resumes its
 * partial work, and a clean tree merges the current integration head with the
 * conflict left in place. A head that merges cleanly needs no turn.
 */
export async function prepareResolve(
  runtime: KernelRuntime,
  cwd: string,
  creation: { head: string; paths: string[] } | undefined,
): Promise<ResolvePreparation> {
  let pending: PendingMerge;
  if (creation) {
    pending = {
      kind: "pending",
      head: creation.head,
      conflicts:
        creation.paths.length > 0 ? creation.paths : await unmergedFiles(cwd),
    };
  } else {
    const inFlight = await mergeHeadSha(cwd);
    if (inFlight) {
      pending = {
        kind: "pending",
        head: inFlight,
        conflicts: await unmergedOrDiff(cwd, inFlight),
      };
    } else {
      const fresh = await mergeFreshHead(runtime, cwd);
      if (fresh.kind !== "pending") return fresh;
      pending = fresh;
    }
  }
  return {
    kind: "conflict",
    head: pending.head,
    conflicts: pending.conflicts,
    snapshot: await snapshotConflictMerge(cwd, pending.conflicts),
  };
}

/**
 * Why the resolve turn did not settle the merge, or null when it did. A
 * committed merge always has the integration head in its ancestry and no
 * MERGE_HEAD; markers left staged never reach the settle's commit.
 */
export async function unresolvedResolve(
  cwd: string,
  head: string,
  conflicts: readonly string[],
): Promise<string | null> {
  const flagged = await hasConflictMarkers(cwd);
  const inFlight = await mergeHeadSha(cwd);
  let merged = true;
  try {
    merged = await isAncestor(cwd, head, await headSha(cwd));
  } catch {
    merged = false;
  }
  if (flagged.length === 0 && !inFlight && merged) return null;
  const files = flagged.length > 0 ? flagged : [...conflicts];
  const named = files.join(", ") || "git reported no unmerged paths";
  if (flagged.length > 0) return `${named} still carry conflict markers`;
  if (inFlight) return `${named}: the merge is still in progress`;
  return `${named}: the integration head was not merged`;
}
