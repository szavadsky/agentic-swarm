import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isAncestor } from "../core/git/commit.js";
import { git, GitError } from "../core/git/exec.js";
import { parseWorktreeList } from "../core/git/status.js";
import { runWorktreeSetup, type SetupResult } from "../core/checks/setup.js";
import type { KernelRuntime, StepRecord, TaskFile } from "./types.js";

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
  const res = await git(runtime.paths.repoRoot, ["rev-parse", runtime.paths.integrationBranch]);
  return res.stdout.trim();
}

export async function branchExists(runtime: KernelRuntime, branch: string): Promise<boolean> {
  const res = await git(runtime.paths.repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
    allowFail: true,
  });
  return res.code === 0;
}

/** Tree of HEAD, the no-progress component of a committed step. */
export async function treeSha(cwd: string): Promise<string> {
  const res = await git(cwd, ["rev-parse", "HEAD^{tree}"]);
  return res.stdout.trim();
}

async function registeredWorktrees(runtime: KernelRuntime): Promise<string[]> {
  const res = await git(runtime.paths.repoRoot, ["worktree", "list", "--porcelain"]);
  return parseWorktreeList(res.stdout);
}

/** A base advance that cannot merge cleanly into the integration branch. */
export class BaseFollowConflictError extends Error {
  constructor(
    baseBranch: string,
    readonly paths: string[]
  ) {
    const named = paths.length > 0 ? paths.join(", ") : "git reported no unmerged paths";
    super(
      `base "${baseBranch}" conflicts with the integration branch in: ${named}; ` +
        "the integration branch was left untouched — resolve the conflict on base and relaunch"
    );
    this.name = "BaseFollowConflictError";
  }
}

/** Clears a merge left in flight before it can block the next one; true when there was one. */
async function abortInFlightMerge(cwd: string): Promise<boolean> {
  const mergeHead = await git(cwd, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], { allowFail: true });
  if (mergeHead.code !== 0) return false;
  await git(cwd, ["merge", "--abort"]);
  return true;
}

type MergeAttempt = { ok: true } | { ok: false; paths: string[] };

/**
 * Merges `ref` into the checkout at `cwd`. A conflict aborts the merge so no
 * state is left behind and returns the unmerged paths; any other refusal
 * (merge.ff=only, unrelated histories) leaves no merge state either, and git's
 * own reason is the only diagnosis, so it is thrown.
 */
async function mergeRef(
  cwd: string,
  ref: string,
  env: Record<string, string> | undefined
): Promise<MergeAttempt> {
  const merge = await git(cwd, ["merge", "--no-edit", ref], { allowFail: true, env });
  if (merge.code === 0) return { ok: true };
  const unmerged = await git(cwd, ["diff", "--name-only", "--diff-filter=U"], { allowFail: true });
  const paths = unmerged.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .sort();
  const inFlight = await abortInFlightMerge(cwd);
  if (!inFlight && paths.length === 0) {
    throw new GitError(`merge --no-edit ${ref}`, merge.code, merge.stderr, merge.stdout);
  }
  return { ok: false, paths };
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
  const base = (await git(runtime.paths.repoRoot, ["rev-parse", "--verify", `${baseBranch}^{commit}`])).stdout.trim();
  const head = (await git(goalCheckout, ["rev-parse", "HEAD"])).stdout.trim();
  if (await isAncestor(goalCheckout, base, head)) return;

  await runtime.repo.writeLock.runExclusive(async () => {
    if (await isAncestor(goalCheckout, head, base)) {
      await git(goalCheckout, ["merge", "--ff-only", base]);
      return;
    }
    const attempt = await mergeRef(goalCheckout, base, runtime.repo.identityEnv());
    if (!attempt.ok) throw new BaseFollowConflictError(baseBranch, attempt.paths);
  });
}

/**
 * Creates (or recovers) the stable integration checkout. It is the only
 * worktree the merge queue moves; task worktrees are disposable.
 */
export async function prepareIntegrationCheckout(runtime: KernelRuntime): Promise<void> {
  const { repoRoot, goalCheckout, integrationBranch } = runtime.paths;
  const goal = path.basename(runtime.paths.goalDir);
  const ownTasks = path.join(goalWorktreeRoot(runtime), `${goal}-tasks`);
  const ownScratch = mergeScratchPath(runtime);
  fs.mkdirSync(goalWorktreeRoot(runtime), { recursive: true });

  // Recovery owns this goal's worktrees only: a sibling goal's checkout and
  // task worktrees, and another repo sharing the root, are not ours to remove.
  for (const wt of await registeredWorktrees(runtime)) {
    const resolved = path.resolve(wt);
    if (resolved === path.resolve(goalCheckout) || resolved === path.resolve(repoRoot)) continue;
    const own = resolved === path.resolve(ownScratch) || resolved.startsWith(path.resolve(ownTasks) + path.sep);
    if (!own) continue;
    await git(repoRoot, ["worktree", "remove", "--force", resolved], { allowFail: true });
  }

  const registered = (await registeredWorktrees(runtime)).map((p) => path.resolve(p));
  if (!registered.includes(path.resolve(goalCheckout))) {
    if (fs.existsSync(goalCheckout)) {
      fs.rmSync(goalCheckout, { recursive: true, force: true });
    }
    if (await branchExists(runtime, integrationBranch)) {
      await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
    } else {
      const base = runtime.configs.repo.baseBranch;
      await git(repoRoot, ["worktree", "add", "-b", integrationBranch, goalCheckout, base]);
    }
  }

  const current = await git(goalCheckout, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  if (current.code !== 0 || current.stdout.trim() !== integrationBranch) {
    await git(repoRoot, ["worktree", "remove", "--force", goalCheckout], { allowFail: true });
    await git(repoRoot, ["worktree", "add", goalCheckout, integrationBranch]);
  }
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
export async function ensureTaskWorktree(runtime: KernelRuntime, task: TaskFile): Promise<EnsuredWorktree> {
  const branch = taskBranchName(runtime, task.slug);
  const wtPath = taskWorktreePath(runtime, task.slug);
  const branchPoint = task.base ? taskBranchName(runtime, task.base) : runtime.paths.integrationBranch;

  const branchPointExists = await branchExists(runtime, branchPoint);
  if (!branchPointExists) {
    return {
      path: wtPath,
      branch,
      created: false,
      startPoint: branchPoint,
      error: `branch "${branchPoint}" does not exist`,
    };
  }
  const startSha = (await git(runtime.paths.repoRoot, ["rev-parse", branchPoint])).stdout.trim();
  let startPoint = task.base ? await integrationHead(runtime) : startSha;

  const registered = (await registeredWorktrees(runtime)).map((p) => path.resolve(p));
  let created = false;
  let conflict: string[] | undefined;
  if (!registered.includes(path.resolve(wtPath))) {
    if (fs.existsSync(wtPath)) fs.rmSync(wtPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    await runtime.repo.writeLock.runExclusive(async () => {
      if (await branchExists(runtime, branch)) {
        await git(runtime.paths.repoRoot, ["worktree", "add", wtPath, branch]);
      } else {
        await git(runtime.paths.repoRoot, ["worktree", "add", "-b", branch, wtPath, startSha]);
      }
      if (!task.base) return;
      // The parked branch is never rewritten: only this continuation branch moves.
      startPoint = await integrationHead(runtime);
      const attempt = await mergeRef(wtPath, startPoint, runtime.repo.identityEnv());
      if (!attempt.ok) conflict = attempt.paths;
    });
    created = true;
  }
  if (conflict) {
    const named = conflict.length > 0 ? conflict.join(", ") : "git reported no unmerged paths";
    return { path: wtPath, branch, created, startPoint, error: `base-conflict: ${named}` };
  }

  let setup: SetupResult | undefined;
  if (runtime.configs.repo.setup.length > 0) {
    const marker = await setupMarker(wtPath);
    if (created || !marker || !fs.existsSync(marker)) {
      setup = await runWorktreeSetup({ commands: runtime.configs.repo.setup, cwd: wtPath });
      if (!setup.ok) {
        return { path: wtPath, branch, created, startPoint, setup, error: setup.error };
      }
      if (marker) fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    }
  }
  return { path: wtPath, branch, created, startPoint, setup };
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

export interface ContainmentSnapshot {
  branch: string;
  /** Wall-clock start; a record spanning it may still write goal artifacts. */
  at: string;
  /** Record sequences open at the snapshot; their close is not the turn's write. */
  inFlight: ReadonlySet<number>;
  /** Every goal artifact except the operator's mailbox channels: path -> hash. */
  artifacts: ReadonlyMap<string, string>;
  /** The integration branch ref; the merge queue advances it after a merge record. */
  integration: string;
  /** The main checkout: the operator owns it, so a change is an incident, not a breach. */
  root: WorktreeState;
  /** The integration checkout; the merge queue moves its HEAD legitimately. */
  checkout: WorktreeState;
}

async function worktreeState(dir: string): Promise<WorktreeState> {
  const branch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  const head = await git(dir, ["rev-parse", "HEAD"], { allowFail: true });
  const status = await git(dir, ["status", "--porcelain"], { allowFail: true });
  return { branch: branch.stdout.trim(), head: head.stdout.trim(), status: status.stdout };
}

/**
 * The operator's mailbox channels: a steer may arrive, be archived or answered
 * while a turn runs, and those writes are never the task's.
 */
const OPERATOR_CHANNELS = new Set(["mailbox/inbox", "mailbox/processed", "mailbox/outbox"]);

/** Hashes of every goal artifact except the operator's mailbox channels. */
function artifactState(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (abs: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (OPERATOR_CHANNELS.has(childRel)) continue;
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.isFile()) {
        try {
          files.set(childRel, createHash("sha256").update(fs.readFileSync(childAbs)).digest("hex"));
        } catch (err) {
          // Another writer may remove a file between readdir and read.
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      }
    }
  };
  walk(dir, "");
  return files;
}

const RECORD_DIR = /^records\/(\d{5})-/;

/** The sequence encoded in a record's goal-relative path, if it names one. */
function recordSeqOf(rel: string): number | undefined {
  const match = RECORD_DIR.exec(rel);
  return match?.[1] ? Number(match[1]) : undefined;
}

/** Records that started before the snapshot and had not closed when it was taken. */
function recordsInFlight(records: readonly StepRecord[], at: string): Set<number> {
  return new Set(
    records
      .filter((r) => r.startedAt <= at && (!r.endedAt || r.endedAt >= at))
      .map((r) => r.seq)
  );
}

/**
 * The PM owns the plan, the task files and the holds, and a steer turn may run
 * while a task turn is in flight. Its writes are not the task's.
 */
function pmWroteDuring(records: readonly StepRecord[], at: string, now: string): boolean {
  return records.some(
    (r) =>
      (r.step === "pm" || r.step === "pm-validate" || r.step === "steer-reconcile") &&
      r.startedAt <= now &&
      (!r.endedAt || r.endedAt >= at)
  );
}

function pmOwned(rel: string): boolean {
  return rel === "plan.md" || rel.startsWith("tasks/") || rel.startsWith("mailbox/holds/");
}

/**
 * A turn may write only its own outcome file. A record directory that belongs
 * to a record started during the turn (this turn's own included) or still open
 * at the snapshot is the script's or another turn's; a directory no record
 * explains, and a closed record's files, are the turn's write.
 */
function artifactBreaches(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  opts: { at: string; inFlight: ReadonlySet<number>; records: readonly StepRecord[]; pmActive: boolean }
): string[] {
  const live = new Map<number, StepRecord>();
  for (const record of opts.records) live.set(record.seq, record);
  const ignored = (rel: string): boolean => {
    if (opts.pmActive && pmOwned(rel)) return true;
    const seq = recordSeqOf(rel);
    if (seq === undefined) return false;
    const record = live.get(seq);
    if (!record) return false;
    return record.startedAt >= opts.at || opts.inFlight.has(seq);
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
  records: readonly StepRecord[],
  cause: string
): Promise<void> {
  const slug = path.basename(taskWorktree);
  const own = records.filter((r) => r.slug === slug);
  const latest = own.at(-1);
  const iteration = latest?.iteration ?? records.reduce((max, r) => Math.max(max, r.iteration), 0);
  await runtime.store.appendRecord(
    { iteration, step: "containment", round: latest?.round ?? 1, actor: "script", slug },
    { ok: true, cause }
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
  taskWorktree: string
): Promise<ContainmentSnapshot> {
  const branch = await git(taskWorktree, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  // Stamped before the artifact walk: a record that opens or closes while the
  // walk runs is then in flight on one side or the other, never a closed record
  // whose concurrent write would be blamed on the turn.
  const at = new Date().toISOString();
  const artifacts = artifactState(runtime.paths.goalDir);
  const integration = await integrationHead(runtime);
  const root = await worktreeState(runtime.paths.repoRoot);
  const checkout = await worktreeState(runtime.paths.goalCheckout);
  return {
    branch: branch.stdout.trim(),
    at,
    inFlight: recordsInFlight(await runtime.store.listRecords(), at),
    artifacts,
    integration,
    root,
    checkout,
  };
}

/** Text for the park cause when a turn left its worktree; undefined when contained. */
export async function containmentViolation(
  runtime: KernelRuntime,
  taskWorktree: string,
  expectedBranch: string,
  snapshot: ContainmentSnapshot
): Promise<string | undefined> {
  const breaches: string[] = [];
  const branch = await git(taskWorktree, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  const now = branch.stdout.trim();
  if (snapshot.branch !== expectedBranch || now !== expectedBranch) {
    breaches.push(`HEAD is on "${now || "detached"}", not the task branch "${expectedBranch}"`);
  }

  // Read the shared surfaces before the records: a merge record or a PM record
  // is written before its owner moves the ref, resets the checkout or edits the
  // goal, so records read last explain every move those reads can see.
  const checkout = await worktreeState(runtime.paths.goalCheckout);
  const integration = await integrationHead(runtime);
  const artifacts = artifactState(runtime.paths.goalDir);
  const records = await runtime.store.listRecords();
  const mergeExplains = (commit: string): boolean =>
    records.some((r) => r.step === "merge" && r.ok !== false && r.commit === commit);

  const settledAt = new Date().toISOString();
  const changedArtifacts = artifactBreaches(snapshot.artifacts, artifacts, {
    at: snapshot.at,
    inFlight: snapshot.inFlight,
    records,
    pmActive: pmWroteDuring(records, snapshot.at, settledAt),
  });
  if (changedArtifacts.length > 0) {
    breaches.push(
      `goal artifacts changed outside the worktree in ${runtime.paths.goalDir}: ${summarizePaths(changedArtifacts)}`
    );
  }

  // The merge queue moves this checkout's HEAD and resets it; a move recorded
  // as a merge is the queue's, not the turn's. A move no merge record explains
  // is a commit the turn made there. While a merge is between its ref move and
  // its checkout reset, the working tree is not the turn's to explain either.
  if (checkout.branch !== snapshot.checkout.branch) {
    breaches.push(
      `HEAD is on "${checkout.branch || "detached"}" in the integration checkout ${runtime.paths.goalCheckout}`
    );
  } else if (checkout.head !== snapshot.checkout.head) {
    if (!mergeExplains(checkout.head)) {
      if (checkout.status !== snapshot.checkout.status) {
        breaches.push(
          `integration branch moved outside the merge queue in ${runtime.paths.goalCheckout}: HEAD is ${checkout.head.slice(0, 10)}`
        );
      } else {
        breaches.push(
          `commit on the integration checkout ${runtime.paths.goalCheckout}: HEAD moved to ${checkout.head.slice(0, 10)}`
        );
      }
    } else if (integration !== checkout.head && !mergeExplains(integration)) {
      breaches.push(
        `integration branch moved outside the merge queue: HEAD is ${integration.slice(0, 10)}`
      );
    }
  } else if (integration !== snapshot.integration) {
    if (!mergeExplains(integration)) {
      breaches.push(`integration branch moved outside the merge queue: HEAD is ${integration.slice(0, 10)}`);
    }
  } else if (checkout.status !== snapshot.checkout.status) {
    breaches.push(`files changed outside the worktree in ${runtime.paths.goalCheckout}`);
  }

  // The operator may commit or edit in the main checkout while a turn runs. The
  // task cannot have made that change and must still merge; record it instead.
  const root = await worktreeState(runtime.paths.repoRoot);
  const outside: string[] = [];
  if (root.head !== snapshot.root.head) outside.push(`HEAD moved in ${runtime.paths.repoRoot}`);
  if (root.status !== snapshot.root.status) outside.push(`files changed in ${runtime.paths.repoRoot}`);
  if (outside.length > 0) {
    await appendContainmentIncident(runtime, taskWorktree, records, `outside-change: ${outside.join("; ")}`);
  }

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

export async function removeMergeScratch(runtime: KernelRuntime): Promise<void> {
  const scratch = mergeScratchPath(runtime);
  await runtime.repo.writeLock.runExclusive(async () => {
    await git(runtime.paths.repoRoot, ["worktree", "remove", "--force", scratch], { allowFail: true });
    await git(runtime.paths.repoRoot, ["worktree", "prune"], { allowFail: true });
  });
  if (fs.existsSync(scratch)) fs.rmSync(scratch, { recursive: true, force: true });
}

export async function resetMergeScratch(runtime: KernelRuntime, head: string): Promise<string> {
  const scratch = mergeScratchPath(runtime);
  await removeMergeScratch(runtime);
  fs.mkdirSync(path.dirname(scratch), { recursive: true });
  await runtime.repo.writeLock.runExclusive(() =>
    git(runtime.paths.repoRoot, ["worktree", "add", "--detach", scratch, head])
  );
  return scratch;
}
