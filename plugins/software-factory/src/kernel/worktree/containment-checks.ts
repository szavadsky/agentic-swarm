/** Containment breaches: integration, store commits, outside writes and task branches. */

import { git } from "../../core/git/exec.js";
import type { StatusEntry } from "../../core/git/status.js";
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
  checkoutWritesAt,
  openCheckoutWrites,
  recordsInFlight,
  statusOutsideArtifacts,
  statusWithoutPaths,
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

/** True when a head move is the store's landing or a merge already on file. */
type MoveExplained = (commit: string) => Promise<boolean>;

/** Breaches for a checkout/integration head move no merge record explains. */
async function integrationBreaches(
  snapshot: ContainmentSnapshot,
  checkout: WorktreeState,
  integration: string,
  mergeExplains: (commit: string) => boolean,
  explained: MoveExplained,
  goalCheckout: string,
  writes: { before: ReadonlySet<string>; now: ReadonlySet<string> },
): Promise<string[]> {
  const breaches: string[] = [];
  if (checkout.branch !== snapshot.checkout.branch) {
    breaches.push(
      `HEAD is on "${checkout.branch || "detached"}" in the integration checkout ${goalCheckout}`,
    );
    return breaches;
  }
  // An intent turn's declared source is not the task's write, so both the
  // before and after status drop that exact entry before they are compared.
  const status = statusWithoutPaths(checkout.entries, writes.now);
  const beforeStatus = statusWithoutPaths(
    snapshot.checkout.entries,
    writes.before,
  );
  const moved = (commit: string) => mergeExplains(commit) || explained(commit);
  if (checkout.head !== snapshot.checkout.head) {
    const head = checkout.head.slice(0, 10);
    if (!(await moved(checkout.head))) {
      if (!sameStatus(status, beforeStatus)) {
        breaches.push(
          `integration branch moved outside the merge queue in ${goalCheckout}: HEAD is ${head}`,
        );
      } else {
        breaches.push(
          `commit on the integration checkout ${goalCheckout}: HEAD moved to ${head}`,
        );
      }
    } else if (integration !== checkout.head && !(await moved(integration))) {
      breaches.push(
        `integration branch moved outside the merge queue: HEAD is ${integration.slice(0, 10)}`,
      );
    }
    return breaches;
  }
  if (integration !== snapshot.integration) {
    if (!(await moved(integration))) {
      breaches.push(
        `integration branch moved outside the merge queue: HEAD is ${integration.slice(0, 10)}`,
      );
    }
    return breaches;
  }
  if (!sameStatus(status, beforeStatus)) {
    breaches.push(`files changed outside the worktree in ${goalCheckout}`);
  }
  return breaches;
}

/** Two porcelain readings, compared entry for entry. */
function sameStatus(
  a: readonly StatusEntry[],
  b: readonly StatusEntry[],
): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        entry.code === other.code &&
        entry.path === other.path &&
        entry.from === other.from
      );
    })
  );
}

/** True when a commit body carries the store's attribution trailer. */
function storeAuthored(message: string): boolean {
  const marker = `${STORE_COMMIT_TRAILER}: `;
  return message.split("\n").some((line) => line.startsWith(marker));
}

/** True when the commit changes at least one path and every path is declared. */
async function commitOnlyTouches(
  goalCheckout: string,
  commit: string,
  paths: ReadonlySet<string>,
): Promise<boolean> {
  // `diff-tree -z` reports both sides of a rename and never C-quotes a path,
  // so a quote or backslash in the name compares equal to the declared path.
  const diff = await git(
    goalCheckout,
    [
      "diff-tree",
      "--root",
      "-r",
      "--name-only",
      "-z",
      "--no-commit-id",
      commit,
    ],
    { allowFail: true },
  );
  if (diff.code !== 0) return false;
  const changed = diff.stdout.split("\0").filter((file) => file !== "");
  return changed.length > 0 && changed.every((file) => paths.has(file));
}

/**
 * True when every commit from the snapshot head to now is a recorded merge or
 * intent commit, the store's own landing, or a commit that only writes a path
 * an intent turn declared. A same-repo store replays its writes onto the goal
 * branch after a merge, so that head move is the store's, not the turn's.
 */
async function landingExplains(
  goalCheckout: string,
  from: string,
  to: string,
  recordedCommits: ReadonlySet<string>,
  writes: ReadonlySet<string>,
): Promise<boolean> {
  if (from === "" || to === "" || from === to) return false;
  const reachable = await git(
    goalCheckout,
    ["merge-base", "--is-ancestor", from, to],
    { allowFail: true },
  );
  if (reachable.code !== 0) return false;
  const log = await git(
    goalCheckout,
    ["log", "--format=%H%x00%B%x00", `${from}..${to}`],
    { stripNewline: false, allowFail: true },
  );
  if (log.code !== 0) return false;
  const tokens = log.stdout.split("\0");
  let seen = 0;
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const sha = tokens[i]!.trim();
    if (sha === "") continue;
    seen += 1;
    if (recordedCommits.has(sha) || storeAuthored(tokens[i + 1] ?? ""))
      continue;
    if (writes.size > 0 && (await commitOnlyTouches(goalCheckout, sha, writes)))
      continue;
    return false;
  }
  return seen > 0;
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
  const outsideEntries = (state: WorktreeState) =>
    statusOutsideArtifacts(
      state.entries,
      runtime.paths.repoRoot,
      runtime.paths.artifacts.root,
    );
  // A same-repo artifact commit is the store's own write, not the operator's.
  const storeCommit =
    root.head !== snapshot.root.head &&
    sameStatus(outsideEntries(root), outsideEntries(snapshot.root)) &&
    (await storeCommitsOnly(
      runtime.paths.repoRoot,
      snapshot.root.head,
      root.head,
    ));
  const outside: string[] = [];
  if (!storeCommit && root.head !== snapshot.root.head) {
    outside.push(`HEAD moved in ${runtime.paths.repoRoot}`);
  }
  if (!storeCommit && !sameStatus(root.entries, snapshot.root.entries)) {
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

/**
 * The predicates that read a checkout move as the queue's, the store's or the
 * intent turn's. An intent record's commit is the kernel landing the repo file
 * the goal note names, so it explains its own head move like a merge does.
 */
function moveExplanations(
  runtime: KernelRuntime,
  records: StepRecord[] | undefined,
  snapshot: ContainmentSnapshot,
  writes: ReadonlySet<string>,
): {
  mergeExplains: (commit: string) => boolean;
  explained: MoveExplained;
} {
  const mergeExplains = (commit: string): boolean =>
    records?.some(
      (r) =>
        ((r.step === "merge" && r.ok !== false) || r.step === "intent") &&
        r.commit === commit,
    ) ?? false;
  // A same-repo store landing can stack on a merge or an intent commit, so
  // both are recorded landings the range walk may pass through.
  const recordedCommits = new Set(
    records
      ?.filter(
        (r) =>
          ((r.step === "merge" && r.ok !== false) || r.step === "intent") &&
          r.commit,
      )
      .map((r) => r.commit as string) ?? [],
  );
  return {
    mergeExplains,
    explained: (commit) =>
      landingExplains(
        runtime.paths.goalCheckout,
        snapshot.checkout.head,
        commit,
        recordedCommits,
        writes,
      ),
  };
}

/**
 * The goal checkout and artifact breaches a turn's records do not explain.
 * The shared surfaces are read before the records, so a merge or intent record
 * written as its owner moves the ref is seen and explains that move.
 */
async function goalSurfaceBreaches(
  runtime: KernelRuntime,
  snapshot: ContainmentSnapshot,
  boundary: boolean,
): Promise<{ breaches: string[]; records: StepRecord[] }> {
  const checkout = await worktreeState(runtime.paths.goalCheckout);
  const integration = await integrationHead(runtime);
  const artifacts = boundary ? undefined : artifactState(runtime.paths.goalDir);
  const records = await runtime.store.listRecords();
  // A boundary turn holds the merge lock, so no merge can move the checkout
  // while it runs: a move only its own merge or intent record explains is the
  // turn's. Artifacts stay exempt there because the boundary owns them.
  const writes = {
    before: checkoutWritesAt(records, snapshot.at),
    now: openCheckoutWrites(records, new Date().toISOString()),
  };
  const { mergeExplains, explained } = moveExplanations(
    runtime,
    records,
    snapshot,
    writes.now,
  );
  const breaches = await changedArtifactBreaches(
    runtime,
    snapshot,
    boundary ? undefined : records,
    artifacts,
  );
  // The merge queue moves this checkout's HEAD and resets it; a move recorded
  // as a merge or the intent turn's commit is the queue's, not the turn's.
  breaches.push(
    ...(await integrationBreaches(
      snapshot,
      checkout,
      integration,
      mergeExplains,
      explained,
      runtime.paths.goalCheckout,
      writes,
    )),
  );
  return { breaches, records };
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

  const boundary = opts.mode === "boundary";
  const surface = await goalSurfaceBreaches(runtime, snapshot, boundary);
  breaches.push(...surface.breaches);

  await recordOutsideChanges(
    runtime,
    taskWorktree,
    boundary ? undefined : surface.records,
    snapshot,
  );
  return breaches.length > 0 ? breaches.join("; ") : undefined;
}
