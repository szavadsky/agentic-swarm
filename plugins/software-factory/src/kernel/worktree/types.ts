/** Worktree, merge-attempt and containment shapes. */

import type { SetupResult } from "../../core/checks/setup.js";
import type { StatusEntry } from "../../core/git/status.js";

export type MergeAttempt = { ok: true } | { ok: false; paths: string[] };

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
 * Branches from the integration head at dispatch time (never at plan time).
 * A task with `base` continues a parked task from its kept branch tip, then
 * merges the integration head into the new branch: tools and fixes merged since
 * the park are present, and review diffs from the integration head so the
 * carried parked commits are in the diff. `startPoint` is that head.
 */
export interface WorktreeCreation {
  startPoint: string;
  conflict?: { paths: string[]; head: string };
}

export interface WorktreeState {
  branch: string;
  head: string;
  /** Unquoted porcelain entries; `-z` keeps unusual paths intact. */
  entries: readonly StatusEntry[];
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
