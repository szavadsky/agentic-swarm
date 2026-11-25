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

export type ResolvePreparation =
  | {
      kind: "conflict";
      head: string;
      conflicts: string[];
      snapshot: ConflictSnapshot;
    }
  | { kind: "clean" }
  | { kind: "error"; cause: string };
