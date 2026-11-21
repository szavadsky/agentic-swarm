/** Containment breaches: integration, store commits, outside writes and task branches. */

import { git } from "../../core/git/exec.js";
import { STORE_COMMIT_TRAILER } from "../store-backend.js";
import { sealedRecordDirs } from "../store.js";
import { makeCause } from "../cause.js";
import type { KernelRuntime, StepRecord } from "../types.js";
import type {
  ContainmentOptions,
  ContainmentSnapshot,
  WorktreeState,
} from "./types.js";
import {
  appendContainmentIncident,
  artifactBreaches,
  artifactState,
  recordsInFlight,
  statusOutsideArtifacts,
  steerTurnWroteDuring,
  summarizePaths,
  worktreeState,
} from "./containment-state.js";
import { integrationHead } from "./checkout.js";

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

/** True when a commit body carries the store's attribution trailer. */
function storeAuthored(message: string): boolean {
  const marker = `${STORE_COMMIT_TRAILER}: `;
  return message.split("\n").some((line) => line.startsWith(marker));
}

/**
 * True when every commit from the snapshot head to now is the store's own
 * write. A store commit stacked on an operator commit leaves that operator
 * commit in the range without the trailer, so the range is not exempt.
 */
async function storeCommitsOnly(
  repoRoot: string,
  from: string,
  to: string,
): Promise<boolean> {
  // A rewrite that leaves the snapshot head unreachable is never the store's.
  const reachable = await git(
    repoRoot,
    ["merge-base", "--is-ancestor", from, to],
    { allowFail: true },
  );
  if (reachable.code !== 0) return false;
  const log = await git(
    repoRoot,
    ["log", "--format=%B%x00", `${from}..${to}`],
    {
      allowFail: true,
    },
  );
  if (log.code !== 0) return false;
  const commits = log.stdout.split("\0").filter((body) => body.trim() !== "");
  return commits.length > 0 && commits.every(storeAuthored);
}

/** Operator moves in the repo root that a turn cannot have made. */
async function outsideBreaches(
  root: WorktreeState,
  snapshot: ContainmentSnapshot,
  runtime: KernelRuntime,
): Promise<string[]> {
  const statusKey = (status: string) =>
    statusOutsideArtifacts(
      status,
      runtime.paths.repoRoot,
      runtime.paths.artifacts.root,
    );
  // A same-repo artifact commit is the store's own write, not the operator's.
  const storeCommit =
    root.head !== snapshot.root.head &&
    statusKey(root.status) === statusKey(snapshot.root.status) &&
    (await storeCommitsOnly(
      runtime.paths.repoRoot,
      snapshot.root.head,
      root.head,
    ));
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
  const outside = await outsideBreaches(root, snapshot, runtime);
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
