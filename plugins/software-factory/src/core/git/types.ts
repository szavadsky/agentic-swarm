/** Shapes the git helpers hand back to their callers. */

/** One entry of `git status --porcelain -z`. */
export interface StatusEntry {
  /** Two-letter porcelain code, e.g. " M", "??", "UU", "R ". */
  code: string;
  /** Repo-relative path (rename target for R/C entries). */
  path: string;
  /** Rename source for R/C entries. */
  from?: string;
}
