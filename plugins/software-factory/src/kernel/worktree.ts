import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runWorktreeSetup, type SetupResult } from "../core/checks/setup.js";
import { isAncestor } from "../core/git/commit.js";
import { GitError, git } from "../core/git/exec.js";
import { parseWorktreeList } from "../core/git/status.js";
import { isPlanPath } from "./plan-file.js";
import { sealedRecordDirs } from "./store.js";
import { makeCause } from "./cause.js";
import type {
  Cause,
  DeclaredWrite,
  KernelRuntime,
  StepRecord,
  TaskFile,
} from "./types.js";

/** Task branches and worktrees are goal-scoped and disposable. */
export function taskBranchName(runtime: KernelRuntime, slug: string): string {
  // Not nested under the integration branch: refs/heads/factory/<goal> would
  // block refs/heads/factory/<goal>/<slug> as a file-vs-directory conflict.
  const goal = path.basename(runtime.paths.goalDir);
  return `factory-task/${goal}/${slug}`;
}

function taskWorktreePath(runtime: KernelRuntime, slug: string): string {
  const goal = path.basename(runtime.paths.goalDir);
  return path.join(goalWorktreeRoot(runtime), `${goal}-tasks`, slug);
}

/**
 * The directory holding this goal's checkouts and nothing else. It follows the
 * resolved checkout, so an existing checkout at the pre-repo-id path keeps its
 * task worktrees and merge scratch beside it.
 */
function goalWorktreeRoot(runtime: KernelRuntime): string {
  return path.dirname(runtime.paths.goalCheckout);
}

export async function integrationHead(runtime: KernelRuntime): Promise<string> {
  const res = await git(runtime.paths.repoRoot, [
    "rev-parse",
    runtime.paths.integrationBranch,
  ]);
  return res.stdout.trim();
}

export async function branchExists(
  runtime: KernelRuntime,
  branch: string,
): Promise<boolean> {
  const res = await git(
    runtime.paths.repoRoot,
    ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
    {
      allowFail: true,
    },
  );
  return res.code === 0;
}

/** Tree of HEAD, the no-progress component of a committed step. */
export async function treeSha(cwd: string): Promise<string> {
  const res = await git(cwd, ["rev-parse", "HEAD^{tree}"]);
  return res.stdout.trim();
}

async function registeredWorktrees(runtime: KernelRuntime): Promise<string[]> {
  const res = await git(runtime.paths.repoRoot, [
    "worktree",
    "list",
    "--porcelain",
  ]);
  return parseWorktreeList(res.stdout);
}

/** A base advance that cannot merge cleanly into the integration branch. */
export class BaseFollowConflictError extends Error {
  constructor(
    baseBranch: string,
    readonly paths: string[],
  ) {
    const named =
      paths.length > 0 ? paths.join(", ") : "git reported no unmerged paths";
    super(
      `base "${baseBranch}" conflicts with the integration branch in: ${named}; ` +
        "the integration branch was left untouched — resolve the conflict on base and relaunch",
    );
    this.name = "BaseFollowConflictError";
  }
}

/** Clears a merge left in flight before it can block the next one; true when there was one. */
async function abortInFlightMerge(cwd: string): Promise<boolean> {
  const mergeHead = await git(
    cwd,
    ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
    { allowFail: true },
  );
  if (mergeHead.code !== 0) return false;
  await git(cwd, ["merge", "--abort"]);
  return true;
}

export type MergeAttempt = { ok: true } | { ok: false; paths: string[] };

/**
 * Merges `ref` into the checkout at `cwd`. A conflict aborts the merge so no
 * state is left behind and returns the unmerged paths; any other refusal
 * (merge.ff=only, unrelated histories) leaves no merge state either, and git's
 * own reason is the only diagnosis, so it is thrown. With `leaveConflict` a
 * conflict stays in progress (MERGE_HEAD plus unmerged paths) for the caller's
 * turn to resolve; only a non-conflict refusal still throws.
 */
export async function mergeRef(
  cwd: string,
  ref: string,
  env: Record<string, string> | undefined,
  opts?: { leaveConflict?: boolean },
): Promise<MergeAttempt> {
  const merge = await git(cwd, ["merge", "--no-edit", ref], {
    allowFail: true,
    env,
  });
  if (merge.code === 0) return { ok: true };
  const unmerged = await git(cwd, ["diff", "--name-only", "--diff-filter=U"], {
    allowFail: true,
  });
  const paths = unmerged.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .sort();
  if (opts?.leaveConflict) {
    const head = await git(
      cwd,
      ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
      { allowFail: true },
    );
    if (head.code !== 0 && paths.length === 0) {
      throw new GitError(
        `merge --no-edit ${ref}`,
        merge.code,
        merge.stderr,
        merge.stdout,
      );
    }
    return { ok: false, paths };
  }
  const inFlight = await abortInFlightMerge(cwd);
  if (!inFlight && paths.length === 0) {
    throw new GitError(
      `merge --no-edit ${ref}`,
      merge.code,
      merge.stderr,
      merge.stdout,
    );
  }
  return { ok: false, paths };
}

/**
 * Restores the worktree at `cwd` to `commit`: any merge is aborted, tracked
 * files reset and untracked ones removed. The caller stops the timed-out
 * orphan first, so no live writer can land after the reset.
 */
export async function resetWorktreeToCommit(
  cwd: string,
  commit: string,
): Promise<void> {
  await abortInFlightMerge(cwd);
  await git(cwd, ["reset", "--hard", commit]);
  await git(cwd, ["clean", "-fd"]);
}

/**
 * Operator fixes on base never reach task worktrees unless the stable checkout
 * follows them. Fast-forward when the integration branch is behind; otherwise
 * a merge commit — never a rebase, because task branches and records name
 * integration commits. A conflict aborts the merge and leaves the ref where it
 * was, so the next launch tries again.
 */
async function followBase(runtime: KernelRuntime): Promise<void> {
  const { goalCheckout } = runtime.paths;
  const baseBranch = runtime.configs.repo.baseBranch;
  const base = (
    await git(runtime.paths.repoRoot, [
      "rev-parse",
      "--verify",
      `${baseBranch}^{commit}`,
    ])
  ).stdout.trim();
  const head = (await git(goalCheckout, ["rev-parse", "HEAD"])).stdout.trim();
  if (await isAncestor(goalCheckout, base, head)) return;

  await runtime.repo.writeLock.runExclusive(async () => {
    if (await isAncestor(goalCheckout, head, base)) {
      await git(goalCheckout, ["merge", "--ff-only", base]);
      return;
    }
    const attempt = await mergeRef(
      goalCheckout,
      base,
      runtime.repo.identityEnv(),
    );
    if (!attempt.ok)
      throw new BaseFollowConflictError(baseBranch, attempt.paths);
  });
}

/**
 * Creates (or recovers) the stable integration checkout. It is the only
 * worktree the merge queue moves; task worktrees are disposable.
 */
/** Removes this goal's leftover task worktrees and merge scratch. */
async function removeOwnWorktrees(
  runtime: KernelRuntime,
  goalCheckout: string,
  ownTasks: string,
  ownScratch: string,
): Promise<void> {
  const { repoRoot } = runtime.paths;
  // Recovery owns this goal's worktrees only: a sibling goal's checkout and
  // task worktrees, and another repo sharing the root, are not ours to remove.
  for (const wt of await registeredWorktrees(runtime)) {
    const resolved = path.resolve(wt);
    if (
      resolved === path.resolve(goalCheckout) ||
      resolved === path.resolve(repoRoot)
    )
      continue;
    const own =
      resolved === path.resolve(ownScratch) ||
      resolved.startsWith(path.resolve(ownTasks) + path.sep);
    if (!own) continue;
    await git(repoRoot, ["worktree", "remove", "--force", resolved], {
      allowFail: true,
    });
  }
}

/** Creates the integration worktree, or recreates it on the wrong branch. */
async function ensureIntegrationCheckout(
  runtime: KernelRuntime,
  goalCheckout: string,
  integrationBranch: string,
): Promise<void> {
  const { repoRoot } = runtime.paths;
  const registered = (await registeredWorktrees(runtime)).map((p) =>
    path.resolve(p),
  );
  if (!registered.includes(path.resolve(goalCheckout))) {
    if (fs.existsSync(goalCheckout)) {
      fs.rmSync(goalCheckout, { recursive: true, force: true });
    }
    if (await branchExists(runtime, integrationBranch)) {
      await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
    } else {
      const base = runtime.configs.repo.baseBranch;
      await git(repoRoot, [
        "worktree",
        "add",
        "-b",
        integrationBranch,
        goalCheckout,
        base,
      ]);
    }
  }

  const current = await git(
    goalCheckout,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { allowFail: true },
  );
  if (current.code !== 0 || current.stdout.trim() !== integrationBranch) {
    await git(repoRoot, ["worktree", "remove", "--force", goalCheckout], {
      allowFail: true,
    });
    await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
  }
}

/**
 * Creates (or recovers) the stable integration checkout. It is the only
 * worktree the merge queue moves; task worktrees are disposable.
 */
export async function prepareIntegrationCheckout(
  runtime: KernelRuntime,
): Promise<void> {
  const { goalCheckout, integrationBranch } = runtime.paths;
  const goal = path.basename(runtime.paths.goalDir);
  const ownTasks = path.join(goalWorktreeRoot(runtime), `${goal}-tasks`);
  const ownScratch = mergeScratchPath(runtime);
  fs.mkdirSync(goalWorktreeRoot(runtime), { recursive: true });
  await removeOwnWorktrees(runtime, goalCheckout, ownTasks, ownScratch);
  await ensureIntegrationCheckout(runtime, goalCheckout, integrationBranch);
  // A crashed merge must not leave staged or conflicted state for the next launch.
  await git(goalCheckout, ["reset", "--hard", "HEAD"]);
  await git(goalCheckout, ["clean", "-fd"]);
  await followBase(runtime);
}

export interface EnsuredWorktree {
  path: string;
  branch: string;
  created: boolean;
  startPoint: string;
  setup?: SetupResult;
  error?: string;
  /**
   * Creation merge conflicted and stays in progress (MERGE_HEAD) for the
   * first turn to resolve. `head` is the integration head the merge attempted.
   */
  mergeConflict?: { paths: string[]; head: string };
}

/**
 * Setup runs once per worktree, recorded in the worktree's git dir (outside the
 * tree, so it never enters a commit). A crash between `worktree add` and setup
 * therefore still runs setup before the first check.
 */
async function setupMarker(cwd: string): Promise<string | null> {
  const res = await git(cwd, ["rev-parse", "--git-dir"], { allowFail: true });
  if (res.code !== 0) return null;
  return path.join(path.resolve(cwd, res.stdout.trim()), "factory-setup-done");
}

/**
 * Branches from the integration head at dispatch time (never at plan time).
 * A task with `base` continues a parked task from its kept branch tip, then
 * merges the integration head into the new branch: tools and fixes merged since
 * the park are present, and review diffs from the integration head so the
 * carried parked commits are in the diff. `startPoint` is that head.
 */
interface WorktreeCreation {
  startPoint: string;
  conflict?: { paths: string[]; head: string };
}

/** Adds the task worktree and, for a continuation, merges the head into it. */
async function createTaskWorktree(
  runtime: KernelRuntime,
  task: TaskFile,
  wtPath: string,
  branch: string,
  startSha: string,
  startPoint: string,
): Promise<WorktreeCreation> {
  if (fs.existsSync(wtPath)) {
    fs.rmSync(wtPath, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  let current = startPoint;
  let conflict: WorktreeCreation["conflict"];
  await runtime.repo.writeLock.runExclusive(async () => {
    if (await branchExists(runtime, branch)) {
      await git(runtime.paths.repoRoot, ["worktree", "add", wtPath, branch]);
    } else {
      await git(runtime.paths.repoRoot, [
        "worktree",
        "add",
        "-b",
        branch,
        wtPath,
        startSha,
      ]);
    }
    if (!task.base) return;
    // The parked branch is never rewritten: only this continuation branch moves.
    // A conflict stays in progress for the first turn to resolve instead of
    // parking before it; the caller decides (first turn resolves, later parks).
    current = await integrationHead(runtime);
    const attempt = await mergeRef(
      wtPath,
      current,
      runtime.repo.identityEnv(),
      {
        leaveConflict: true,
      },
    );
    if (!attempt.ok) conflict = { paths: attempt.paths, head: current };
  });
  return { startPoint: current, conflict };
}

/** Runs the repo's setup commands once per worktree, unless its marker holds. */
async function ensureSetup(
  runtime: KernelRuntime,
  wtPath: string,
  created: boolean,
): Promise<SetupResult | undefined> {
  if (runtime.configs.repo.setup.length === 0) return undefined;
  const marker = await setupMarker(wtPath);
  if (!created && marker && fs.existsSync(marker)) return undefined;
  const setup = await runWorktreeSetup({
    commands: runtime.configs.repo.setup,
    cwd: wtPath,
  });
  if (setup.ok && marker) {
    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  }
  return setup;
}

/** The result for a task branch whose start point does not exist. */
function missingBranchWorktree(
  wtPath: string,
  branch: string,
  branchPoint: string,
): EnsuredWorktree {
  return {
    path: wtPath,
    branch,
    created: false,
    startPoint: branchPoint,
    error: `branch "${branchPoint}" does not exist`,
  };
}

/** The result for a created worktree whose setup failed. */
function failedSetupWorktree(
  wtPath: string,
  branch: string,
  created: boolean,
  startPoint: string,
  setup: SetupResult,
): EnsuredWorktree {
  return {
    path: wtPath,
    branch,
    created,
    startPoint,
    setup,
    error: setup.error,
  };
}

export async function ensureTaskWorktree(
  runtime: KernelRuntime,
  task: TaskFile,
): Promise<EnsuredWorktree> {
  const branch = taskBranchName(runtime, task.slug);
  const wtPath = taskWorktreePath(runtime, task.slug);
  const branchPoint = task.base
    ? taskBranchName(runtime, task.base)
    : runtime.paths.integrationBranch;

  const branchPointExists = await branchExists(runtime, branchPoint);
  if (!branchPointExists)
    return missingBranchWorktree(wtPath, branch, branchPoint);
  const startSha = (
    await git(runtime.paths.repoRoot, ["rev-parse", branchPoint])
  ).stdout.trim();
  let startPoint = task.base ? await integrationHead(runtime) : startSha;

  const registered = (await registeredWorktrees(runtime)).map((p) =>
    path.resolve(p),
  );
  let created = false;
  let conflict: WorktreeCreation["conflict"];
  if (!registered.includes(path.resolve(wtPath))) {
    const worktree = await createTaskWorktree(
      runtime,
      task,
      wtPath,
      branch,
      startSha,
      startPoint,
    );
    startPoint = worktree.startPoint;
    conflict = worktree.conflict;
    created = true;
  }

  const setup = await ensureSetup(runtime, wtPath, created);
  if (setup && !setup.ok) {
    if (conflict) await abortInFlightMerge(wtPath);
    return failedSetupWorktree(wtPath, branch, created, startPoint, setup);
  }
  return {
    path: wtPath,
    branch,
    created,
    startPoint,
    setup,
    ...(conflict ? { mergeConflict: conflict } : {}),
  };
}

/** Head of the task worktree; also used as the reviewer's diff head. */
export async function headSha(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "HEAD"])).stdout.trim();
}

interface WorktreeState {
  branch: string;
  head: string;
  status: string;
}

export interface ContainmentOptions {
  /**
   * Task turns check the goal artifacts and read merge records to explain a
   * checkout move. A boundary turn runs in the integration checkout under the
   * merge lock and owns the goal artifacts (the plan, the tasks, the digest),
   * so it skips both the artifact state and the merge-record lookup; the
   * checkout identity checks still run.
   */
  mode?: "task" | "boundary";
}

export interface ContainmentSnapshot {
  branch: string;
  /** Wall-clock start; a record spanning it may still write goal artifacts. */
  at: string;
  /** Record sequences open at the snapshot; their close is not the turn's write. */
  inFlight: ReadonlySet<number>;
  /** Highest record sequence the snapshot saw; higher ones opened after it did. */
  maxSeq: number;
  /** Record directories already sealed at the snapshot; their files are history. */
  sealed: ReadonlySet<string>;
  /**
   * Every goal artifact except the operator's mailbox channels: path -> hash.
   * Empty in boundary mode, which skips the artifact state.
   */
  artifacts: ReadonlyMap<string, string>;
  /** The integration branch ref; the merge queue advances it after a merge record. */
  integration: string;
  /** The main checkout: the operator owns it, so a change is an incident, not a breach. */
  root: WorktreeState;
  /** The integration checkout; the merge queue moves its HEAD legitimately. */
  checkout: WorktreeState;
}

/**
 * Porcelain lines outside the artifact root. A same-repo artifact commit
 * changes the main checkout's HEAD and dirty set; both are the store's writes,
 * not the operator's, so containment compares only what lies outside the store.
 */
function statusOutsideArtifacts(
  status: string,
  repoRoot: string,
  artifactRoot: string,
): string {
  const rel = path.relative(repoRoot, artifactRoot).split(path.sep).join("/");
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return status;
  return status
    .split("\n")
    .filter((line) => {
      const file = line.slice(3);
      return file !== rel && !file.startsWith(`${rel}/`);
    })
    .join("\n");
}

async function worktreeState(dir: string): Promise<WorktreeState> {
  const branch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"], {
    allowFail: true,
  });
  const head = await git(dir, ["rev-parse", "HEAD"], { allowFail: true });
  const status = await git(dir, ["status", "--porcelain"], { allowFail: true });
  return {
    branch: branch.stdout.trim(),
    head: head.stdout.trim(),
    status: status.stdout,
  };
}

/**
 * The operator's mailbox channels: a steer may arrive, be archived or answered
 * while a turn runs, and those writes are never the task's.
 */
const OPERATOR_CHANNELS = new Set([
  "mailbox/inbox",
  "mailbox/processed",
  "mailbox/outbox",
]);

/** Directory entries, or undefined when the directory vanished. */
function readEntries(abs: string): fs.Dirent[] | undefined {
  try {
    return fs.readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** A file's hash, or undefined when another writer removed it. */
function fileHash(abs: string): string | undefined {
  try {
    return createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  } catch (err) {
    // Another writer may remove a file between readdir and read.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

function walkArtifacts(
  abs: string,
  rel: string,
  files: Map<string, string>,
): void {
  const entries = readEntries(abs);
  if (!entries) return;
  for (const entry of entries) {
    const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (OPERATOR_CHANNELS.has(childRel)) continue;
    const childAbs = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      walkArtifacts(childAbs, childRel, files);
    } else if (entry.isFile()) {
      const hash = fileHash(childAbs);
      if (hash !== undefined) files.set(childRel, hash);
    }
  }
}

/** Hashes of every goal artifact except the operator's mailbox channels. */
function artifactState(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  walkArtifacts(dir, "", files);
  return files;
}

const RECORD_DIR = /^records\/(\d{5})-/;
const RECORD_FILE = /^(records\/[^/]+)\//;

/** The sequence encoded in a record's goal-relative path, if it names one. */
function recordSeqOf(rel: string): number | undefined {
  const match = RECORD_DIR.exec(rel);
  return match?.[1] ? Number(match[1]) : undefined;
}

/** The record directory a goal-relative path lives in, if it names one. */
function recordDirOf(rel: string): string | undefined {
  return RECORD_FILE.exec(rel)?.[1];
}

/** Records that started before the snapshot and had not closed when it was taken. */
function recordsInFlight(
  records: readonly StepRecord[],
  at: string,
): Set<number> {
  return new Set(
    records
      .filter((r) => r.startedAt <= at && (!r.endedAt || r.endedAt >= at))
      .map((r) => r.seq),
  );
}

/**
 * A steer turn owns the goal surface it edits: the PM writes the plan, task
 * files and holds, and the intent agent writes the intent. Either may run while
 * a task turn is in flight, so its writes are not the task's.
 */
function steerTurnWroteDuring(
  records: readonly StepRecord[],
  at: string,
  now: string,
): boolean {
  return records.some(
    (r) =>
      (r.step === "pm" ||
        r.step === "pm-validate" ||
        r.step === "steer-reconcile" ||
        r.step === "intent") &&
      r.startedAt <= now &&
      (!r.endedAt || r.endedAt >= at),
  );
}

function steerTurnOwned(rel: string): boolean {
  return (
    isPlanPath(rel) ||
    rel === "intent.md" ||
    rel.startsWith("tasks/") ||
    rel.startsWith("mailbox/holds/")
  );
}

/**
 * A kernel write is declared before its bytes land. It explains a change only
 * when its bytes landed at or after the snapshot: one that finished before the
 * turn started is already in the before state, so a later change to the same
 * path is the turn's. A write still in flight at the check has no end yet and
 * is the kernel's half-written file. The atomic writer leaves its temporary
 * sibling beside the target; both names are the declared path.
 */
function kernelDeclared(
  rel: string,
  writes: readonly DeclaredWrite[],
  at: string,
): boolean {
  return writes.some(
    (write) =>
      (write.endedAt === undefined || write.endedAt >= at) &&
      (write.rel === rel || rel.startsWith(`${write.rel}.tmp.`)),
  );
}

/**
 * A turn may write only its own outcome file. A record directory that belongs
 * to a record the snapshot never saw (this turn's own included) or still open
 * at the snapshot is the script's or another turn's; a directory no record
 * explains, and a seen unsealed record's files, are the turn's write. A record
 * sealed at the snapshot is history and is never attributed. Unseen means a
 * higher sequence, never a later timestamp: a sibling that opens across the
 * snapshot's record read stamps before it but lands after.
 */
function artifactBreaches(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  opts: {
    at: string;
    maxSeq: number;
    inFlight: ReadonlySet<number>;
    sealed: ReadonlySet<string>;
    records: readonly StepRecord[];
    declared: readonly DeclaredWrite[];
    steerActive: boolean;
  },
): string[] {
  const live = new Map<number, StepRecord>();
  for (const record of opts.records) live.set(record.seq, record);
  const ignored = (rel: string): boolean => {
    if (kernelDeclared(rel, opts.declared, opts.at)) return true;
    if (opts.steerActive && steerTurnOwned(rel)) return true;
    const dir = recordDirOf(rel);
    if (dir !== undefined && opts.sealed.has(dir)) return true;
    const seq = recordSeqOf(rel);
    if (seq === undefined) return false;
    // The store allocates sequences under one lock, so a record the read
    // missed has a higher sequence than every record it saw. It exists by
    // check time; a forged directory names no record and still breaches.
    if (seq > opts.maxSeq) return live.has(seq);
    if (!live.has(seq)) return false;
    return opts.inFlight.has(seq);
  };
  const changed: string[] = [];
  for (const [rel, hash] of after) {
    if (ignored(rel)) continue;
    const previous = before.get(rel);
    if (previous === undefined) changed.push(`created ${rel}`);
    else if (previous !== hash) changed.push(`changed ${rel}`);
  }
  for (const rel of before.keys()) {
    if (!after.has(rel) && !ignored(rel)) changed.push(`removed ${rel}`);
  }
  return changed;
}

function summarizePaths(paths: readonly string[]): string {
  const shown = paths.slice(0, 5).join(", ");
  return paths.length > 5 ? `${shown} and ${paths.length - 5} more` : shown;
}

/** An outside change the task did not make: a visible record, never a park. */
async function appendContainmentIncident(
  runtime: KernelRuntime,
  taskWorktree: string,
  records: readonly StepRecord[] | undefined,
  cause: Cause,
): Promise<void> {
  const slug = path.basename(taskWorktree);
  const all = records ?? (await runtime.store.listRecords());
  const own = all.filter((r) => r.slug === slug);
  const latest = own.at(-1);
  const iteration =
    latest?.iteration ?? all.reduce((max, r) => Math.max(max, r.iteration), 0);
  await runtime.store.appendRecord(
    {
      iteration,
      step: "containment",
      round: latest?.round ?? 1,
      actor: "script",
      slug,
    },
    { ok: true, cause },
  );
}

/**
 * The worktree a turn runs in is the only place it may change (implementer.md).
 * The goal artifacts and the integration checkout are shared surfaces a rogue
 * write can damage; sibling task worktrees belong to other live turns and are
 * not attributed here. The main checkout belongs to the operator and is out of
 * scope. Taken before the turn; the settle proves the rest equal.
 */
export async function containmentSnapshot(
  runtime: KernelRuntime,
  taskWorktree: string,
  opts: ContainmentOptions = {},
): Promise<ContainmentSnapshot> {
  const branch = await git(
    taskWorktree,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { allowFail: true },
  );
  // Records read before the stamp and the walk: a sibling close whose files
  // land after the walk then still reads as open (in flight), never as a
  // closed record whose concurrent write would be blamed on the turn.
  const boundary = opts.mode === "boundary";
  const records = boundary ? [] : await runtime.store.listRecords();
  const at = new Date().toISOString();
  const artifacts = boundary
    ? new Map<string, string>()
    : artifactState(runtime.paths.goalDir);
  const integration = await integrationHead(runtime);
  const root = await worktreeState(runtime.paths.repoRoot);
  const checkout = await worktreeState(runtime.paths.goalCheckout);
  return {
    branch: branch.stdout.trim(),
    at,
    inFlight: recordsInFlight(records, at),
    maxSeq: records.reduce((max, r) => Math.max(max, r.seq), 0),
    sealed: sealedRecordDirs(records),
    artifacts,
    integration,
    root,
    checkout,
  };
}

/** Breaches for a checkout/integration head move no merge record explains. */
function integrationBreaches(
  snapshot: ContainmentSnapshot,
  checkout: WorktreeState,
  integration: string,
  mergeExplains: (commit: string) => boolean,
  goalCheckout: string,
): string[] {
  const breaches: string[] = [];
  if (checkout.branch !== snapshot.checkout.branch) {
    breaches.push(
      `HEAD is on "${checkout.branch || "detached"}" in the integration checkout ${goalCheckout}`,
    );
    return breaches;
  }
  if (checkout.head !== snapshot.checkout.head) {
    const head = checkout.head.slice(0, 10);
    if (!mergeExplains(checkout.head)) {
      if (checkout.status !== snapshot.checkout.status) {
        breaches.push(
          `integration branch moved outside the merge queue in ${goalCheckout}: HEAD is ${head}`,
        );
      } else {
        breaches.push(
          `commit on the integration checkout ${goalCheckout}: HEAD moved to ${head}`,
        );
      }
    } else if (integration !== checkout.head && !mergeExplains(integration)) {
      breaches.push(
        `integration branch moved outside the merge queue: HEAD is ${integration.slice(0, 10)}`,
      );
    }
    return breaches;
  }
  if (integration !== snapshot.integration) {
    if (!mergeExplains(integration)) {
      breaches.push(
        `integration branch moved outside the merge queue: HEAD is ${integration.slice(0, 10)}`,
      );
    }
    return breaches;
  }
  if (checkout.status !== snapshot.checkout.status) {
    breaches.push(`files changed outside the worktree in ${goalCheckout}`);
  }
  return breaches;
}

/** Operator moves in the repo root that a turn cannot have made. */
function outsideBreaches(
  root: WorktreeState,
  snapshot: ContainmentSnapshot,
  runtime: KernelRuntime,
): string[] {
  const statusKey = (status: string) =>
    statusOutsideArtifacts(
      status,
      runtime.paths.repoRoot,
      runtime.paths.artifacts.root,
    );
  // A same-repo artifact commit is the store's own write, not the operator's.
  const storeCommit =
    root.head !== snapshot.root.head &&
    runtime.store.committed().includes(root.head) &&
    statusKey(root.status) === statusKey(snapshot.root.status);
  const outside: string[] = [];
  if (!storeCommit && root.head !== snapshot.root.head) {
    outside.push(`HEAD moved in ${runtime.paths.repoRoot}`);
  }
  if (!storeCommit && root.status !== snapshot.root.status) {
    outside.push(`files changed in ${runtime.paths.repoRoot}`);
  }
  return outside;
}

/** Text for the park cause when a turn left its worktree; undefined when contained. */
/** The branch-identity breach, if the turn left its task branch. */
async function taskBranchBreach(
  taskWorktree: string,
  expectedBranch: string,
  snapshot: ContainmentSnapshot,
): Promise<string | undefined> {
  const branch = await git(
    taskWorktree,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { allowFail: true },
  );
  const now = branch.stdout.trim();
  if (snapshot.branch === expectedBranch && now === expectedBranch)
    return undefined;
  return `HEAD is on "${now || "detached"}", not the task branch "${expectedBranch}"`;
}

/** Goal artifacts the turn wrote outside its worktree. */
function changedArtifactBreaches(
  runtime: KernelRuntime,
  snapshot: ContainmentSnapshot,
  records: StepRecord[] | undefined,
  artifacts: ReadonlyMap<string, string> | undefined,
): string[] {
  if (artifacts === undefined || records === undefined) return [];
  const changed = artifactBreaches(snapshot.artifacts, artifacts, {
    at: snapshot.at,
    maxSeq: snapshot.maxSeq,
    inFlight: snapshot.inFlight,
    sealed: snapshot.sealed,
    records,
    declared: runtime.store.declaredWrites(),
    steerActive: steerTurnWroteDuring(
      records,
      snapshot.at,
      new Date().toISOString(),
    ),
  });
  return changed.length === 0
    ? []
    : [
        `goal artifacts changed outside the worktree in ${runtime.paths.goalDir}: ${summarizePaths(changed)}`,
      ];
}

/** Operator moves in the repo root are incidents, not turn breaches. */
async function recordOutsideChanges(
  runtime: KernelRuntime,
  taskWorktree: string,
  records: StepRecord[] | undefined,
  snapshot: ContainmentSnapshot,
): Promise<void> {
  // The operator may commit or edit in the main checkout while a turn runs. The
  // task cannot have made that change and must still merge; record it instead.
  const root = await worktreeState(runtime.paths.repoRoot);
  const outside = outsideBreaches(root, snapshot, runtime);
  if (outside.length === 0) return;
  await appendContainmentIncident(
    runtime,
    taskWorktree,
    records,
    makeCause("outside-change", outside.join("; ")),
  );
}

export async function containmentViolation(
  runtime: KernelRuntime,
  taskWorktree: string,
  expectedBranch: string,
  snapshot: ContainmentSnapshot,
  opts: ContainmentOptions = {},
): Promise<string | undefined> {
  const breaches: string[] = [];
  const branchBreach = await taskBranchBreach(
    taskWorktree,
    expectedBranch,
    snapshot,
  );
  if (branchBreach) breaches.push(branchBreach);

  // Read the shared surfaces before the records: a merge record or a PM record
  // is written before its owner moves the ref, resets the checkout or edits the
  // goal, so records read last explain every move those reads can see.
  const checkout = await worktreeState(runtime.paths.goalCheckout);
  const integration = await integrationHead(runtime);
  const boundary = opts.mode === "boundary";
  const artifacts = boundary ? undefined : artifactState(runtime.paths.goalDir);
  // A boundary turn holds the merge lock, so no merge can move the checkout
  // while it runs: a move the lock did not explain is the turn's own.
  const records = boundary ? undefined : await runtime.store.listRecords();
  const mergeExplains = (commit: string): boolean =>
    records?.some(
      (r) => r.step === "merge" && r.ok !== false && r.commit === commit,
    ) ?? false;

  breaches.push(
    ...changedArtifactBreaches(runtime, snapshot, records, artifacts),
  );

  // The merge queue moves this checkout's HEAD and resets it; a move recorded
  // as a merge is the queue's, not the turn's.
  breaches.push(
    ...integrationBreaches(
      snapshot,
      checkout,
      integration,
      mergeExplains,
      runtime.paths.goalCheckout,
    ),
  );

  await recordOutsideChanges(runtime, taskWorktree, records, snapshot);
  return breaches.length > 0 ? breaches.join("; ") : undefined;
}

/**
 * The merge queue's scratch worktree: detached at the integration head, so a
 * squash commit can be gated without touching the stable goal checkout.
 */
function mergeScratchPath(runtime: KernelRuntime): string {
  const goal = path.basename(runtime.paths.goalDir);
  return path.join(goalWorktreeRoot(runtime), `${goal}-merge`);
}

export async function removeMergeScratch(
  runtime: KernelRuntime,
): Promise<void> {
  const scratch = mergeScratchPath(runtime);
  await runtime.repo.writeLock.runExclusive(async () => {
    await git(
      runtime.paths.repoRoot,
      ["worktree", "remove", "--force", scratch],
      { allowFail: true },
    );
    await git(runtime.paths.repoRoot, ["worktree", "prune"], {
      allowFail: true,
    });
  });
  if (fs.existsSync(scratch))
    fs.rmSync(scratch, { recursive: true, force: true });
}

export async function resetMergeScratch(
  runtime: KernelRuntime,
  head: string,
): Promise<string> {
  const scratch = mergeScratchPath(runtime);
  await removeMergeScratch(runtime);
  fs.mkdirSync(path.dirname(scratch), { recursive: true });
  await runtime.repo.writeLock.runExclusive(() =>
    git(runtime.paths.repoRoot, ["worktree", "add", "--detach", scratch, head]),
  );
  return scratch;
}
